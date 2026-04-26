import 'reflect-metadata'

import Database from 'better-sqlite3'
import { injectable, inject } from 'inversify'
import path from 'path'
import fs from 'fs'

import type { SpyglassConfig } from '@spyglass/shared'
import { TYPES } from '../container/types'

@injectable()
export class DatabaseConnection {
    private db: Database.Database | null = null

    constructor(
        @inject(TYPES.SpyglassConfig)
        private readonly config: SpyglassConfig
    ) {}

    getDb(): Database.Database {
        if (this.db) {
            return this.db
        }

        const dataDir = this.resolveDataDir()
        fs.mkdirSync(dataDir, { recursive: true })

        const dbPath = path.join(dataDir, 'spyglass.db')
        this.db = new Database(dbPath)

        this.db.pragma('journal_mode = WAL')
        this.db.pragma('synchronous = NORMAL')
        this.db.pragma('foreign_keys = ON')
        this.db.pragma('cache_size = -64000')

        this.runMigrations(this.db)
        return this.db
    }

    close(): void {
        if (this.db) {
            this.db.close()
            this.db = null
        }
    }

    private resolveDataDir(): string {
        const dataDir = this.config.storage.dataDir
        // Expand ~ to home directory
        if (dataDir.startsWith('~')) {
            return path.join(
                process.env['HOME'] ?? process.env['USERPROFILE'] ?? '.',
                dataDir.slice(1)
            )
        }
        return dataDir
    }

    private runMigrations(db: Database.Database): void {
        // Create migrations tracking table
        db.exec(`
      CREATE TABLE IF NOT EXISTS _migrations (
        id      INTEGER PRIMARY KEY AUTOINCREMENT,
        name    TEXT NOT NULL UNIQUE,
        run_at  DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `)

        const migrations: Array<{ name: string; sql: string }> = [
            { name: '001_initial_schema', sql: MIGRATION_001 },
        ]

        const hasMigration = db.prepare(
            'SELECT id FROM _migrations WHERE name = ?'
        )
        const insertMigration = db.prepare(
            'INSERT INTO _migrations (name) VALUES (?)'
        )

        for (const migration of migrations) {
            const exists = hasMigration.get(migration.name)
            if (!exists) {
                db.exec(migration.sql)
                insertMigration.run(migration.name)
            }
        }
    }
}

const MIGRATION_001 = `
  -- Documents table
  -- One row per indexed file
  CREATE TABLE IF NOT EXISTS documents (
    id            TEXT PRIMARY KEY,
    source_path   TEXT NOT NULL UNIQUE,
    source_type   TEXT NOT NULL DEFAULT 'filesystem',
    document_type TEXT NOT NULL,
    language      TEXT NOT NULL,
    name          TEXT NOT NULL,
    checksum      TEXT NOT NULL,
    size_bytes    INTEGER NOT NULL DEFAULT 0,
    chunk_count   INTEGER NOT NULL DEFAULT 0,
    job_id        TEXT NOT NULL,
    created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  -- Chunks table
  -- One row per extracted function, class, method etc
  CREATE TABLE IF NOT EXISTS chunks (
    id            TEXT PRIMARY KEY,
    document_id   TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    content       TEXT NOT NULL,
    chunk_type    TEXT NOT NULL,
    language      TEXT NOT NULL,
    name          TEXT NOT NULL,
    start_line    INTEGER NOT NULL DEFAULT 0,
    end_line      INTEGER NOT NULL DEFAULT 0,
    metadata      TEXT NOT NULL DEFAULT '{}',
    created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  -- Embeddings table
  -- Separate from chunks because embedding happens after parsing
  -- and we want to be able to re-embed without re-parsing
  CREATE TABLE IF NOT EXISTS embeddings (
    chunk_id      TEXT PRIMARY KEY REFERENCES chunks(id) ON DELETE CASCADE,
    embedding     BLOB NOT NULL,
    model_name    TEXT NOT NULL,
    dimensions    INTEGER NOT NULL,
    created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  -- BM25 term index
  -- Stores term frequencies for keyword search
  CREATE TABLE IF NOT EXISTS bm25_terms (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    chunk_id    TEXT NOT NULL REFERENCES chunks(id) ON DELETE CASCADE,
    term        TEXT NOT NULL,
    frequency   INTEGER NOT NULL DEFAULT 1
  );

  -- Ingestion jobs
  CREATE TABLE IF NOT EXISTS ingestion_jobs (
    id              TEXT PRIMARY KEY,
    source_path     TEXT NOT NULL,
    status          TEXT NOT NULL DEFAULT 'queued',
    total_files     INTEGER NOT NULL DEFAULT 0,
    processed_files INTEGER NOT NULL DEFAULT 0,
    total_chunks    INTEGER NOT NULL DEFAULT 0,
    skipped_files   INTEGER NOT NULL DEFAULT 0,
    error_message   TEXT,
    started_at      DATETIME,
    completed_at    DATETIME,
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  -- Indexes
  CREATE INDEX IF NOT EXISTS idx_chunks_document_id
    ON chunks(document_id);

  CREATE INDEX IF NOT EXISTS idx_chunks_language
    ON chunks(language);

  CREATE INDEX IF NOT EXISTS idx_chunks_chunk_type
    ON chunks(chunk_type);

  CREATE INDEX IF NOT EXISTS idx_bm25_terms_term
    ON bm25_terms(term);

  CREATE INDEX IF NOT EXISTS idx_bm25_terms_chunk_id
    ON bm25_terms(chunk_id);

  CREATE INDEX IF NOT EXISTS idx_documents_source_path
    ON documents(source_path);
`