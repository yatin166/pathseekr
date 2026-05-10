import 'reflect-metadata'
import { injectable, inject } from 'inversify'
import fs from 'fs'
import path from 'path'
import { randomUUID } from 'crypto'
import type {
    IngestionJob,
    IndexingProgress,
    IndexingPhase,
    JobStatus,
    SpyglassConfig,
} from '@spyglass/shared'
import type { IIndexer, IndexOptions } from '../interfaces/indexer.interface'
import type { IDocumentRepository } from '../interfaces/document-repository.interface'
import type { IChunkRepository } from '../interfaces/chunk-repository.interface'
import { TYPES } from '../container/types'
import { FileScanner } from './file-scanner'
import { ChecksumService } from './checksum-service'
import { ChunkBuilder } from './chunk-builder'
import { ParserRegistry } from '../parsers/parser-registry'
import { BM25IndexBuilder } from '../retrieval/strategies/bm25/bm25-index-builder'
import { EmbeddingIndexBuilder } from '../retrieval/strategies/vector/embedding-index-builder'
import { ProjectMapBuilder } from './project-map-builder'
import { EdgeBuilder } from '../retrieval/strategies/graph/edge-builder'

interface ParseFileResult {
    readonly chunksCreated: number
    readonly fileStatus: 'new' | 'changed' | 'unchanged'
}

@injectable()
export class CodebaseIndexer implements IIndexer {

    constructor(
        @inject(TYPES.SpyglassConfig)
        private readonly config: SpyglassConfig,

        @inject(TYPES.IDocumentRepository)
        private readonly documentRepository: IDocumentRepository,

        @inject(TYPES.IChunkRepository)
        private readonly chunkRepository: IChunkRepository,

        @inject(TYPES.FileScanner)
        private readonly fileScanner: FileScanner,

        @inject(TYPES.ChecksumService)
        private readonly checksumService: ChecksumService,

        @inject(TYPES.ChunkBuilder)
        private readonly chunkBuilder: ChunkBuilder,

        @inject(TYPES.ParserRegistry)
        private readonly parserRegistry: ParserRegistry,

        @inject(TYPES.BM25IndexBuilder)
        private readonly bm25IndexBuilder: BM25IndexBuilder,

        @inject(TYPES.EmbeddingIndexBuilder)
        private readonly embeddingIndexBuilder: EmbeddingIndexBuilder,

        @inject(TYPES.ProjectMapBuilder)
        private readonly projectMapBuilder: ProjectMapBuilder,

        @inject(TYPES.EdgeBuilder)
        private readonly edgeBuilder: EdgeBuilder,
    ) {}

    async index(sourcePath: string, options: IndexOptions = {}, onProgress?: (progress: IndexingProgress) => void,): Promise<IngestionJob> {
        const jobId = randomUUID()
        const absolutePath = path.resolve(sourcePath)
        const startedAt = new Date()

        let job: IngestionJob = {
            id: jobId,
            sourcePath: absolutePath,
            status: 'scanning',
            phase: 'parsing',
            totalFiles: 0,
            processedFiles: 0,
            totalChunks: 0,
            skippedFiles: 0,
            newFiles: 0,
            changedFiles: 0,
            unchangedFiles: 0,
            startedAt,
            createdAt: startedAt,
        }

        try {
            // Phase 1a: Scan
            const scanStart = Date.now()
            this.emitProgress(job, onProgress)

            const scanResult = this.fileScanner.scan(absolutePath)
            const scanMs = Date.now() - scanStart
            const parsableFiles = scanResult.files.filter((f) =>
                this.parserRegistry.canParse(f.absolutePath)
            )

            job = {
                ...job,
                totalFiles: parsableFiles.length,
                skippedFiles: scanResult.skippedCount + (scanResult.files.length - parsableFiles.length),
                skippedReasons: scanResult.skippedReasons,
                status: 'parsing',
                phase: 'parsing',
            }

            // Signal scan completion to CLI via scanMs
            onProgress?.({
                jobId: job.id,
                status: 'parsing',
                phase: 'parsing',
                processedFiles: 0,
                totalFiles: job.totalFiles,
                totalChunks: 0,
                percentComplete: 0,
                scanMs,
                newFiles: 0,
                changedFiles: 0,
                unchangedFiles: 0,
            })

            // Phase 1b: Parse + BM25
            const parseStart = Date.now()
            const concurrency = this.config.indexing.concurrency
            let processedFiles = 0
            let totalChunks = 0
            let newFiles = 0
            let changedFiles = 0
            let unchangedFiles = 0
            for (let i = 0; i < parsableFiles.length; i += concurrency) {
                const batch = parsableFiles.slice(i, i + concurrency)

                const results = await Promise.allSettled(
                    batch.map((file) =>
                        this.parseAndStoreFile(file.absolutePath, jobId, options)
                    )
                )

                for (const result of results) {
                    processedFiles++
                    if (result.status === 'fulfilled') {
                        totalChunks += result.value.chunksCreated
                        switch (result.value.fileStatus) {
                            case 'new': newFiles++;       break
                            case 'changed': changedFiles++;   break
                            case 'unchanged': unchangedFiles++; break
                        }
                    }
                }

                job = {
                    ...job,
                    processedFiles,
                    totalChunks,
                    newFiles,
                    changedFiles,
                    unchangedFiles,
                }

                this.emitProgress(job, onProgress)
            }

            const parseMs = Date.now() - parseStart
            const hasChanges = newFiles + changedFiles > 0

            // Phase 2: Graph
            job = {
                ...job,
                status: 'graphing',
                phase: 'graphing',
                processedFiles,
                totalChunks,
                parseMs,
            }

            this.emitProgress(job, onProgress)

            const graphStart = Date.now()

            if (hasChanges) {
                // Skip rebuild if nothing changed — existing edges and
                // project map are still valid
                this.edgeBuilder.buildAll()
                await this.projectMapBuilder.build(absolutePath)
            }

            const graphMs = Date.now() - graphStart
            job = { ...job, graphMs }

            // Signal graph completion to CLI via graphMs
            onProgress?.({
                jobId: job.id,
                status: 'graphing',
                phase: 'graphing',
                processedFiles: job.processedFiles,
                totalFiles: job.totalFiles,
                totalChunks: job.totalChunks,
                percentComplete: 100,
                graphMs,
                newFiles,
                changedFiles,
                unchangedFiles,
            })

            // Phase 3: Embedding
            if (!options.skipEmbedding) {
                const embedStart = Date.now()

                job = { ...job, status: 'embedding', phase: 'embedding' }
                this.emitProgress(job, onProgress)

                const unembedded = await this.chunkRepository.findUnembedded()
                const totalToEmbed = unembedded.length

                await this.embeddingIndexBuilder.embedPending((embedProgress) => {
                    onProgress?.({
                        jobId: job.id,
                        status: 'embedding',
                        phase: 'embedding',
                        processedFiles: job.processedFiles,
                        totalFiles: job.totalFiles,
                        totalChunks: job.totalChunks,
                        percentComplete: embedProgress.percentComplete,
                        processedChunks: embedProgress.processed,
                        totalChunksToEmbed: totalToEmbed,
                        newFiles,
                        changedFiles,
                        unchangedFiles,
                    })
                })

                job = { ...job, embedMs: Date.now() - embedStart }
            }

            // Complete
            job = {
                ...job,
                status: 'completed',
                phase: options.skipEmbedding ? 'graphing' : 'embedding',
                completedAt: new Date(),
                processedFiles,
                totalChunks,
            }

            this.emitProgress(job, onProgress)
            return job

        } catch (err) {
            job = {
                ...job,
                status: 'failed',
                completedAt: new Date(),
                errorMessage: err instanceof Error ? err.message : String(err),
            }
            this.emitProgress(job, onProgress)
            return job
        }
    }

    private async parseAndStoreFile(filePath: string, jobId: string, options: IndexOptions,): Promise<ParseFileResult> {
        const content = fs.readFileSync(filePath, 'utf-8')
        const checksumResult = await this.checksumService.check(filePath, content)

        if (checksumResult.status === 'unchanged' && !options.force) {
            return { chunksCreated: 0, fileStatus: 'unchanged' }
        }

        // Remove stale chunks before reprocessing
        if (checksumResult.existingDocumentId &&
            (checksumResult.status === 'changed' || options.force)) {
            await this.chunkRepository.deleteByDocumentId(checksumResult.existingDocumentId)
        }

        const parser = this.parserRegistry.getParser(filePath)
        if (!parser) {
            // Defensive — should not happen since we pre-filter to parsable files
            return { chunksCreated: 0, fileStatus: 'unchanged' }
        }

        const parseResult = await parser.parse(filePath, content)
        const fileStatus: 'new' | 'changed' = checksumResult.status === 'new' ? 'new' : 'changed'
        const documentId = checksumResult.existingDocumentId ?? randomUUID()

        // Always save the document to record its checksum, even when there
        // are no chunks (e.g. a file with no exported symbols). Without this,
        // such files would be re-parsed on every index run.
        await this.documentRepository.save({
            id: documentId,
            sourcePath: filePath,
            sourceType: 'filesystem',
            documentType: 'code',
            language: parseResult.language,
            name: path.basename(filePath),
            checksum: checksumResult.checksum,
            sizeBytes: Buffer.byteLength(content, 'utf-8'),
            chunkCount: parseResult.chunks.length,
            jobId,
            createdAt: new Date(),
            updatedAt: new Date(),
            imports: parseResult.imports,
        })

        if (parseResult.chunks.length === 0) {
            return { chunksCreated: 0, fileStatus }
        }

        const chunks = this.chunkBuilder.build(parseResult, documentId, filePath)
        await this.chunkRepository.saveBatch(chunks)
        await this.bm25IndexBuilder.buildForDocument(documentId)

        return { chunksCreated: chunks.length, fileStatus }
    }

    private emitProgress(job: IngestionJob, onProgress?: (progress: IndexingProgress) => void): void {
        if (!onProgress) {
            return
        }

        const percentComplete = job.totalFiles === 0
            ? 0
            : Math.min(100, Math.round((job.processedFiles / job.totalFiles) * 100))

        onProgress({
            jobId: job.id,
            status: job.status as JobStatus,
            phase: job.phase as IndexingPhase,
            processedFiles: job.processedFiles,
            totalFiles: job.totalFiles,
            totalChunks: job.totalChunks,
            percentComplete,
            newFiles: job.newFiles,
            changedFiles: job.changedFiles,
            unchangedFiles: job.unchangedFiles,
        })
    }
}