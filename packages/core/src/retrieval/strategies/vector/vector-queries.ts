import { Tables } from '../../../storage/schema'

export const VectorQueries = {

    /*
    * Count chunks that have embeddings
    * */
    COUNT_EMBEDDED: `SELECT COUNT(*) as count FROM ${Tables.EMBEDDINGS}`,

    /*
    * Get all chunk IDs that do not have embeddings yet
    * */
    UNEMBEDDED_CHUNK_IDS: `
        SELECT c.id
        FROM ${Tables.CHUNKS} c
            LEFT JOIN ${Tables.EMBEDDINGS} e ON e.chunk_id = c.id
        WHERE e.chunk_id IS NULL
  `,

    /*
    * Get embedding for a specific chunk
    * */
    GET_EMBEDDING: `SELECT embedding FROM ${Tables.EMBEDDINGS} WHERE chunk_id = ?`,

    /*
    * Get all embeddings with their chunk IDs for similarity search
    * */
    ALL_EMBEDDINGS: `SELECT chunk_id, embedding FROM ${Tables.EMBEDDINGS}`,

    /*
    * Insert or update embedding for a chunk. If an embedding for the chunk already exists, it will be updated with the new values.
    * */
    INSERT_EMBEDDING: `
        INSERT INTO ${Tables.EMBEDDINGS}
            (chunk_id, embedding, model_name, dimensions)
        VALUES
            (@chunkId, @embedding, @modelName, @dimensions)
        ON CONFLICT(chunk_id) DO UPDATE SET
            embedding  = excluded.embedding,
            model_name = excluded.model_name,
            dimensions = excluded.dimensions
    `,

    /*
    * Get the byte length of the embedding vector to verify dimensions
    */
    SELECT_DIMENSIONS: `SELECT length(embedding) as byte_length FROM ${Tables.EMBEDDINGS} LIMIT 1`

} as const

export interface RawEmbeddingRow {
    chunk_id: string
    embedding: Buffer
}