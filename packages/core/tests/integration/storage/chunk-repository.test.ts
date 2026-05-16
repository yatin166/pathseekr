import { describe, it, expect, beforeEach } from 'vitest'
import { Container } from 'inversify'
import { randomUUID } from 'crypto'
import Database from 'better-sqlite3'
import { DatabaseConnection } from '../../../src/storage/database'
import { ChunkRepository } from '../../../src/storage/chunk-repository'
import { TYPES } from '../../../src/container/types'
import type { Chunk } from '@pathseekr/shared'

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

function makeChunk(documentId: string, overrides: Partial<Chunk> = {}): Chunk {
  return {
    id: randomUUID(),
    documentId,
    content: 'function example(): void {}',
    chunkType: 'function',
    language: 'typescript',
    name: 'example',
    startLine: 1,
    endLine: 5,
    metadata: { signature: 'example(): void', isExported: true },
    createdAt: new Date('2024-06-01T00:00:00.000Z'),
    ...overrides,
  }
}

describe('ChunkRepository', () => {
  let container: Container
  let db: Database.Database
  let repository: ChunkRepository

  beforeEach(() => {
    container = createTestContainer()
    const connection = container.get<DatabaseConnection>(TYPES.DatabaseConnection)
    db = connection.getDb()
    repository = container.get<ChunkRepository>(TYPES.IChunkRepository)
    insertDocument(db, 'doc-1')
  })

  describe('save', () => {
    it('persists a chunk to the database', async () => {
      const chunk = makeChunk('doc-1')

      await repository.save(chunk)

      const found = await repository.findById(chunk.id)
      expect(found).not.toBeNull()
    })

    it('persists all chunk fields correctly', async () => {
      const chunk = makeChunk('doc-1', {
        id: 'chunk-abc',
        name: 'parseResult',
        chunkType: 'function',
        startLine: 10,
        endLine: 20,
      })

      await repository.save(chunk)

      const found = await repository.findById('chunk-abc')
      expect(found!.name).toBe('parseResult')
      expect(found!.chunkType).toBe('function')
      expect(found!.startLine).toBe(10)
      expect(found!.endLine).toBe(20)
    })

    it('persists metadata as a serialised object', async () => {
      const metadata = { signature: 'foo(x: number): void', isExported: true }
      const chunk = makeChunk('doc-1', { metadata })

      await repository.save(chunk)

      const found = await repository.findById(chunk.id)
      expect(found!.metadata).toEqual(metadata)
    })

    it('persists breadcrumb when provided', async () => {
      const chunk = makeChunk('doc-1', {
        breadcrumb: 'File: /src/test.ts\nFunction: example',
      })

      await repository.save(chunk)

      const found = await repository.findById(chunk.id)
      expect(found!.breadcrumb).toBe('File: /src/test.ts\nFunction: example')
    })
  })

  describe('saveBatch', () => {
    it('saves all chunks in the batch', async () => {
      const chunks = [
        makeChunk('doc-1', { name: 'funcA' }),
        makeChunk('doc-1', { name: 'funcB' }),
        makeChunk('doc-1', { name: 'funcC' }),
      ]

      await repository.saveBatch(chunks)

      expect(await repository.count()).toBe(3)
    })

    it('saves no chunks when batch is empty', async () => {
      await repository.saveBatch([])

      expect(await repository.count()).toBe(0)
    })

    it('is atomic — all chunks saved or none on failure', async () => {
      const validChunk = makeChunk('doc-1')
      const invalidChunk = makeChunk('nonexistent-doc') // FK violation

      await expect(
        repository.saveBatch([validChunk, invalidChunk])
      ).rejects.toThrow()

      expect(await repository.count()).toBe(0)
    })
  })

  describe('findById', () => {
    it('returns the chunk when it exists', async () => {
      const chunk = makeChunk('doc-1', { id: 'chunk-xyz' })
      await repository.save(chunk)

      const found = await repository.findById('chunk-xyz')

      expect(found).not.toBeNull()
      expect(found!.id).toBe('chunk-xyz')
    })

    it('returns null when the chunk does not exist', async () => {
      const found = await repository.findById('nonexistent-id')

      expect(found).toBeNull()
    })
  })

  describe('findByDocumentId', () => {
    it('returns all chunks for the specified document', async () => {
      await repository.saveBatch([
        makeChunk('doc-1', { name: 'funcA' }),
        makeChunk('doc-1', { name: 'funcB' }),
      ])

      const chunks = await repository.findByDocumentId('doc-1')

      expect(chunks).toHaveLength(2)
    })

    it('returns empty array when document has no chunks', async () => {
      const chunks = await repository.findByDocumentId('doc-1')

      expect(chunks).toHaveLength(0)
    })

    it('does not return chunks from other documents', async () => {
      insertDocument(db, 'doc-2')
      await repository.save(makeChunk('doc-1', { name: 'fromDoc1' }))
      await repository.save(makeChunk('doc-2', { name: 'fromDoc2' }))

      const chunks = await repository.findByDocumentId('doc-1')

      expect(chunks).toHaveLength(1)
      expect(chunks[0]!.name).toBe('fromDoc1')
    })
  })

  describe('findUnembedded', () => {
    it('returns all chunks when no embeddings exist', async () => {
      await repository.saveBatch([
        makeChunk('doc-1', { name: 'funcA' }),
        makeChunk('doc-1', { name: 'funcB' }),
      ])

      const unembedded = await repository.findUnembedded()

      expect(unembedded).toHaveLength(2)
    })

    it('excludes chunks that already have embeddings', async () => {
      const withEmbedding = makeChunk('doc-1', { name: 'embedded' })
      const withoutEmbedding = makeChunk('doc-1', { name: 'notEmbedded' })

      await repository.saveBatch([withEmbedding, withoutEmbedding])
      await repository.saveEmbedding(withEmbedding.id, [0.1, 0.2, 0.3], 'test-model')

      const unembedded = await repository.findUnembedded()

      expect(unembedded).toHaveLength(1)
      expect(unembedded[0]!.name).toBe('notEmbedded')
    })

    it('returns empty array when all chunks are embedded', async () => {
      const chunk = makeChunk('doc-1')
      await repository.save(chunk)
      await repository.saveEmbedding(chunk.id, [0.1, 0.2], 'test-model')

      const unembedded = await repository.findUnembedded()

      expect(unembedded).toHaveLength(0)
    })
  })

  describe('saveEmbedding', () => {
    it('stores the embedding for a chunk', async () => {
      const chunk = makeChunk('doc-1')
      await repository.save(chunk)

      await repository.saveEmbedding(chunk.id, [0.1, 0.2, 0.3], 'test-model')

      const found = await repository.findById(chunk.id)
      expect((found as { embedding?: number[] }).embedding).toBeDefined()
    })

    it('stores the correct number of dimensions', async () => {
      const chunk = makeChunk('doc-1')
      await repository.save(chunk)

      await repository.saveEmbedding(chunk.id, [0.1, 0.2, 0.3], 'test-model')

      const found = await repository.findById(chunk.id) as { embedding: number[] }
      expect(found.embedding).toHaveLength(3)
    })
  })

  describe('deleteByDocumentId', () => {
    it('removes all chunks for the specified document', async () => {
      await repository.saveBatch([
        makeChunk('doc-1'),
        makeChunk('doc-1'),
      ])

      await repository.deleteByDocumentId('doc-1')

      expect(await repository.count()).toBe(0)
    })

    it('does not delete chunks from other documents', async () => {
      insertDocument(db, 'doc-2')
      await repository.save(makeChunk('doc-1'))
      await repository.save(makeChunk('doc-2'))

      await repository.deleteByDocumentId('doc-1')

      expect(await repository.count()).toBe(1)
    })

    it('does not throw when document has no chunks', async () => {
      await expect(repository.deleteByDocumentId('doc-1')).resolves.not.toThrow()
    })
  })

  describe('count', () => {
    it('returns 0 when no chunks exist', async () => {
      expect(await repository.count()).toBe(0)
    })

    it('returns the correct total count across all documents', async () => {
      insertDocument(db, 'doc-2')
      await repository.save(makeChunk('doc-1'))
      await repository.save(makeChunk('doc-1'))
      await repository.save(makeChunk('doc-2'))

      expect(await repository.count()).toBe(3)
    })
  })
})