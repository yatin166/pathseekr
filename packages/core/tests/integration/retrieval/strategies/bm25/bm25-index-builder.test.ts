import { describe, it, expect, beforeEach } from 'vitest'
import { Container } from 'inversify'
import Database from 'better-sqlite3'
import { DatabaseConnection } from '../../../../../src/storage/database'
import { BM25IndexBuilder } from '../../../../../src/retrieval/strategies/bm25/bm25-index-builder'
import { CodeTokenizer } from '../../../../../src/retrieval/infrastructure/tokenizer/code-tokenizer'
import { TYPES } from '../../../../../src/container/types'
import { ChunkRepository } from '../../../../../src/storage/chunk-repository'

function createTestContainer(): Container {
  const container = new Container({ defaultScope: 'Singleton' })

  container
    .bind<string>(TYPES.DatabasePath)
    .toConstantValue(':memory:')

  container
    .bind<DatabaseConnection>(TYPES.DatabaseConnection)
    .to(DatabaseConnection)

  container
    .bind<ChunkRepository>(TYPES.IChunkRepository)
    .to(ChunkRepository)

  container
    .bind<CodeTokenizer>(TYPES.ITokenizer)
    .to(CodeTokenizer)

  container
    .bind<BM25IndexBuilder>(TYPES.BM25IndexBuilder)
    .to(BM25IndexBuilder)

  return container
}

function insertDocument(db: Database.Database, id: string): void {
  db.prepare(`
        INSERT INTO documents (
            id, source_path, source_type, document_type,
            language, name, checksum, size_bytes, chunk_count,
            job_id, created_at, updated_at
        ) VALUES (
            ?, ?, 'filesystem', 'code',
            'typescript', 'test.ts', ?, 1000, 0,
            'job-1', datetime('now'), datetime('now')
        )
    `).run(id, `/src/${id}.ts`, `checksum-${id}`)
}

function insertChunk(db: Database.Database, id: string, documentId: string, content: string): void {
  db.prepare(`
        INSERT INTO chunks (
            id, document_id, content, chunk_type,
            language, name, start_line, end_line,
            metadata, created_at
        ) VALUES (
            ?, ?, ?, 'function',
            'typescript', 'testFn', 1, 10,
            '{}', datetime('now')
        )
    `).run(id, documentId, content)
}

function getTermCount(db: Database.Database): number {
  const result = db
    .prepare('SELECT COUNT(*) as count FROM bm25_terms')
    .get() as { count: number }
  return result.count
}

function getTermsForChunk(db: Database.Database, chunkId: string): Array<{ term: string; frequency: number }> {
  return db
    .prepare('SELECT term, frequency FROM bm25_terms WHERE chunk_id = ?')
    .all(chunkId) as Array<{ term: string; frequency: number }>
}

describe('BM25IndexBuilder', () => {
  let container: Container
  let db: Database.Database
  let builder: BM25IndexBuilder

  beforeEach(() => {
    container = createTestContainer()
    const connection = container.get<DatabaseConnection>(TYPES.DatabaseConnection)
    db = connection.getDb()
    builder = container.get<BM25IndexBuilder>(TYPES.BM25IndexBuilder)
  })

  describe('buildForDocument', () => {
    it('stores BM25 terms for chunks in the document', async () => {
      insertDocument(db, 'doc-1')
      insertChunk(db, 'chunk-1', 'doc-1', 'CodebaseIndexer orchestrates three phase indexing')

      await builder.buildForDocument('doc-1')

      expect(getTermCount(db)).toBeGreaterThan(0)
    })

    it('stores terms only for the specified document', async () => {
      insertDocument(db, 'doc-1')
      insertDocument(db, 'doc-2')
      insertChunk(db, 'chunk-1', 'doc-1', 'TypeScript parser extracts class chunks')
      insertChunk(db, 'chunk-2', 'doc-2', 'Python parser extracts function chunks')

      await builder.buildForDocument('doc-1')

      const doc1Terms = getTermsForChunk(db, 'chunk-1')
      const doc2Terms = getTermsForChunk(db, 'chunk-2')

      expect(doc1Terms.length).toBeGreaterThan(0)
      expect(doc2Terms).toHaveLength(0)
    })

    it('returns early and stores no terms when document has no chunks', async () => {
      insertDocument(db, 'doc-1')

      await builder.buildForDocument('doc-1')

      expect(getTermCount(db)).toBe(0)
    })

    it('stores term frequencies correctly', async () => {
      insertDocument(db, 'doc-1')
      insertChunk(db, 'chunk-1', 'doc-1', 'retriever retriever parser')

      await builder.buildForDocument('doc-1')

      const terms = getTermsForChunk(db, 'chunk-1')
      const retrieverTerm = terms.find((t) => t.term === 'retriever')

      expect(retrieverTerm).toBeDefined()
      expect(retrieverTerm!.frequency).toBe(2)
    })

    it('is idempotent — rebuilding the same document does not duplicate terms', async () => {
      insertDocument(db, 'doc-1')
      insertChunk(db, 'chunk-1', 'doc-1', 'EdgeBuilder creates graph edges between chunks')

      await builder.buildForDocument('doc-1')
      const countAfterFirst = getTermCount(db)

      await builder.buildForDocument('doc-1')
      const countAfterSecond = getTermCount(db)

      expect(countAfterSecond).toBe(countAfterFirst)
    })

    it('indexes chunks from multiple documents independently', async () => {
      insertDocument(db, 'doc-1')
      insertDocument(db, 'doc-2')
      insertChunk(db, 'chunk-1', 'doc-1', 'TypeScript parser extracts class chunks')
      insertChunk(db, 'chunk-2', 'doc-2', 'Python parser extracts function definitions')

      await builder.buildForDocument('doc-1')
      await builder.buildForDocument('doc-2')

      expect(getTermsForChunk(db, 'chunk-1').length).toBeGreaterThan(0)
      expect(getTermsForChunk(db, 'chunk-2').length).toBeGreaterThan(0)
    })
  })

  describe('buildAll', () => {
    it('indexes all chunks across all documents', async () => {
      insertDocument(db, 'doc-1')
      insertDocument(db, 'doc-2')
      insertChunk(db, 'chunk-1', 'doc-1', 'CodebaseIndexer runs three indexing phases')
      insertChunk(db, 'chunk-2', 'doc-2', 'EdgeBuilder resolves extends and implements edges')

      await builder.buildAll()

      expect(getTermsForChunk(db, 'chunk-1').length).toBeGreaterThan(0)
      expect(getTermsForChunk(db, 'chunk-2').length).toBeGreaterThan(0)
    })

    it('clears all existing terms before rebuilding', async () => {
      insertDocument(db, 'doc-1')
      insertChunk(db, 'chunk-1', 'doc-1', 'BM25 retriever searches indexed chunks')

      await builder.buildAll()
      const countAfterFirst = getTermCount(db)

      await builder.buildAll()
      const countAfterSecond = getTermCount(db)

      expect(countAfterSecond).toBe(countAfterFirst)
    })

    it('stores no terms when the database has no chunks', async () => {
      await builder.buildAll()

      expect(getTermCount(db)).toBe(0)
    })
  })
})