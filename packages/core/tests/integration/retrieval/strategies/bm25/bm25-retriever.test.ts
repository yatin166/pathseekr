import { describe, it, expect, beforeEach } from 'vitest'
import { Container } from 'inversify'
import Database from 'better-sqlite3'
import { DatabaseConnection } from '../../../../../src/storage/database'
import { BM25Retriever } from '../../../../../src/retrieval/strategies/bm25/bm25-retriever'
import { BM25IndexBuilder } from '../../../../../src/retrieval/strategies/bm25/bm25-index-builder'
import { CodeTokenizer } from '../../../../../src/retrieval/infrastructure/tokenizer/code-tokenizer'
import { TYPES } from '../../../../../src/container/types'
import type { IRetriever } from '../../../../../src/interfaces/retriever.interface'
import type { SearchQuery } from '@pathseekr/shared'
import { DocumentRepository } from '../../../../../src/storage/document-repository'
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
    .bind<DocumentRepository>(TYPES.IDocumentRepository)
    .to(DocumentRepository)

  container
    .bind<ChunkRepository>(TYPES.IChunkRepository)
    .to(ChunkRepository)

  container
    .bind<CodeTokenizer>(TYPES.ITokenizer)
    .to(CodeTokenizer)

  container
    .bind<BM25IndexBuilder>(TYPES.BM25IndexBuilder)
    .to(BM25IndexBuilder)

  container
    .bind<BM25Retriever>(TYPES.BM25Retriever)
    .to(BM25Retriever)

  return container
}

// Inserts a minimal document record into the database.

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

// Inserts a chunk with realistic content for BM25 indexing.

interface ChunkInput {
  id: string
  documentId: string
  name: string
  content: string
  chunkType?: string
}

function insertChunk(db: Database.Database, chunk: ChunkInput): void {
  db.prepare(`
        INSERT INTO chunks (
            id, document_id, content, chunk_type,
            language, name, start_line, end_line,
            metadata, created_at
        ) VALUES (
            ?, ?, ?, 'function',
            'typescript', ?, 1, 10,
            '{}', datetime('now')
        )
    `).run(
    chunk.id,
    chunk.documentId,
    chunk.content,
    chunk.name
  )
}

function makeSearchQuery(query: string, limit = 10): SearchQuery {
  return {
    query,
    limit,
    strategy: 'bm25',
  }
}

describe('BM25Retriever', () => {
  let container: Container
  let db: Database.Database
  let retriever: IRetriever
  let indexBuilder: BM25IndexBuilder

  beforeEach(() => {
    container = createTestContainer()
    const connection = container.get<DatabaseConnection>(TYPES.DatabaseConnection)
    db = connection.getDb()
    retriever = container.get<BM25Retriever>(TYPES.BM25Retriever)
    indexBuilder = container.get<BM25IndexBuilder>(TYPES.BM25IndexBuilder)
  })

  describe('isReady', () => {
    it('returns false when no BM25 index exists', async () => {
      expect(await retriever.isReady()).toBe(false)
    })

    it('returns true after the BM25 index has been built', async () => {
      insertDocument(db, 'doc-1')
      insertChunk(db, {
        id: 'chunk-1',
        documentId: 'doc-1',
        name: 'parseResult',
        content: 'function parseResult processes the input document',
      })

      await indexBuilder.buildForDocument('doc-1')

      expect(await retriever.isReady()).toBe(true)
    })
  })

  describe('search', () => {
    beforeEach(async () => {
      insertDocument(db, 'doc-1')

      insertChunk(db, {
        id: 'chunk-tokenizer',
        documentId: 'doc-1',
        name: 'CodeTokenizer',
        content: 'CodeTokenizer splits camelCase tokens and filters stop words for BM25 indexing',
      })

      insertChunk(db, {
        id: 'chunk-edge',
        documentId: 'doc-1',
        name: 'EdgeBuilder',
        content: 'EdgeBuilder creates graph edges between class chunks resolving extends and implements relationships',
      })

      insertChunk(db, {
        id: 'chunk-indexer',
        documentId: 'doc-1',
        name: 'CodebaseIndexer',
        content: 'CodebaseIndexer orchestrates three phase indexing scanning parsing and embedding',
      })

      await indexBuilder.buildForDocument('doc-1')
    })

    it('returns results for a matching query', async () => {
      const results = await retriever.search(makeSearchQuery('tokenizer'))

      expect(results.length).toBeGreaterThan(0)
    })

    it('returns the most relevant chunk first', async () => {
      const results = await retriever.search(makeSearchQuery('tokenizer'))

      expect(results[0]!.chunk.id).toBe('chunk-tokenizer')
    })

    it('returns the edge chunk first when searching for graph edges', async () => {
      const results = await retriever.search(makeSearchQuery('graph edges'))

      expect(results[0]!.chunk.id).toBe('chunk-edge')
    })

    it('returns the indexer chunk first when searching for indexing phases', async () => {
      const results = await retriever.search(makeSearchQuery('indexing phases'))

      expect(results[0]!.chunk.id).toBe('chunk-indexer')
    })

    it('returns no results for a query that matches nothing', async () => {
      const results = await retriever.search(makeSearchQuery('xyzzy'))

      expect(results).toHaveLength(0)
    })

    it('respects the limit parameter', async () => {
      const results = await retriever.search(makeSearchQuery('chunk', 2))

      expect(results.length).toBeLessThanOrEqual(2)
    })

    it('returns results with a positive score', async () => {
      const results = await retriever.search(makeSearchQuery('tokenizer'))

      for (const result of results) {
        expect(result.score).toBeGreaterThan(0)
      }
    })

    it('returns results with chunk data attached', async () => {
      const results = await retriever.search(makeSearchQuery('tokenizer'))

      expect(results[0]!.chunk).toBeDefined()
      expect(results[0]!.chunk.id).toBeTruthy()
      expect(results[0]!.chunk.name).toBeTruthy()
      expect(results[0]!.chunk.content).toBeTruthy()
    })

    it('returns results sorted by score descending', async () => {
      const results = await retriever.search(makeSearchQuery('chunk indexing'))

      for (let i = 0; i < results.length - 1; i++) {
        expect(results[i]!.score).toBeGreaterThanOrEqual(
          results[i + 1]!.score
        )
      }
    })
  })

  describe('search across multiple documents', () => {
    it('returns results from all indexed documents', async () => {
      insertDocument(db, 'doc-1')
      insertDocument(db, 'doc-2')

      insertChunk(db, {
        id: 'chunk-1',
        documentId: 'doc-1',
        name: 'ParserA',
        content: 'TypeScript parser extracts class and method chunks',
      })

      insertChunk(db, {
        id: 'chunk-2',
        documentId: 'doc-2',
        name: 'ParserB',
        content: 'Python parser extracts class and function chunks',
      })

      await indexBuilder.buildForDocument('doc-1')
      await indexBuilder.buildForDocument('doc-2')

      const results = await retriever.search(makeSearchQuery('parser extracts class'))

      const ids = results.map((r) => r.chunk.id)
      expect(ids).toContain('chunk-1')
      expect(ids).toContain('chunk-2')
    })

    it('rebuilding index for a document does not duplicate results', async () => {
      insertDocument(db, 'doc-1')
      insertChunk(db, {
        id: 'chunk-1',
        documentId: 'doc-1',
        name: 'Retriever',
        content: 'BM25Retriever searches indexed chunks using term frequency scoring',
      })

      await indexBuilder.buildForDocument('doc-1')
      await indexBuilder.buildForDocument('doc-1')

      const results = await retriever.search(makeSearchQuery('retriever'))

      const ids = results.map((r) => r.chunk.id)
      const unique = new Set(ids)
      expect(ids.length).toBe(unique.size)
    })
  })
})