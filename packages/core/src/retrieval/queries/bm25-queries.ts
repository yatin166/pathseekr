import { Tables } from '../../storage/schema'

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

export interface RawCorpusStats {
    total_chunks: number
    avg_doc_length: number
}

export interface RawDFRow {
    term: string
    df: number
}

export interface RawTermRow {
    chunk_id: string
    frequency: number
    doc_length: number
}

export const BM25Queries = {

    /*
    * Delete all terms for a specific chunk
    */
    DELETE_BY_CHUNK_ID: `DELETE FROM ${Tables.BM25_TERMS} WHERE chunk_id = ?`,

    /*
    * Delete all terms — used when rebuilding the full index
    */
    DELETE_ALL: `DELETE FROM ${Tables.BM25_TERMS}`,

    /*
    * Insert a term-frequency pair for a chunk
    */
    INSERT_TERM: `INSERT INTO ${Tables.BM25_TERMS} (chunk_id, term, frequency) VALUES (@chunkId, @term, @frequency)`,

    /*
    * All chunk IDs and content for bulk reindexing
    */
    ALL_CHUNKS_FOR_INDEX: `SELECT id, content FROM ${Tables.CHUNKS}`,

    /*
    * Count of indexed terms — used to check if index is ready
    */
    COUNT_TERMS: `SELECT COUNT(*) as count FROM ${Tables.BM25_TERMS}`,

    /*
    * Corpus statistics needed for BM25 scoring
    * total_chunks and average document length
    */
    CORPUS_STATS: `
        SELECT
            COUNT(DISTINCT chunk_id) as total_chunks,
            AVG(doc_length) as avg_doc_length
        FROM (
            SELECT chunk_id, SUM(frequency) as doc_length
            FROM ${Tables.BM25_TERMS}
            GROUP BY chunk_id
        )
    `,

    /*
    * Document frequency per term — how many chunks
    * contain each query term
    */
    DOCUMENT_FREQUENCIES: (termCount: number): string => `
        SELECT 
            term, 
            COUNT(DISTINCT chunk_id) as df
        FROM ${Tables.BM25_TERMS}
        WHERE term IN (${Array(termCount).fill('?').join(', ')})
        GROUP BY term
    `,

    /*
    * All chunks containing a specific term with their
    * term frequency and total document length
    */
    CHUNKS_FOR_TERM: `
        SELECT
            t.chunk_id,
            t.frequency,
            SUM(t2.frequency) as doc_length
        FROM ${Tables.BM25_TERMS} t
        JOIN ${Tables.BM25_TERMS} t2
            ON t2.chunk_id = t.chunk_id
        WHERE t.term = ?
        GROUP BY t.chunk_id, t.frequency
    `,

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