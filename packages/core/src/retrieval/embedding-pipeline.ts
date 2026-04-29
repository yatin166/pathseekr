import 'reflect-metadata'
import { injectable, inject } from 'inversify'
import type { IEmbeddingProvider } from '../interfaces/embedding-provider.interface'
import type { IChunkRepository } from '../interfaces/chunk-repository.interface'
import { DatabaseConnection } from '../storage/database'
import { TYPES } from '../container/types'
import { VectorQueries } from './queries/vector-queries'
import { embeddingToBuffer } from '../storage/mappers'

export interface EmbeddingProgress {
    readonly total: number
    readonly processed: number
    readonly percentComplete: number
}

@injectable()
export class EmbeddingPipeline {

    constructor(
        @inject(TYPES.IEmbeddingProvider)
        private readonly embeddingProvider: IEmbeddingProvider,

        @inject(TYPES.IChunkRepository)
        private readonly chunkRepository: IChunkRepository,

        @inject(TYPES.DatabaseConnection)
        private readonly connection: DatabaseConnection
    ) {}

    async embedPending(onProgress?: (progress: EmbeddingProgress) => void): Promise<void> {
        const unembedded = await this.chunkRepository.findUnembedded()
        const total = unembedded.length

        if (total === 0) return

        let processed = 0

        const batchSize = 10

        for (let i = 0; i < unembedded.length; i += batchSize) {
            const batch = unembedded.slice(i, i + batchSize)
            const texts = batch.map((c) => c.content)

            const results = await this.embeddingProvider.embedBatch(
                texts
            )

            const db = this.connection.getDb()
            const insertEmbedding = db.prepare(VectorQueries.INSERT_EMBEDDING)

            const insertMany = db.transaction(() => {
                for (let j = 0; j < batch.length; j++) {
                    const chunk = batch[j]
                    const result = results[j]
                    if (!chunk || !result) {
                        continue
                    }

                    insertEmbedding.run({
                        chunkId: chunk.id,
                        embedding: embeddingToBuffer(result.embedding),
                        modelName: this.embeddingProvider.modelName,
                        dimensions: result.embedding.length,
                    })
                }
            })

            insertMany()

            processed += batch.length

            onProgress?.({
                total,
                processed,
                percentComplete: Math.round((processed / total) * 100),
            })
        }
    }

    // Embed chunks for a specific document
    async embedForDocument(documentId: string): Promise<void> {
        const chunks = await this.chunkRepository.findByDocumentId(
            documentId
        )
        if (chunks.length === 0) return

        const texts = chunks.map((c) => c.content)
        const results = await this.embeddingProvider.embedBatch(texts)

        for (let i = 0; i < chunks.length; i++) {
            const chunk = chunks[i]
            const result = results[i]
            if (!chunk || !result) continue

            await this.chunkRepository.saveEmbedding(chunk.id, result.embedding, this.embeddingProvider.modelName)
        }
    }
}