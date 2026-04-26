import { injectable, inject } from 'inversify'

import type {
    Document,
    DocumentSummary,
    IndexStats,
} from '@spyglass/shared'
import type { IDocumentRepository } from '../interfaces/IDocumentRepository'
import { DatabaseConnection } from './database'
import { TYPES } from '../container/types'

@injectable()
export class DocumentRepository implements IDocumentRepository {
    constructor(
        @inject(TYPES.DatabaseConnection)
        private readonly connection: DatabaseConnection
    ) {}

    async save(document: Document): Promise<void> {
        const db = this.connection.getDb()

        const stmt = db.prepare(`
            INSERT INTO documents (
                id, source_path, source_type, document_type,
                language, name, checksum, size_bytes,
                chunk_count, job_id, created_at, updated_at
            ) VALUES (
                         @id, @sourcePath, @sourceType, @documentType,
                         @language, @name, @checksum, @sizeBytes,
                         @chunkCount, @jobId, @createdAt, @updatedAt
                     )
                ON CONFLICT(source_path) DO UPDATE SET
                checksum    = excluded.checksum,
                                                size_bytes  = excluded.size_bytes,
                                                chunk_count = excluded.chunk_count,
                                                job_id      = excluded.job_id,
                                                updated_at  = excluded.updated_at
        `)

        stmt.run({
            id: document.id,
            sourcePath: document.sourcePath,
            sourceType: document.sourceType,
            documentType: document.documentType,
            language: document.language,
            name: document.name,
            checksum: document.checksum,
            sizeBytes: document.sizeBytes,
            chunkCount: document.chunkCount,
            jobId: document.jobId,
            createdAt: document.createdAt.toISOString(),
            updatedAt: document.updatedAt.toISOString(),
        })
    }

    async findByPath(sourcePath: string): Promise<Document | null> {
        const db = this.connection.getDb()

        const row = db
            .prepare('SELECT * FROM documents WHERE source_path = ?')
            .get(sourcePath) as RawDocument | undefined

        return row ? this.mapRow(row) : null
    }

    async findById(id: string): Promise<Document | null> {
        const db = this.connection.getDb()

        const row = db
            .prepare('SELECT * FROM documents WHERE id = ?')
            .get(id) as RawDocument | undefined

        return row ? this.mapRow(row) : null
    }

    async listAll(): Promise<DocumentSummary[]> {
        const db = this.connection.getDb()

        const rows = db
            .prepare(`
                SELECT id, name, source_path, language, chunk_count, updated_at
                FROM documents
                ORDER BY updated_at DESC
            `)
            .all() as Array<{
            id: string
            name: string
            source_path: string
            language: string
            chunk_count: number
            updated_at: string
        }>

        return rows.map((row) => ({
            id: row.id,
            name: row.name,
            sourcePath: row.source_path,
            language: row.language,
            chunkCount: row.chunk_count,
            updatedAt: new Date(row.updated_at),
        }))
    }

    async updateChecksum(id: string, checksum: string): Promise<void> {
        const db = this.connection.getDb()

        db.prepare(`
            UPDATE documents
            SET checksum = ?, updated_at = ?
            WHERE id = ?
        `).run(checksum, new Date().toISOString(), id)
    }

    async delete(id: string): Promise<void> {
        const db = this.connection.getDb()
        db.prepare('DELETE FROM documents WHERE id = ?').run(id)
    }

    async getStats(): Promise<IndexStats> {
        const db = this.connection.getDb()

        const totals = db.prepare(`
            SELECT
                COUNT(*) as total_documents,
                COALESCE(SUM(chunk_count), 0) as total_chunks
            FROM documents
        `).get() as { total_documents: number; total_chunks: number }

        const totalEmbeddings = (
            db.prepare('SELECT COUNT(*) as count FROM embeddings').get() as {
                count: number
            }
        ).count

        const byLanguage = db.prepare(`
            SELECT language, COUNT(*) as count
            FROM chunks
            GROUP BY language
        `).all() as Array<{ language: string; count: number }>

        const byChunkType = db.prepare(`
            SELECT chunk_type, COUNT(*) as count
            FROM chunks
            GROUP BY chunk_type
        `).all() as Array<{ chunk_type: string; count: number }>

        const lastIndexed = db.prepare(`
            SELECT MAX(updated_at) as last_indexed FROM documents
        `).get() as { last_indexed: string | null }

        const dbSize = db.prepare(`
            SELECT page_count * page_size as size
            FROM pragma_page_count(), pragma_page_size()
        `).get() as { size: number }

        const base = {
            totalDocuments: totals.total_documents,
            totalChunks: totals.total_chunks,
            totalEmbeddings,
            byLanguage: Object.fromEntries(
                byLanguage.map((r) => [r.language, r.count])
            ),
            byChunkType: Object.fromEntries(
                byChunkType.map((r) => [r.chunk_type, r.count])
            ),
            databaseSizeBytes: dbSize.size,
        }

        if (lastIndexed.last_indexed) {
            return {
                ...base,
                lastIndexedAt: new Date(lastIndexed.last_indexed),
            }
        }

        return base
    }

    private mapRow(row: RawDocument): Document {
        return {
            id: row.id,
            sourcePath: row.source_path,
            sourceType: row.source_type as Document['sourceType'],
            documentType: row.document_type as Document['documentType'],
            language: row.language,
            name: row.name,
            checksum: row.checksum,
            sizeBytes: row.size_bytes,
            chunkCount: row.chunk_count,
            jobId: row.job_id,
            createdAt: new Date(row.created_at),
            updatedAt: new Date(row.updated_at),
        }
    }
}

interface RawDocument {
    id: string
    source_path: string
    source_type: string
    document_type: string
    language: string
    name: string
    checksum: string
    size_bytes: number
    chunk_count: number
    job_id: string
    created_at: string
    updated_at: string
}