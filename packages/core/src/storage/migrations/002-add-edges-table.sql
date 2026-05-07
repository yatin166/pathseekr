CREATE TABLE IF NOT EXISTS edges (
    id            TEXT PRIMARY KEY,
    from_chunk_id TEXT NOT NULL REFERENCES chunks(id) ON DELETE CASCADE,
    to_chunk_id   TEXT             REFERENCES chunks(id) ON DELETE SET NULL,
    to_name       TEXT NOT NULL,
    edge_type     TEXT NOT NULL,
    weight        REAL NOT NULL DEFAULT 1.0,
    resolved      INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_edges_from ON edges(from_chunk_id);
CREATE INDEX IF NOT EXISTS idx_edges_to   ON edges(to_chunk_id) WHERE to_chunk_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_edges_type ON edges(edge_type);