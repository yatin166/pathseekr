import { Tables } from '../schema'

export const DocumentQueries = {

    INSERT: `
        INSERT INTO ${Tables.DOCUMENTS} (
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
    `,

    FIND_BY_PATH: `SELECT * FROM ${Tables.DOCUMENTS} WHERE source_path = ?`,

    FIND_BY_ID: `SELECT * FROM ${Tables.DOCUMENTS} WHERE id = ?`,

    LIST_ALL_SUMMARIES: `
        SELECT id, name, source_path, language, chunk_count, updated_at
            FROM ${Tables.DOCUMENTS}
        ORDER BY updated_at DESC
    `,

    UPDATE_CHECKSUM: `
        UPDATE ${Tables.DOCUMENTS}
        SET checksum = @checksum, updated_at = @updatedAt
        WHERE id = @id
    `,

    DELETE: `DELETE FROM ${Tables.DOCUMENTS} WHERE id = ?`,

    STATS_TOTALS: `
        SELECT
          COUNT(*) as total_documents,
          COALESCE(SUM(chunk_count), 0) as total_chunks
        FROM ${Tables.DOCUMENTS}
    `,

    STATS_EMBEDDINGS: `SELECT COUNT(*) as count FROM ${Tables.EMBEDDINGS}`,

    STATS_BY_LANGUAGE: `
        SELECT language, COUNT(*) as count
            FROM ${Tables.CHUNKS}
        GROUP BY language
    `,

    STATS_BY_CHUNK_TYPE: `
        SELECT chunk_type, COUNT(*) as count
            FROM ${Tables.CHUNKS}
        GROUP BY chunk_type
    `,

    STATS_LAST_INDEXED: `SELECT MAX(updated_at) as last_indexed FROM ${Tables.DOCUMENTS}`,

    STATS_DB_SIZE: `SELECT page_count * page_size as size FROM pragma_page_count(), pragma_page_size()`,

} as const