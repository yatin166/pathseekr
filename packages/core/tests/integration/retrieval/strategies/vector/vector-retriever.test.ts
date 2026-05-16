import { describe, it, expect, beforeEach, vi } from 'vitest'
import { Container } from 'inversify'
import Database from 'better-sqlite3'
import { DatabaseConnection } from '../../../../../src/storage/database'
import { VectorRetriever } from '../../../../../src/retrieval/strategies/vector/vector-retriever'
import { TYPES } from '../../../../../src/container/types'
import type { IEmbeddingProvider } from '../../../../../src/interfaces/embedding-provider.interface'
import type { IRetriever } from '../../../../../src/interfaces/retriever.interface'
import type { PathseekrConfig } from '@pathseekr/shared'
import { embeddingToBuffer } from '../../../../../src/storage/mappers'

const DIMENSIONS = 3

function makeTestConfig(dimensions = DIMENSIONS): PathseekrConfig {
  return {
    embedding: {
      provider: 'ollama',
      model: 'nomic-embed-text',
      baseUrl: 'http://localhost:11434',
      dimensions,
      batchSize: 20,
    },
    llm: {
      provider: 'ollama',
      model: 'llama2',
      baseUrl: 'http://localhost:11434',
    },
    storage: { dataDir: '/tmp' },
    indexing: { maxFileSizeBytes: 1_048_576, concurrency: 2, excludePatterns: [] },
    retrieval: { defaultLimit: 10, bm25Weight: 0.5 },
    server: { apiPort: 3001, mcpPort: 3002, webPort: 3000 },
    logLevel: 'error',
    nodeEnv: 'test',
  }
}

function createMockEmbeddingProvider(queryEmbedding: number[]): IEmbeddingProvider {
  return {
    embed: vi.fn().mockResolvedValue({ embedding: queryEmbedding }),
    embedBatch: vi.fn().mockResolvedValue([{ embedding: queryEmbedding }]),
    modelName: 'test-model',
  }
}

function createTestContainer(
  mockProvider: IEmbeddingProvider,
  config = makeTestConfig()
): Container {
  const container = new Container({ defaultScope: 'Singleton' })

  container
    .bind<string>(TYPES.DatabasePath)
    .toConstantValue(':memory:')

  container
    .bind<DatabaseConnection>(TYPES.DatabaseConnection)
    .to(DatabaseConnection)

  container
    .bind<PathseekrConfig>(TYPES.PathseekrConfig)
    .toConstantValue(config)

  container
    .bind<IEmbeddingProvider>(TYPES.IEmbeddingProvider)
    .toConstantValue(mockProvider)

  container
    .bind<VectorRetriever>(TYPES.VectorRetriever)
    .to(VectorRetriever)

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

function insertChunk(db: Database.Database, id: string, documentId: string, name: string): void {
  db.prepare(`
        INSERT INTO chunks (
            id, document_id, content, chunk_type,
            language, name, start_line, end_line,
            metadata, created_at
        ) VALUES (
            ?, ?, 'some content', 'function',
            'typescript', ?, 1, 10,
            '{}', datetime('now')
        )
    `).run(id, documentId, name)
}

function insertEmbedding(db: Database.Database, chunkId: string, embedding: number[]): void {
  db.prepare(`
        INSERT INTO embeddings (chunk_id, embedding, model_name, dimensions, created_at)
        VALUES (?, ?, 'test-model', ?, datetime('now'))
    `).run(chunkId, embeddingToBuffer(embedding), embedding.length)
}

describe('VectorRetriever', () => {
  let container: Container
  let db: Database.Database
  let retriever: IRetriever

  beforeEach(() => {
    const provider = createMockEmbeddingProvider([1, 0, 0])
    container = createTestContainer(provider)
    const connection = container.get<DatabaseConnection>(TYPES.DatabaseConnection)
    db = connection.getDb()
    retriever = container.get<VectorRetriever>(TYPES.VectorRetriever)
  })

  describe('isReady', () => {
    it('returns false when no embeddings exist', async () => {
      expect(await retriever.isReady()).toBe(false)
    })

    it('returns true when at least one embedding exists', async () => {
      insertDocument(db, 'doc-1')
      insertChunk(db, 'chunk-1', 'doc-1', 'parseResult')
      insertEmbedding(db, 'chunk-1', [1, 0, 0])

      expect(await retriever.isReady()).toBe(true)
    })

    it('throws when stored embedding dimensions do not match config', async () => {
      // Config expects 3 dimensions but we will store 4-dimensional embeddings
      const mismatchConfig = makeTestConfig(3)
      const mismatchContainer = createTestContainer(
        createMockEmbeddingProvider([1, 0, 0]),
        mismatchConfig
      )

      const mismatchConn = mismatchContainer.get<DatabaseConnection>(TYPES.DatabaseConnection)
      const mismatchDb = mismatchConn.getDb()

      insertDocument(mismatchDb, 'doc-1')
      insertChunk(mismatchDb, 'chunk-1', 'doc-1', 'parseResult')
      insertEmbedding(mismatchDb, 'chunk-1', [1, 0, 0, 0]) // 4-dimensional, config says 3

      const mismatchRetriever = mismatchContainer.get<VectorRetriever>(TYPES.VectorRetriever)

      await expect(mismatchRetriever.isReady()).rejects.toThrow('dimension')
    })
  })

  describe('search', () => {
    it('returns empty array when no embeddings exist', async () => {
      const results = await retriever.search({
        query: 'something',
        limit: 10,
        strategy: 'vector',
      })

      expect(results).toHaveLength(0)
    })

    it('returns the most similar chunk first', async () => {
      insertDocument(db, 'doc-1')
      insertChunk(db, 'chunk-a', 'doc-1', 'PerfectMatch')
      insertChunk(db, 'chunk-b', 'doc-1', 'Orthogonal')

      // chunk-a aligns perfectly with query [1,0,0] → cosine = 1.0
      insertEmbedding(db, 'chunk-a', [1, 0, 0])
      // chunk-b is orthogonal to query → cosine = 0.0
      insertEmbedding(db, 'chunk-b', [0, 1, 0])

      const results = await retriever.search({
        query: 'perfect match',
        limit: 10,
        strategy: 'vector',
      })

      expect(results[0]!.chunk.id).toBe('chunk-a')
    })

    it('ranks results by cosine similarity descending', async () => {
      insertDocument(db, 'doc-1')
      insertChunk(db, 'chunk-a', 'doc-1', 'High')
      insertChunk(db, 'chunk-b', 'doc-1', 'Low')
      insertChunk(db, 'chunk-c', 'doc-1', 'Zero')
      /**
      * Query is [1,0,0]
      * chunk-a: cosine([1,0,0], [1,0,0]) = 1.0
      * chunk-b: cosine([0.7,0.7,0], [1,0,0]) ≈ 0.7
      * chunk-c: cosine([0,1,0], [1,0,0]) = 0.0
      * */
      insertEmbedding(db, 'chunk-a', [1, 0, 0])
      insertEmbedding(db, 'chunk-b', [0.7, 0.7, 0])
      insertEmbedding(db, 'chunk-c', [0, 1, 0])

      const results = await retriever.search({
        query: 'test',
        limit: 10,
        strategy: 'vector',
      })

      for (let i = 0; i < results.length - 1; i++) {
        expect(results[i]!.score).toBeGreaterThanOrEqual(results[i + 1]!.score)
      }
    })

    it('respects the limit parameter', async () => {
      insertDocument(db, 'doc-1')
      for (let i = 0; i < 5; i++) {
        insertChunk(db, `chunk-${i}`, 'doc-1', `Function${i}`)
        insertEmbedding(db, `chunk-${i}`, [1, 0, 0])
      }

      const results = await retriever.search({
        query: 'test',
        limit: 3,
        strategy: 'vector',
      })

      expect(results.length).toBeLessThanOrEqual(3)
    })

    it('returns results with chunk data attached', async () => {
      insertDocument(db, 'doc-1')
      insertChunk(db, 'chunk-1', 'doc-1', 'parseResult')
      insertEmbedding(db, 'chunk-1', [1, 0, 0])

      const results = await retriever.search({
        query: 'test',
        limit: 10,
        strategy: 'vector',
      })

      expect(results[0]!.chunk).toBeDefined()
      expect(results[0]!.chunk.id).toBe('chunk-1')
      expect(results[0]!.chunk.name).toBe('parseResult')
    })

    it('sets strategy to vector on all results', async () => {
      insertDocument(db, 'doc-1')
      insertChunk(db, 'chunk-1', 'doc-1', 'parseResult')
      insertEmbedding(db, 'chunk-1', [1, 0, 0])

      const results = await retriever.search({
        query: 'test',
        limit: 10,
        strategy: 'vector',
      })

      for (const result of results) {
        expect(result.strategy).toBe('vector')
      }
    })

    it('assigns sequential ranks starting at 1', async () => {
      insertDocument(db, 'doc-1')
      for (let i = 0; i < 3; i++) {
        insertChunk(db, `chunk-${i}`, 'doc-1', `Function${i}`)
        insertEmbedding(db, `chunk-${i}`, [1, 0, 0])
      }

      const results = await retriever.search({
        query: 'test',
        limit: 10,
        strategy: 'vector',
      })

      results.forEach((result, index) => {
        expect(result.rank).toBe(index + 1)
      })
    })
  })
})