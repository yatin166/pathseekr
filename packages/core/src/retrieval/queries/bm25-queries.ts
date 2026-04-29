import { Tables } from '../../storage/schema'

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

} as const