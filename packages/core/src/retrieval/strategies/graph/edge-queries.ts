import { Tables } from '../../../storage/schema'

export type EdgeType = 'contains' | 'extends' | 'implements' | 'calls'

export const EdgeQueries = {

    INSERT: `
        INSERT INTO ${Tables.EDGES} (
            id, from_chunk_id, to_chunk_id, to_name,
            edge_type, weight, resolved
        ) VALUES (
            @id, @fromChunkId, @toChunkId, @toName,
            @edgeType, @weight, @resolved
        )
        ON CONFLICT(id) DO NOTHING
    `,

    CONTAINS_PAIRS: `
        SELECT
            c.id AS class_chunk_id,
            m.id AS method_chunk_id,
            m.name AS method_name
        FROM chunks m
        JOIN chunks c
          ON c.document_id = m.document_id
          AND c.chunk_type = 'class'
          AND c.name = JSON_EXTRACT(m.metadata, '$.parentName')
        WHERE m.chunk_type = 'method'
    `,

    CONTAINS_PAIRS_FOR_DOCUMENT: `
        SELECT
            c.id AS class_chunk_id,
            m.id AS method_chunk_id,
            m.name AS method_name
        FROM chunks m
        JOIN chunks c
          ON c.document_id = m.document_id
          AND c.chunk_type = 'class'
          AND c.name = JSON_EXTRACT(m.metadata, '$.parentName')
        WHERE m.chunk_type = 'method'
          AND m.document_id = ?
    `,

    CLASS_CHUNKS_WITH_HERITAGE: `
        SELECT id, name, metadata
        FROM chunks
        WHERE chunk_type IN ('class', 'interface')
          AND (
              JSON_EXTRACT(metadata, '$.extendsNames') IS NOT NULL OR
              JSON_EXTRACT(metadata, '$.implementsNames') IS NOT NULL
          )
    `,

    CLASS_CHUNKS_WITH_HERITAGE_FOR_DOCUMENT: `
        SELECT id, name, metadata
        FROM chunks
        WHERE chunk_type IN ('class', 'interface')
          AND document_id = ?
          AND (
              JSON_EXTRACT(metadata, '$.extendsNames') IS NOT NULL OR
              JSON_EXTRACT(metadata, '$.implementsNames') IS NOT NULL
        )
    `,

    DELETE_BY_DOCUMENT: `
        DELETE FROM ${Tables.EDGES}
        WHERE from_chunk_id IN (
            SELECT id FROM chunks WHERE document_id = ?
        )
    `,

    DELETE_ALL: `DELETE FROM ${Tables.EDGES}`,

    FIND_OUTBOUND: `
        SELECT to_chunk_id, edge_type, weight
        FROM ${Tables.EDGES}
        WHERE from_chunk_id = ?
          AND resolved = 1
    `,

    FIND_INBOUND: `
        SELECT from_chunk_id, edge_type, weight
        FROM ${Tables.EDGES}
        WHERE to_chunk_id = ?
          AND resolved = 1
    `,

    COUNT: `SELECT COUNT(*) as count FROM ${Tables.EDGES}`,

    COUNT_RESOLVED: `SELECT COUNT(*) as count FROM ${Tables.EDGES} WHERE resolved = 1`,

} as const