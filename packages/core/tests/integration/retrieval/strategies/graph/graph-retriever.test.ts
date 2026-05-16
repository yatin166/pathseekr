import { describe, it, expect, beforeEach } from 'vitest'
import { Container } from 'inversify'
import Database from 'better-sqlite3'
import { DatabaseConnection } from '../../../../../src/storage/database'
import { GraphRetriever } from '../../../../../src/retrieval/strategies/graph/graph-retriever'
import { BM25Retriever } from '../../../../../src/retrieval/strategies/bm25/bm25-retriever'
import { BM25IndexBuilder } from '../../../../../src/retrieval/strategies/bm25/bm25-index-builder'
import { EdgeBuilder } from '../../../../../src/retrieval/strategies/graph/edge-builder'
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

  container
    .bind<EdgeBuilder>(TYPES.EdgeBuilder)
    .to(EdgeBuilder)

  container
    .bind<GraphRetriever>(TYPES.GraphRetriever)
    .to(GraphRetriever)

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

interface ChunkInput {
  id: string
  documentId: string
  name: string
  content: string
  chunkType: string
  metadata?: Record<string, unknown>
}

function insertChunk(db: Database.Database, chunk: ChunkInput): void {
  db.prepare(`
        INSERT INTO chunks (
            id, document_id, content, chunk_type,
            language, name, start_line, end_line,
            metadata, created_at
        ) VALUES (
            ?, ?, ?, ?,
            'typescript', ?, 1, 10,
            ?, datetime('now')
        )
    `).run(
    chunk.id,
    chunk.documentId,
    chunk.content,
    chunk.chunkType,
    chunk.name,
    JSON.stringify(chunk.metadata ?? {})
  )
}

function makeSearchQuery(query: string, limit = 10): SearchQuery {
  return {
    query,
    limit,
    strategy: 'graph',
  }
}

describe('GraphRetriever', () => {
  let container: Container
  let db: Database.Database
  let retriever: IRetriever
  let indexBuilder: BM25IndexBuilder
  let edgeBuilder: EdgeBuilder

  beforeEach(() => {
    container = createTestContainer()
    const connection = container.get<DatabaseConnection>(TYPES.DatabaseConnection)
    db = connection.getDb()
    retriever = container.get<GraphRetriever>(TYPES.GraphRetriever)
    indexBuilder = container.get<BM25IndexBuilder>(TYPES.BM25IndexBuilder)
    edgeBuilder = container.get<EdgeBuilder>(TYPES.EdgeBuilder)
  })

  describe('isReady', () => {
    it('returns false when the BM25 index is empty', async () => {
      expect(await retriever.isReady()).toBe(false)
    })

    it('returns true after BM25 index and graph edges have been built', async () => {
      insertDocument(db, 'doc-1')

      insertChunk(db, {
        id: 'class-1',
        documentId: 'doc-1',
        name: 'MyService',
        content: 'MyService handles request processing and routing',
        chunkType: 'class',
        metadata: {},
      })

      insertChunk(db, {
        id: 'method-1',
        documentId: 'doc-1',
        name: 'MyService.process',
        content: 'process method handles incoming requests',
        chunkType: 'method',
        metadata: { parentName: 'MyService' },
      })

      await indexBuilder.buildForDocument('doc-1')
      edgeBuilder.buildAll()

      expect(await retriever.isReady()).toBe(true)
    })
  })

  describe('name matching', () => {
    beforeEach(async () => {
      insertDocument(db, 'doc-1')

      insertChunk(db, {
        id: 'class-retriever',
        documentId: 'doc-1',
        name: 'BM25Retriever',
        content: 'BM25Retriever implements full text search using term frequency scoring',
        chunkType: 'class',
        metadata: {},
      })

      insertChunk(db, {
        id: 'method-search',
        documentId: 'doc-1',
        name: 'BM25Retriever.search',
        content: 'search method queries the bm25 terms table and scores results',
        chunkType: 'method',
        metadata: { parentName: 'BM25Retriever', signature: 'search(query: SearchQuery): Promise<RetrievalResult[]>' },
      })

      insertChunk(db, {
        id: 'class-edge',
        documentId: 'doc-1',
        name: 'EdgeBuilder',
        content: 'EdgeBuilder resolves graph edges between class and method chunks',
        chunkType: 'class',
        metadata: {},
      })

      await indexBuilder.buildForDocument('doc-1')
      edgeBuilder.buildAll()
    })

    it('finds a chunk by exact class name', async () => {
      const results = await retriever.search(makeSearchQuery('BM25Retriever'))

      const ids = results.map((r) => r.chunk.id)
      expect(ids).toContain('class-retriever')
    })

    it('finds a method chunk by its parent class name', async () => {
      const results = await retriever.search(makeSearchQuery('BM25Retriever'))

      const ids = results.map((r) => r.chunk.id)
      expect(ids).toContain('method-search')
    })

    it('ranks the name-matched class above unrelated chunks', async () => {
      const results = await retriever.search(makeSearchQuery('BM25Retriever'))

      expect(results[0]!.chunk.id).toBe('class-retriever')
    })

    it('does not return unrelated chunks when name match is precise', async () => {
      const results = await retriever.search(makeSearchQuery('BM25Retriever'))

      const ids = results.map((r) => r.chunk.id)
      expect(ids).not.toContain('class-edge')
    })
  })

  describe('graph traversal', () => {
    beforeEach(async () => {
      insertDocument(db, 'doc-1')

      insertChunk(db, {
        id: 'class-service',
        documentId: 'doc-1',
        name: 'IndexerService',
        content: 'IndexerService coordinates document parsing and storage',
        chunkType: 'class',
        metadata: {},
      })

      insertChunk(db, {
        id: 'method-parse',
        documentId: 'doc-1',
        name: 'IndexerService.parseDocument',
        content: 'parseDocument reads file content and extracts chunks',
        chunkType: 'method',
        metadata: {
          parentName: 'IndexerService',
          signature: 'parseDocument(path: string): ParseResult',
        },
      })

      insertChunk(db, {
        id: 'method-store',
        documentId: 'doc-1',
        name: 'IndexerService.storeChunks',
        content: 'storeChunks persists extracted chunks to the database',
        chunkType: 'method',
        metadata: {
          parentName: 'IndexerService',
          signature: 'storeChunks(chunks: Chunk[]): void',
        },
      })

      await indexBuilder.buildForDocument('doc-1')
      edgeBuilder.buildAll()
    })

    it('expands from a class seed to its methods via contains edges', async () => {
      const results = await retriever.search(makeSearchQuery('IndexerService'))

      const ids = results.map((r) => r.chunk.id)
      expect(ids).toContain('method-parse')
      expect(ids).toContain('method-store')
    })

    it('expands from a method seed back to its parent class via inbound edges', async () => {
      const results = await retriever.search(makeSearchQuery('parseDocument'))

      const ids = results.map((r) => r.chunk.id)
      expect(ids).toContain('class-service')
    })
  })

  describe('cross-document graph traversal', () => {
    beforeEach(async () => {
      insertDocument(db, 'doc-1')
      insertDocument(db, 'doc-2')

      insertChunk(db, {
        id: 'class-base',
        documentId: 'doc-1',
        name: 'BaseRetriever',
        content: 'BaseRetriever defines the common retrieval interface and shared logic',
        chunkType: 'class',
        metadata: {},
      })

      insertChunk(db, {
        id: 'class-bm25',
        documentId: 'doc-2',
        name: 'BM25Impl',
        content: 'BM25Impl extends BaseRetriever with term frequency scoring',
        chunkType: 'class',
        metadata: { extendsNames: ['BaseRetriever'] },
      })

      await indexBuilder.buildForDocument('doc-1')
      await indexBuilder.buildForDocument('doc-2')
      edgeBuilder.buildAll()
    })

    it('traverses extends edges across documents', async () => {
      const results = await retriever.search(makeSearchQuery('BM25Impl'))

      const ids = results.map((r) => r.chunk.id)
      expect(ids).toContain('class-base')
    })
  })

  describe('search mechanics', () => {
    beforeEach(async () => {
      insertDocument(db, 'doc-1')

      for (let i = 1; i <= 5; i++) {
        insertChunk(db, {
          id: `chunk-${i}`,
          documentId: 'doc-1',
          name: `Service${i}`,
          content: `Service${i} handles processing of items in the pipeline`,
          chunkType: 'class',
          metadata: {},
        })
      }

      await indexBuilder.buildForDocument('doc-1')
    })

    it('respects the limit parameter', async () => {
      const results = await retriever.search(makeSearchQuery('service pipeline', 2))

      expect(results.length).toBeLessThanOrEqual(2)
    })

    it('returns results with a positive score', async () => {
      const results = await retriever.search(makeSearchQuery('service pipeline'))

      for (const result of results) {
        expect(result.score).toBeGreaterThan(0)
      }
    })

    it('returns results sorted by score descending', async () => {
      const results = await retriever.search(makeSearchQuery('service pipeline'))

      for (let i = 0; i < results.length - 1; i++) {
        expect(results[i]!.score).toBeGreaterThanOrEqual(
          results[i + 1]!.score
        )
      }
    })

    it('returns no results for a query that matches nothing', async () => {
      const results = await retriever.search(makeSearchQuery('xyzzy'))

      expect(results).toHaveLength(0)
    })

    it('returns results with chunk data attached', async () => {
      const results = await retriever.search(makeSearchQuery('service'))

      expect(results[0]!.chunk).toBeDefined()
      expect(results[0]!.chunk.id).toBeTruthy()
      expect(results[0]!.chunk.name).toBeTruthy()
    })
  })
})