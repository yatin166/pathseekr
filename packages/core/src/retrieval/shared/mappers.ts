import type { RetrievalResult, RetrievalStrategy } from '@spyglass/shared'
import { RawChunkWithDocument } from "./retrieval-queries";


export function mapRetrievalResult(
    row: RawChunkWithDocument,
    score: number,
    rank: number,
    strategy: RetrievalStrategy
): RetrievalResult {
    return {
        chunk: {
            id: row.id,
            documentId: row.document_id,
            content: row.content,
            chunkType: row.chunk_type as RetrievalResult['chunk']['chunkType'],
            language: row.language as RetrievalResult['chunk']['language'],
            name: row.name,
            startLine: row.start_line,
            endLine: row.end_line,
            metadata: JSON.parse(
                row.metadata
            ) as RetrievalResult['chunk']['metadata'],
            createdAt: new Date(row.created_at),
        },
        document: {
            id: row.document_id,
            name: row.doc_name,
            sourcePath: row.source_path,
            language: row.language,
            chunkCount: row.chunk_count,
            updatedAt: new Date(),
        },
        score,
        strategy,
        rank,
    }
}