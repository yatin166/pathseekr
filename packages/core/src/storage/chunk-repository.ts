import { injectable, inject } from 'inversify'
import type { Chunk, StoredChunk } from '@spyglass/shared'
import type { ChunkRepositoryInterface } from '../interfaces/chunk-repository.interface'
import { DatabaseConnection } from './database'
import { TYPES } from '../container/types'
import { mapChunk, mapStoredChunk, embeddingToBuffer } from './mappers'
import type { RawChunk, RawChunkWithEmbedding } from './schema'
import {ChunkQueries} from "./queries/chunk-queries";

@injectable()
export class ChunkRepository implements ChunkRepositoryInterface {
    constructor(
        @inject(TYPES.DatabaseConnection)
        private readonly connection: DatabaseConnection
    ) {}

    async save(chunk: Chunk): Promise<void> {
        const db = this.connection.getDb()
        db.prepare(ChunkQueries.INSERT).run(this.toParams(chunk))
    }

    async saveBatch(chunks: Chunk[]): Promise<void> {
        const db = this.connection.getDb()
        const insert = db.prepare(ChunkQueries.INSERT)

        const insertMany = db.transaction((items: Chunk[]) => {
            for (const chunk of items) {
                insert.run(this.toParams(chunk))
            }
        })

        insertMany(chunks)
    }

    async saveEmbedding(chunkId: string, embedding: number[]): Promise<void> {
        const db = this.connection.getDb()

        db.prepare(ChunkQueries.INSERT_EMBEDDING).run({
            chunkId,
            embedding: embeddingToBuffer(embedding),
            modelName: 'nomic-embed-text',
            dimensions: embedding.length,
        })
    }

    async findById(id: string): Promise<StoredChunk | null> {
        const db = this.connection.getDb()
        const row = db
            .prepare(ChunkQueries.FIND_BY_ID)
            .get(id) as RawChunkWithEmbedding | undefined

        return row ? mapStoredChunk(row) : null
    }

    async findByDocumentId(documentId: string): Promise<StoredChunk[]> {
        const db = this.connection.getDb()
        const rows = db
            .prepare(ChunkQueries.FIND_BY_DOCUMENT_ID)
            .all(documentId) as RawChunkWithEmbedding[]

        return rows.map(mapStoredChunk)
    }

    async findUnembedded(): Promise<Chunk[]> {
        const db = this.connection.getDb()
        const rows = db
            .prepare(ChunkQueries.FIND_UNEMBEDDED)
            .all() as RawChunk[]

        return rows.map(mapChunk)
    }

    async deleteByDocumentId(documentId: string): Promise<void> {
        const db = this.connection.getDb()
        db.prepare(ChunkQueries.DELETE_BY_DOCUMENT_ID).run(documentId)
    }

    async count(): Promise<number> {
        const db = this.connection.getDb()
        const result = db
            .prepare(ChunkQueries.COUNT)
            .get() as { count: number }
        return result.count
    }

    private toParams(chunk: Chunk): Record<string, unknown> {
        return {
            id: chunk.id,
            documentId: chunk.documentId,
            content: chunk.content,
            chunkType: chunk.chunkType,
            language: chunk.language,
            name: chunk.name,
            startLine: chunk.startLine,
            endLine: chunk.endLine,
            metadata: JSON.stringify(chunk.metadata),
            createdAt: chunk.createdAt.toISOString(),
        }
    }
}