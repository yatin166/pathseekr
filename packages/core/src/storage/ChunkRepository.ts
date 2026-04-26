import { injectable, inject } from 'inversify'

import type { Chunk, StoredChunk } from '@spyglass/shared'
import type { IChunkRepository } from '../interfaces/IChunkRepository'
import { DatabaseConnection } from './database'
import { TYPES } from '../container/types'

@injectable()
export class ChunkRepository implements IChunkRepository {
    constructor(
        @inject(TYPES.DatabaseConnection)
        private readonly connection: DatabaseConnection
    ) {}

    async save(chunk: Chunk): Promise<void> {
        const db = this.connection.getDb()

        db.prepare(`
      INSERT INTO chunks (
        id, document_id, content, chunk_type,
        language, name, start_line, end_line,
        metadata, created_at
      ) VALUES (
        @id, @documentId, @content, @chunkType,
        @language, @name, @startLine, @endLine,
        @metadata, @createdAt
      )
      ON CONFLICT(id) DO UPDATE SET
        content    = excluded.content,
        metadata   = excluded.metadata
    `).run({
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
        })
    }

    async saveBatch(chunks: Chunk[]): Promise<void> {
        const db = this.connection.getDb()

        const insert = db.prepare(`
      INSERT INTO chunks (
        id, document_id, content, chunk_type,
        language, name, start_line, end_line,
        metadata, created_at
      ) VALUES (
        @id, @documentId, @content, @chunkType,
        @language, @name, @startLine, @endLine,
        @metadata, @createdAt
      )
      ON CONFLICT(id) DO UPDATE SET
        content  = excluded.content,
        metadata = excluded.metadata
    `)

        const insertMany = db.transaction((items: Chunk[]) => {
            for (const chunk of items) {
                insert.run({
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
                })
            }
        })

        insertMany(chunks)
    }

    async saveEmbedding(
        chunkId: string,
        embedding: number[]
    ): Promise<void> {
        const db = this.connection.getDb()

        const buffer = Buffer.from(new Float32Array(embedding).buffer)

        db.prepare(`
      INSERT INTO embeddings (chunk_id, embedding, model_name, dimensions)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(chunk_id) DO UPDATE SET
        embedding  = excluded.embedding,
        model_name = excluded.model_name,
        dimensions = excluded.dimensions
    `).run(chunkId, buffer, 'nomic-embed-text', embedding.length)
    }

    async findById(id: string): Promise<StoredChunk | null> {
        const db = this.connection.getDb()

        const row = db.prepare(`
      SELECT c.*, e.embedding
      FROM chunks c
      LEFT JOIN embeddings e ON e.chunk_id = c.id
      WHERE c.id = ?
    `).get(id) as (RawChunk & { embedding: Buffer | null }) | undefined

        return row ? this.mapRow(row) : null
    }

    async findByDocumentId(documentId: string): Promise<StoredChunk[]> {
        const db = this.connection.getDb()

        const rows = db.prepare(`
      SELECT c.*, e.embedding
      FROM chunks c
      LEFT JOIN embeddings e ON e.chunk_id = c.id
      WHERE c.document_id = ?
      ORDER BY c.start_line ASC
    `).all(documentId) as Array<RawChunk & { embedding: Buffer | null }>

        return rows.map((row) => this.mapRow(row))
    }

    async findUnembedded(): Promise<Chunk[]> {
        const db = this.connection.getDb()

        const rows = db.prepare(`
      SELECT c.*
      FROM chunks c
      LEFT JOIN embeddings e ON e.chunk_id = c.id
      WHERE e.chunk_id IS NULL
      ORDER BY c.created_at ASC
    `).all() as RawChunk[]

        return rows.map((row) => this.mapRow(row))
    }

    async deleteByDocumentId(documentId: string): Promise<void> {
        const db = this.connection.getDb()
        db.prepare(
            'DELETE FROM chunks WHERE document_id = ?'
        ).run(documentId)
    }

    async count(): Promise<number> {
        const db = this.connection.getDb()
        const result = db
            .prepare('SELECT COUNT(*) as count FROM chunks')
            .get() as { count: number }
        return result.count
    }

    private mapRow(
        row: RawChunk & { embedding?: Buffer | null }
    ): StoredChunk {
        const base = {
            id: row.id,
            documentId: row.document_id,
            content: row.content,
            chunkType: row.chunk_type as Chunk['chunkType'],
            language: row.language as Chunk['language'],
            name: row.name,
            startLine: row.start_line,
            endLine: row.end_line,
            metadata: JSON.parse(row.metadata) as Chunk['metadata'],
            createdAt: new Date(row.created_at),
        }

        if (row.embedding) {
            return {
                ...base,
                embedding: Array.from(new Float32Array(row.embedding.buffer)),
            }
        }

        return base
    }
}

interface RawChunk {
    id: string
    document_id: string
    content: string
    chunk_type: string
    language: string
    name: string
    start_line: number
    end_line: number
    metadata: string
    created_at: string
}