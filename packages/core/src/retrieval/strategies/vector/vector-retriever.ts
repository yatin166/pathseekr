import 'reflect-metadata'
import { injectable, inject } from 'inversify'
import type {RetrievalResult, SearchQuery, SpyglassConfig} from '@spyglass/shared'
import type { IRetriever } from '../../../interfaces/retriever.interface'
import type { IEmbeddingProvider } from '../../../interfaces/embedding-provider.interface'
import { DatabaseConnection } from '../../../storage/database'
import { TYPES } from '../../../container/types'
import { VectorQueries, type RawEmbeddingRow } from './vector-queries'
import { mapRetrievalResult } from '../../shared/mappers'
import { bufferToEmbedding } from '../../../storage/mappers'
import { type RawChunkWithDocument, RetrievalQueries } from "../../shared/retrieval-queries";

@injectable()
export class VectorRetriever implements IRetriever {

    constructor(
        @inject(TYPES.SpyglassConfig)
        private readonly config: SpyglassConfig,

        @inject(TYPES.DatabaseConnection)
        private readonly connection: DatabaseConnection,

        @inject(TYPES.IEmbeddingProvider)
        private readonly embeddingProvider: IEmbeddingProvider
    ) {}

    async isReady(): Promise<boolean> {
        const db = this.connection.getDb()
        await this.verifyDimensions();
        const result = db
            .prepare(VectorQueries.COUNT_EMBEDDED)
            .get() as { count: number }
        return result.count > 0
    }

    async search(query: SearchQuery): Promise<RetrievalResult[]> {
        const db = this.connection.getDb()

        const { embedding: queryEmbedding } = await this.embeddingProvider.embed(query.query)

        // TODO: Optimize it to use an ANN index for larger corpora (e.g. HNSWLib, Faiss, Annoy) for 100k chunks and above
        const rows = db
            .prepare(VectorQueries.ALL_EMBEDDINGS)
            .all() as RawEmbeddingRow[]

        if (rows.length === 0) {
            return []
        }

        // Score each chunk by cosine similarity to the query
        const scored: Array<{ chunkId: string; score: number }> = []

        for (const row of rows) {
            const embedding = bufferToEmbedding(row.embedding)
            const score = this.cosineSimilarity(queryEmbedding, embedding)
            scored.push({ chunkId: row.chunk_id, score })
        }

        scored.sort((a, b) => b.score - a.score)
        const topN = scored.slice(0, query.limit)

        if (topN.length === 0) {
            return []
        }

        const chunkIds = topN.map((s) => s.chunkId)
        const chunkRows = db
            .prepare(RetrievalQueries.CHUNKS_WITH_DOCUMENTS(chunkIds.length))
            .all(...chunkIds) as RawChunkWithDocument[]

        const rowMap = new Map<string, RawChunkWithDocument>(
            chunkRows.map((row) => [row.id, row])
        )

        const results: RetrievalResult[] = []

        for (let i = 0; i < topN.length; i++) {
            const { chunkId, score } = topN[i]!
            const row = rowMap.get(chunkId)
            if (!row) {
                continue
            }

            results.push(mapRetrievalResult(row, score, i + 1, 'vector'))
        }

        return results
    }

    // Cosine similarity between two vectors
    // Returns a value between -1 and 1
    // 1 = identical direction, 0 = orthogonal, -1 = opposite
    private cosineSimilarity(a: number[], b: number[]): number {
        if (a.length !== b.length) {
            return 0
        }

        let dotProduct = 0
        let magnitudeA = 0
        let magnitudeB = 0

        for (let i = 0; i < a.length; i++) {
            const ai = a[i] ?? 0
            const bi = b[i] ?? 0
            dotProduct += ai * bi
            magnitudeA += ai * ai
            magnitudeB += bi * bi
        }

        const magnitude = Math.sqrt(magnitudeA) * Math.sqrt(magnitudeB)
        if (magnitude === 0) {
            return 0
        }

        return dotProduct / magnitude
    }

    private async verifyDimensions(): Promise<boolean> {
        const db = this.connection.getDb()

        const sample = db.prepare(VectorQueries.SELECT_DIMENSIONS).get() as { byte_length: number } | undefined

        if (!sample) {
            return true
        }

        const storedDimensions = sample.byte_length / 4 // Float32 = 4 bytes
        const configuredDimensions = this.config.embedding.dimensions

        if (storedDimensions !== configuredDimensions) {
            throw new Error(
                `Embedding dimension mismatch. ` +
                `Stored: ${storedDimensions}, ` +
                `Configured: ${configuredDimensions}. ` +
                `Delete ~/.spyglass/spyglass.db and re-index.`
            )
        }

        return true
    }
}