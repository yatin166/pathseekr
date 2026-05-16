import { describe, it, expect, beforeEach } from 'vitest'
import { Container } from 'inversify'
import { DatabaseConnection } from '../../../src/storage/database'
import { TYPES } from '../../../src/container/types'
import { Tables } from '../../../src/storage/schema'

function createTestContainer(): Container {
  const container = new Container({ defaultScope: 'Singleton' })

  container
    .bind<string>(TYPES.DatabasePath)
    .toConstantValue(':memory:')

  container
    .bind<DatabaseConnection>(TYPES.DatabaseConnection)
    .to(DatabaseConnection)

  return container
}

describe('DatabaseConnection', () => {
  let container: Container
  let connection: DatabaseConnection

  beforeEach(() => {
    container = createTestContainer()
    connection = container.get<DatabaseConnection>(TYPES.DatabaseConnection)
  })

  describe('getDb', () => {
    it('returns a database instance', () => {
      const db = connection.getDb()

      expect(db).toBeDefined()
    })

    it('returns the same instance on repeated calls', () => {
      const first = connection.getDb()
      const second = connection.getDb()

      expect(first).toBe(second)
    })

    it('creates the documents table on first call', () => {
      const db = connection.getDb()
      const result = db
        .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`)
        .get(Tables.DOCUMENTS)

      expect(result).toBeDefined()
    })

    it('creates the chunks table on first call', () => {
      const db = connection.getDb()
      const result = db
        .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`)
        .get(Tables.CHUNKS)

      expect(result).toBeDefined()
    })

    it('creates the edges table on first call', () => {
      const db = connection.getDb()
      const result = db
        .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`)
        .get(Tables.EDGES)

      expect(result).toBeDefined()
    })

    it('creates the bm25_terms table on first call', () => {
      const db = connection.getDb()
      const result = db
        .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`)
        .get(Tables.BM25_TERMS)

      expect(result).toBeDefined()
    })

    it('creates the embeddings table on first call', () => {
      const db = connection.getDb()
      const result = db
        .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`)
        .get(Tables.EMBEDDINGS)

      expect(result).toBeDefined()
    })

    it('records applied migrations in the migrations table', () => {
      const db = connection.getDb()
      const rows = db
        .prepare(`SELECT name FROM ${Tables.MIGRATIONS}`)
        .all()

      expect(rows.length).toBeGreaterThan(0)
    })

    it('enforces foreign key constraints', () => {
      const db = connection.getDb()

      expect(() => {
        db.prepare(`
                    INSERT INTO chunks (
                        id, document_id, content, chunk_type,
                        language, name, start_line, end_line,
                        metadata, created_at
                    ) VALUES (
                        'chunk-1', 'nonexistent-doc', '', 'function',
                        'typescript', 'test', 1, 5,
                        '{}', datetime('now')
                    )
                `).run()
      }).toThrow()
    })

    it('does not run the same migration twice', () => {
      const db = connection.getDb()

      const countBefore = (
        db.prepare(`SELECT COUNT(*) as count FROM ${Tables.MIGRATIONS}`).get() as { count: number }
      ).count

      const secondConnection = new DatabaseConnection(':memory:')
      const db2 = secondConnection.getDb()

      const countAfter = (
        db2.prepare(`SELECT COUNT(*) as count FROM ${Tables.MIGRATIONS}`).get() as { count: number }
      ).count

      expect(countAfter).toBe(countBefore)
    })
  })

  describe('close', () => {
    it('closes the database without throwing', () => {
      connection.getDb()

      expect(() => connection.close()).not.toThrow()
    })

    it('allows getDb to be called again after close', () => {
      connection.getDb()
      connection.close()

      expect(() => connection.getDb()).not.toThrow()
    })

    it('does not throw when called on an unopened connection', () => {
      expect(() => connection.close()).not.toThrow()
    })
  })
})