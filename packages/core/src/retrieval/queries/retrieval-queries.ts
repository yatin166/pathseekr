import { Tables } from '../../storage/schema'

export const RetrievalQueries = {

    /*
    * Fetch full chunk and document data for ranked results
    */
    CHUNKS_WITH_DOCUMENTS: (idCount: number): string => `
        SELECT
          c.id,
          c.document_id,
          c.content,
          c.chunk_type,
          c.language,
          c.name,
          c.start_line,
          c.end_line,
          c.metadata,
          c.created_at,
          d.source_path,
          d.name as doc_name,
          d.chunk_count
        FROM ${Tables.CHUNKS} c
            JOIN ${Tables.DOCUMENTS} d ON d.id = c.document_id
        WHERE c.id IN (${Array(idCount).fill('?').join(', ')})
    `,

} as const

export interface RawChunkWithDocument {
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
    source_path: string
    doc_name: string
    chunk_count: number
}