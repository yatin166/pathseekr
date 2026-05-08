import { injectable, inject } from 'inversify'
import type { Document, DocumentSummary, IndexStats } from '@spyglass/shared'
import type { IDocumentRepository } from '../interfaces/document-repository.interface'
import { DatabaseConnection } from './database'
import { TYPES } from '../container/types'
import { mapDocument, mapDocumentSummary } from './mappers'
import type { RawDocument, RawDocumentSummary } from './schema'
import {DocumentQueries} from "./queries/document-queries";

@injectable()
export class DocumentRepository implements IDocumentRepository {
    constructor(
        @inject(TYPES.DatabaseConnection)
        private readonly connection: DatabaseConnection
    ) {}

    async save(document: Document): Promise<void> {
        const db = this.connection.getDb()
        db.prepare(DocumentQueries.INSERT).run(this.toParams(document))
    }

    async findByPath(sourcePath: string): Promise<Document | null> {
        const db = this.connection.getDb()
        const row = db
            .prepare(DocumentQueries.FIND_BY_PATH)
            .get(sourcePath) as RawDocument | undefined

        return row ? mapDocument(row) : null
    }

    async findById(id: string): Promise<Document | null> {
        const db = this.connection.getDb()
        const row = db
            .prepare(DocumentQueries.FIND_BY_ID)
            .get(id) as RawDocument | undefined

        return row ? mapDocument(row) : null
    }

    async listAll(): Promise<DocumentSummary[]> {
        const db = this.connection.getDb()
        const rows = db
            .prepare(DocumentQueries.LIST_ALL_SUMMARIES)
            .all() as RawDocumentSummary[]

        return rows.map(mapDocumentSummary)
    }

    async updateChecksum(id: string, checksum: string): Promise<void> {
        const db = this.connection.getDb()
        db.prepare(DocumentQueries.UPDATE_CHECKSUM).run({
            id,
            checksum,
            updatedAt: new Date().toISOString(),
        })
    }

    async delete(id: string): Promise<void> {
        const db = this.connection.getDb()
        db.prepare(DocumentQueries.DELETE).run(id)
    }

    async getStats(): Promise<IndexStats> {
        const db = this.connection.getDb()

        const totals = db
            .prepare(DocumentQueries.STATS_TOTALS)
            .get() as { total_documents: number; total_chunks: number }

        const totalEmbeddings = (
            db.prepare(DocumentQueries.STATS_EMBEDDINGS).get() as {
                count: number
            }
        ).count

        const byLanguage = db
            .prepare(DocumentQueries.STATS_BY_LANGUAGE)
            .all() as Array<{ language: string; count: number }>

        const byChunkType = db
            .prepare(DocumentQueries.STATS_BY_CHUNK_TYPE)
            .all() as Array<{ chunk_type: string; count: number }>

        const lastIndexed = db
            .prepare(DocumentQueries.STATS_LAST_INDEXED)
            .get() as { last_indexed: string | null }

        const dbSize = db
            .prepare(DocumentQueries.STATS_DB_SIZE)
            .get() as { size: number }

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

    private toParams(document: Document): Record<string, unknown> {
        return {
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
            imports: document.imports ? JSON.stringify(document.imports) : null,
        }
    }
}