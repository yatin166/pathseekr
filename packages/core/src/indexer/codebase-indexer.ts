import 'reflect-metadata'
import { injectable, inject } from 'inversify'
import fs from 'fs'
import path from 'path'
import { randomUUID } from 'crypto'
import type { IngestionJob,  IndexingProgress, IndexingPhase, JobStatus, SpyglassConfig } from '@spyglass/shared'
import type { IIndexer, IndexOptions } from '../interfaces/indexer.interface'
import type { IDocumentRepository } from '../interfaces/document-repository.interface'
import type { IChunkRepository } from '../interfaces/chunk-repository.interface'
import { TYPES } from '../container/types'
import { FileScanner } from './file-scanner'
import { ChecksumService } from './checksum-service'
import { ChunkBuilder } from './chunk-builder'
import { ParserRegistry } from '../parsers/parser-registry'
import { BM25IndexBuilder } from "../retrieval/strategies/bm25/bm25-index-builder";
import { EmbeddingIndexBuilder } from "../retrieval/strategies/vector/embedding-index-builder";
import { ProjectMapBuilder } from "./project-map-builder";
import { EdgeBuilder } from "../retrieval/strategies/graph/edge-builder";

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

    async index(sourcePath: string, options: IndexOptions = {}, onProgress?: (progress: IndexingProgress) => void): Promise<IngestionJob> {
        const jobId = randomUUID()
        const absolutePath = path.resolve(sourcePath)
        const startedAt = new Date()
        const parseStart = Date.now()

        let job: IngestionJob = {
            id: jobId,
            sourcePath: absolutePath,
            status: 'scanning',
            phase: 'parsing',
            totalFiles: 0,
            processedFiles: 0,
            totalChunks: 0,
            skippedFiles: 0,
            startedAt,
            createdAt: startedAt,
        }

        try {
            // ── Phase 1: Scan ──────────────────────────────────────────
            const scanStart = Date.now()
            this.emitProgress(job, onProgress)

            const scanResult = this.fileScanner.scan(absolutePath)
            const scanMs = Date.now() - scanStart

            const parsableFiles = scanResult.files.filter((f) =>
                this.parserRegistry.canParse(f.absolutePath)
            )

            job = {
                ...job,
                totalFiles:   parsableFiles.length,
                skippedFiles: scanResult.skippedCount + (scanResult.files.length - parsableFiles.length),
                status:       'parsing',
                phase:        'parsing',
            }

            // Emit parsing start with scanMs so CLI can show scan completion
            onProgress?.({
                jobId:           job.id,
                status:          'parsing',
                phase:           'parsing',
                processedFiles:  0,
                totalFiles:      job.totalFiles,
                totalChunks:     0,
                percentComplete: 0,
                scanMs,
            })

            this.emitProgress(job, onProgress)

            // ── Phase 1: Parse all files ───────────────────────────────
            const concurrency = this.config.indexing.concurrency
            let processedFiles = 0
            let totalChunks = 0

            for (let i = 0; i < parsableFiles.length; i += concurrency) {
                const batch = parsableFiles.slice(i, i + concurrency)

                const results = await Promise.allSettled(
                    batch.map((file) =>
                        this.parseAndStoreFile(
                            file.absolutePath,
                            jobId,
                            options
                        )
                    )
                )

                for (const result of results) {
                    processedFiles++
                    if (result.status === 'fulfilled') {
                        totalChunks += result.value.chunksCreated
                    }
                }

                job = {
                    ...job,
                    processedFiles,
                    totalChunks,
                    status: 'parsing',
                    phase: 'parsing',
                }

                this.emitProgress(job, onProgress)
            }

            const parseMs = Date.now() - parseStart

            // Phase 2: Graph
            const graphStart = Date.now()

            job = {
                ...job,
                status: 'graphing',
                phase: 'graphing',
                processedFiles,
                totalChunks,
                parseMs,
            }

            this.emitProgress(job, onProgress)

            this.edgeBuilder.buildAll()
            await this.projectMapBuilder.build(absolutePath)

            const graphMs = Date.now() - graphStart
            job = { ...job, graphMs }

            // Emit graph completion with graphMs so CLI can show it
            onProgress?.({
                jobId: job.id,
                status: 'graphing',
                phase: 'graphing',
                processedFiles: job.processedFiles,
                totalFiles: job.totalFiles,
                totalChunks: job.totalChunks,
                percentComplete: 100,
                graphMs,
            })

            this.emitProgress(job, onProgress)

            // Phase 3: Embed all pending chunks
            if (!options.skipEmbedding) {
                const embedStart = Date.now()

                job = {
                    ...job,
                    status: 'embedding',
                    phase: 'embedding',
                }

                this.emitProgress(job, onProgress)

                const unembedded   = await this.chunkRepository.findUnembedded()
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
                    })
                })

                const embedMs = Date.now() - embedStart

                job = { ...job, embedMs }
            }

            // Complete
            job = {
                ...job,
                status: 'completed',
                phase: options.skipEmbedding ? 'graphing' : 'embedding',
                completedAt:  new Date(),
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
                errorMessage:
                    err instanceof Error ? err.message : String(err),
            }
            this.emitProgress(job, onProgress)
            return job
        }
    }

    private async parseAndStoreFile(filePath: string, jobId: string, options: IndexOptions): Promise<{ chunksCreated: number }> {
        const content = fs.readFileSync(filePath, 'utf-8')

        const checksumResult = await this.checksumService.check(filePath, content)

        if (checksumResult.status === 'unchanged' && !options.force) {
            return { chunksCreated: 0 }
        }

        if (checksumResult.existingDocumentId && (checksumResult.status === 'changed' || options.force)) {
            await this.chunkRepository.deleteByDocumentId(checksumResult.existingDocumentId)
        }

        const parser = this.parserRegistry.getParser(filePath)
        if (!parser) {
            return { chunksCreated: 0 }
        }

        const parseResult = await parser.parse(filePath, content)
        if (parseResult.chunks.length === 0) {
            return { chunksCreated: 0 }
        }

        const documentId = checksumResult.existingDocumentId ?? randomUUID()

        const document = {
            id: documentId,
            sourcePath: filePath,
            sourceType: 'filesystem' as const,
            documentType: 'code' as const,
            language: parseResult.language,
            name: path.basename(filePath),
            checksum: checksumResult.checksum,
            sizeBytes: Buffer.byteLength(content, 'utf-8'),
            chunkCount: parseResult.chunks.length,
            jobId,
            createdAt: new Date(),
            updatedAt: new Date(),
            imports: parseResult.imports,
        }

        await this.documentRepository.save(document)

        const chunks = this.chunkBuilder.build(parseResult, documentId, filePath)
        await this.chunkRepository.saveBatch(chunks)

        await this.bm25IndexBuilder.buildForDocument(documentId)

        return { chunksCreated: chunks.length }
    }

    private emitProgress(job: IngestionJob, onProgress?: (progress: IndexingProgress) => void): void {
        if (!onProgress) {
            return
        }

        const percentComplete = job.totalFiles === 0
            ? 0
            : Math.round((job.processedFiles / job.totalFiles) * 100)

        onProgress({
            jobId: job.id,
            status: job.status as JobStatus,
            phase: job.phase as IndexingPhase,
            processedFiles: job.processedFiles,
            totalFiles: job.totalFiles,
            totalChunks: job.totalChunks,
            percentComplete,
        })
    }
}