import { Tables } from '../schema'

export const ChunkQueries = {

    INSERT: `
        INSERT INTO ${Tables.CHUNKS} (
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
    `,

    INSERT_EMBEDDING: `
        INSERT INTO embeddings (chunk_id, embedding, model_name, dimensions)
        VALUES (@chunkId, @embedding, @modelName, @dimensions)
        ON CONFLICT(chunk_id) DO UPDATE SET
          embedding  = excluded.embedding,
          model_name = excluded.model_name,
          dimensions = excluded.dimensions,
          created_at = CURRENT_TIMESTAMP
    `,

    FIND_BY_ID: `
        SELECT c.*, e.embedding
          FROM ${Tables.CHUNKS} c
          LEFT JOIN ${Tables.EMBEDDINGS} e ON e.chunk_id = c.id
        WHERE c.id = ?
    `,

    FIND_BY_DOCUMENT_ID: `
        SELECT c.*, e.embedding
          FROM ${Tables.CHUNKS} c
          LEFT JOIN ${Tables.EMBEDDINGS} e ON e.chunk_id = c.id
        WHERE c.document_id = ?
          ORDER BY c.start_line ASC
    `,

    FIND_UNEMBEDDED: `
        SELECT c.*
          FROM ${Tables.CHUNKS} c
          LEFT JOIN ${Tables.EMBEDDINGS} e ON e.chunk_id = c.id
        WHERE e.chunk_id IS NULL
          ORDER BY c.created_at ASC
    `,

    DELETE_BY_DOCUMENT_ID: `DELETE FROM ${Tables.CHUNKS} WHERE document_id = ?`,

    COUNT: `SELECT COUNT(*) as count FROM ${Tables.CHUNKS}`,

} as const