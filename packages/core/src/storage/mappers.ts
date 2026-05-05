import type { Chunk, Document, DocumentSummary, StoredChunk } from '@spyglass/shared'
import type { RawChunk, RawChunkWithEmbedding, RawDocument, RawDocumentSummary } from './schema'

// Document mappers

export function mapDocument(row: RawDocument): Document {
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

export function mapDocumentSummary(row: RawDocumentSummary): DocumentSummary {
    return {
        id: row.id,
        name: row.name,
        sourcePath: row.source_path,
        language: row.language,
        chunkCount: row.chunk_count,
        updatedAt: new Date(row.updated_at),
    }
}

// Chunk mappers

export function mapChunk(row: RawChunk): Chunk {
    return {
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
        breadcrumb: row.breadcrumb,
    }
}

export function mapStoredChunk(row: RawChunkWithEmbedding): StoredChunk {
    const base = mapChunk(row)

    if (row.embedding) {
        return {
            ...base,
            embedding: Array.from(new Float32Array(row.embedding.buffer)),
        }
    }

    return base
}

// Embedding helpers

export function embeddingToBuffer(embedding: number[]): Buffer {
    return Buffer.from(new Float32Array(embedding).buffer)
}

export function bufferToEmbedding(buffer: Buffer): number[] {
    return Array.from(new Float32Array(buffer.buffer))
}