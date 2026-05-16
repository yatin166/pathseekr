import { describe, it, expect, beforeEach, vi } from 'vitest'
import { Container } from 'inversify'
import Database from 'better-sqlite3'
import { DatabaseConnection } from '../../../../../src/storage/database'
import { EmbeddingIndexBuilder } from '../../../../../src/retrieval/strategies/vector/embedding-index-builder'
import { TYPES } from '../../../../../src/container/types'
import type { IEmbeddingProvider } from '../../../../../src/interfaces/embedding-provider.interface'
import { ChunkRepository } from '../../../../../src/storage/chunk-repository'

const DIMENSIONS = 3
const MOCK_EMBEDDING = [0.1, 0.2, 0.3]

function createMockEmbeddingProvider(): IEmbeddingProvider {
  return {
    embed: vi.fn().mockResolvedValue({ embedding: MOCK_EMBEDDING }),
    embedBatch: vi.fn().mockImplementation((texts: string[]) =>
      Promise.resolve(texts.map(() => ({ embedding: MOCK_EMBEDDING })))
    ),
    modelName: 'test-model',
    dimensions: 768
  }
}

function createTestContainer(provider: IEmbeddingProvider): Container {
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
    .bind<IEmbeddingProvider>(TYPES.IEmbeddingProvider)
    .toConstantValue(provider)

  container
    .bind<EmbeddingIndexBuilder>(TYPES.EmbeddingIndexBuilder)
    .to(EmbeddingIndexBuilder)

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

function getEmbeddingCount(db: Database.Database): number {
  const result = db
    .prepare('SELECT COUNT(*) as count FROM embeddings')
    .get() as { count: number }
  return result.count
}

function getEmbeddingForChunk(db: Database.Database, chunkId: string): { model_name: string; dimensions: number } | undefined {
  return db
    .prepare('SELECT model_name, dimensions FROM embeddings WHERE chunk_id = ?')
    .get(chunkId) as { model_name: string; dimensions: number } | undefined
}

describe('EmbeddingIndexBuilder', () => {
  let container: Container
  let db: Database.Database
  let provider: IEmbeddingProvider
  let builder: EmbeddingIndexBuilder

  beforeEach(() => {
    provider = createMockEmbeddingProvider()
    container = createTestContainer(provider)
    const connection = container.get<DatabaseConnection>(TYPES.DatabaseConnection)
    db = connection.getDb()
    builder = container.get<EmbeddingIndexBuilder>(TYPES.EmbeddingIndexBuilder)
  })

  describe('embedPending', () => {
    it('returns early without calling embedBatch when no chunks need embedding', async () => {
      await builder.embedPending()

      expect(provider.embedBatch).not.toHaveBeenCalled()
    })

    it('stores an embedding for each unembedded chunk', async () => {
      insertDocument(db, 'doc-1')
      insertChunk(db, 'chunk-1', 'doc-1', 'function parseResult handles input')
      insertChunk(db, 'chunk-2', 'doc-1', 'class EdgeBuilder resolves graph edges')

      await builder.embedPending()

      expect(getEmbeddingCount(db)).toBe(2)
    })

    it('calls embedBatch with chunk content', async () => {
      insertDocument(db, 'doc-1')
      insertChunk(db, 'chunk-1', 'doc-1', 'function parseResult handles input')

      await builder.embedPending()

      expect(provider.embedBatch).toHaveBeenCalled()
      const calledWith = (provider.embedBatch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string[]
      expect(calledWith.length).toBeGreaterThan(0)
    })

    it('stores the model name with each embedding', async () => {
      insertDocument(db, 'doc-1')
      insertChunk(db, 'chunk-1', 'doc-1', 'parseResult processes documents')

      await builder.embedPending()

      const stored = getEmbeddingForChunk(db, 'chunk-1')
      expect(stored!.model_name).toBe('test-model')
    })

    it('stores the correct dimensions with each embedding', async () => {
      insertDocument(db, 'doc-1')
      insertChunk(db, 'chunk-1', 'doc-1', 'parseResult processes documents')

      await builder.embedPending()

      const stored = getEmbeddingForChunk(db, 'chunk-1')
      expect(stored!.dimensions).toBe(DIMENSIONS)
    })

    it('calls the progress callback with correct values', async () => {
      insertDocument(db, 'doc-1')
      insertChunk(db, 'chunk-1', 'doc-1', 'parseResult handles documents')
      insertChunk(db, 'chunk-2', 'doc-1', 'EdgeBuilder resolves extends edges')

      const progressUpdates: number[] = []

      await builder.embedPending((progress) => {
        progressUpdates.push(progress.percentComplete)
      })

      expect(progressUpdates.length).toBeGreaterThan(0)
      expect(progressUpdates[progressUpdates.length - 1]).toBe(100)
    })

    it('does not re-embed chunks that already have embeddings', async () => {
      insertDocument(db, 'doc-1')
      insertChunk(db, 'chunk-1', 'doc-1', 'parseResult handles documents')

      await builder.embedPending()
      const callsAfterFirst = (provider.embedBatch as ReturnType<typeof vi.fn>).mock.calls.length

      await builder.embedPending()
      const callsAfterSecond = (provider.embedBatch as ReturnType<typeof vi.fn>).mock.calls.length

      expect(callsAfterSecond).toBe(callsAfterFirst)
    })
  })

  describe('embedForDocument', () => {
    it('stores embeddings for all chunks in the document', async () => {
      insertDocument(db, 'doc-1')
      insertChunk(db, 'chunk-1', 'doc-1', 'parseResult handles documents')
      insertChunk(db, 'chunk-2', 'doc-1', 'EdgeBuilder creates graph edges')

      await builder.embedForDocument('doc-1')

      expect(getEmbeddingCount(db)).toBe(2)
    })

    it('returns early without calling embedBatch when document has no chunks', async () => {
      insertDocument(db, 'doc-1')

      await builder.embedForDocument('doc-1')

      expect(provider.embedBatch).not.toHaveBeenCalled()
    })

    it('only embeds chunks belonging to the specified document', async () => {
      insertDocument(db, 'doc-1')
      insertDocument(db, 'doc-2')
      insertChunk(db, 'chunk-1', 'doc-1', 'parseResult handles documents')
      insertChunk(db, 'chunk-2', 'doc-2', 'EdgeBuilder creates graph edges')

      await builder.embedForDocument('doc-1')

      expect(getEmbeddingForChunk(db, 'chunk-1')).toBeDefined()
      expect(getEmbeddingForChunk(db, 'chunk-2')).toBeUndefined()
    })

    it('calls embedBatch with content from the document chunks', async () => {
      insertDocument(db, 'doc-1')
      insertChunk(db, 'chunk-1', 'doc-1', 'parseResult handles documents')

      await builder.embedForDocument('doc-1')

      expect(provider.embedBatch).toHaveBeenCalledTimes(1)
    })
  })
})