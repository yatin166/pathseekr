import { describe, it, expect, beforeEach } from 'vitest'
import { Container } from 'inversify'
import { randomUUID } from 'crypto'
import { DatabaseConnection } from '../../../src/storage/database'
import { DocumentRepository } from '../../../src/storage/document-repository'
import { ChunkRepository } from '../../../src/storage/chunk-repository'
import { TYPES } from '../../../src/container/types'
import type { Document, Chunk } from '@pathseekr/shared'

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

  return container
}

function makeDocument(overrides: Partial<Document> = {}): Document {
  return {
    id: randomUUID(),
    sourcePath: '/src/parser.ts',
    sourceType: 'filesystem',
    documentType: 'code',
    language: 'typescript',
    name: 'parser.ts',
    checksum: 'abc123',
    sizeBytes: 2048,
    chunkCount: 0,
    jobId: 'job-1',
    createdAt: new Date('2024-06-01T00:00:00.000Z'),
    updatedAt: new Date('2024-06-01T00:00:00.000Z'),
    ...overrides,
  }
}

function makeChunk(documentId: string): Chunk {
  return {
    id: randomUUID(),
    documentId,
    content: 'function example(): void {}',
    chunkType: 'function',
    language: 'typescript',
    name: 'example',
    startLine: 1,
    endLine: 5,
    metadata: {},
    createdAt: new Date(),
  }
}

describe('DocumentRepository', () => {
  let container: Container
  let docRepository: DocumentRepository
  let chunkRepository: ChunkRepository

  beforeEach(() => {
    container = createTestContainer()
    docRepository = container.get<DocumentRepository>(TYPES.IDocumentRepository)
    chunkRepository = container.get<ChunkRepository>(TYPES.IChunkRepository)
  })

  describe('save', () => {
    it('persists a document to the database', async () => {
      const doc = makeDocument({ id: 'doc-1' })

      await docRepository.save(doc)

      const found = await docRepository.findById('doc-1')
      expect(found).not.toBeNull()
    })

    it('persists all scalar fields correctly', async () => {
      const doc = makeDocument({
        id: 'doc-1',
        sourcePath: '/src/indexer.ts',
        language: 'typescript',
        name: 'indexer.ts',
        checksum: 'xyz789',
        sizeBytes: 4096,
        chunkCount: 12,
      })

      await docRepository.save(doc)

      const found = await docRepository.findById('doc-1')
      expect(found!.sourcePath).toBe('/src/indexer.ts')
      expect(found!.language).toBe('typescript')
      expect(found!.checksum).toBe('xyz789')
      expect(found!.sizeBytes).toBe(4096)
      expect(found!.chunkCount).toBe(12)
    })

    it('persists imports when provided', async () => {
      const doc = makeDocument({
        id: 'doc-1',
        imports: ['events', 'path', 'fs'],
      })

      await docRepository.save(doc)

      const found = await docRepository.findById('doc-1')
      expect(found!.imports).toEqual(['events', 'path', 'fs'])
    })

    it('persists null imports correctly', async () => {
      const doc = makeDocument({ id: 'doc-1', imports: undefined })

      await docRepository.save(doc)

      const found = await docRepository.findById('doc-1')
      expect(found!.imports).toBeUndefined()
    })

    it('converts date fields to Date objects on retrieval', async () => {
      const doc = makeDocument({ id: 'doc-1' })

      await docRepository.save(doc)

      const found = await docRepository.findById('doc-1')
      expect(found!.createdAt).toBeInstanceOf(Date)
      expect(found!.updatedAt).toBeInstanceOf(Date)
    })
  })

  describe('findByPath', () => {
    it('returns the document when source path matches', async () => {
      const doc = makeDocument({ sourcePath: '/src/unique-path.ts' })
      await docRepository.save(doc)

      const found = await docRepository.findByPath('/src/unique-path.ts')

      expect(found).not.toBeNull()
      expect(found!.sourcePath).toBe('/src/unique-path.ts')
    })

    it('returns null when no document has that path', async () => {
      const found = await docRepository.findByPath('/src/nonexistent.ts')

      expect(found).toBeNull()
    })
  })

  describe('findById', () => {
    it('returns the document when it exists', async () => {
      const doc = makeDocument({ id: 'doc-abc' })
      await docRepository.save(doc)

      const found = await docRepository.findById('doc-abc')

      expect(found).not.toBeNull()
      expect(found!.id).toBe('doc-abc')
    })

    it('returns null when the document does not exist', async () => {
      const found = await docRepository.findById('nonexistent-id')

      expect(found).toBeNull()
    })
  })

  describe('listAll', () => {
    it('returns an empty array when no documents exist', async () => {
      const summaries = await docRepository.listAll()

      expect(summaries).toHaveLength(0)
    })

    it('returns summaries for all saved documents', async () => {
      await docRepository.save(makeDocument({ sourcePath: '/src/a.ts' }))
      await docRepository.save(makeDocument({ sourcePath: '/src/b.ts' }))
      await docRepository.save(makeDocument({ sourcePath: '/src/c.ts' }))

      const summaries = await docRepository.listAll()

      expect(summaries).toHaveLength(3)
    })

    it('includes the correct fields in each summary', async () => {
      await docRepository.save(
        makeDocument({
          id: 'doc-1',
          name: 'parser.ts',
          sourcePath: '/src/parser.ts',
          language: 'typescript',
          chunkCount: 8,
        })
      )

      const summaries = await docRepository.listAll()

      expect(summaries[0]!.id).toBe('doc-1')
      expect(summaries[0]!.name).toBe('parser.ts')
      expect(summaries[0]!.sourcePath).toBe('/src/parser.ts')
      expect(summaries[0]!.language).toBe('typescript')
      expect(summaries[0]!.chunkCount).toBe(8)
      expect(summaries[0]!.updatedAt).toBeInstanceOf(Date)
    })
  })

  describe('updateChecksum', () => {
    it('updates the checksum for the specified document', async () => {
      const doc = makeDocument({ id: 'doc-1', checksum: 'old-checksum' })
      await docRepository.save(doc)

      await docRepository.updateChecksum('doc-1', 'new-checksum')

      const found = await docRepository.findById('doc-1')
      expect(found!.checksum).toBe('new-checksum')
    })

    it('does not affect other documents', async () => {
      await docRepository.save(makeDocument({ id: 'doc-1', sourcePath: '/src/a.ts', checksum: 'checksum-a' }))
      await docRepository.save(makeDocument({ id: 'doc-2', sourcePath: '/src/b.ts', checksum: 'checksum-b' }))

      await docRepository.updateChecksum('doc-1', 'updated-checksum')

      const other = await docRepository.findById('doc-2')
      expect(other!.checksum).toBe('checksum-b')
    })
  })

  describe('delete', () => {
    it('removes the document from the database', async () => {
      const doc = makeDocument({ id: 'doc-1' })
      await docRepository.save(doc)

      await docRepository.delete('doc-1')

      expect(await docRepository.findById('doc-1')).toBeNull()
    })

    it('cascades deletion to associated chunks', async () => {
      const doc = makeDocument({ id: 'doc-1' })
      await docRepository.save(doc)
      await chunkRepository.saveBatch([
        makeChunk('doc-1'),
        makeChunk('doc-1'),
      ])

      await docRepository.delete('doc-1')

      expect(await chunkRepository.count()).toBe(0)
    })

    it('does not throw when the document does not exist', async () => {
      await expect(docRepository.delete('nonexistent-id')).resolves.not.toThrow()
    })
  })

  describe('getStats', () => {
    it('returns zero totals when the database is empty', async () => {
      const stats = await docRepository.getStats()

      expect(stats.totalDocuments).toBe(0)
      expect(stats.totalChunks).toBe(0)
      expect(stats.totalEmbeddings).toBe(0)
    })

    it('counts documents correctly', async () => {
      await docRepository.save(makeDocument({ sourcePath: '/src/a.ts' }))
      await docRepository.save(makeDocument({ sourcePath: '/src/b.ts' }))

      const stats = await docRepository.getStats()

      expect(stats.totalDocuments).toBe(2)
    })

    it('counts chunks correctly', async () => {
      const doc = makeDocument({ id: 'doc-1', chunkCount: 2 })
      await docRepository.save(doc)
      await chunkRepository.saveBatch([makeChunk('doc-1'), makeChunk('doc-1')])

      const stats = await docRepository.getStats()

      expect(stats.totalChunks).toBe(2)
    })

    it('groups chunk counts by language', async () => {
      const tsDoc = makeDocument({ id: 'doc-ts', sourcePath: '/src/a.ts', language: 'typescript', chunkCount: 1 })
      const pyDoc = makeDocument({ id: 'doc-py', sourcePath: '/src/b.py', language: 'python', chunkCount: 1 })

      await docRepository.save(tsDoc)
      await docRepository.save(pyDoc)

      await chunkRepository.save(makeChunk('doc-ts'))
      await chunkRepository.save({ ...makeChunk('doc-py'), language: 'python' })

      const stats = await docRepository.getStats()

      expect(stats.byLanguage['typescript']).toBe(1)
      expect(stats.byLanguage['python']).toBe(1)
    })

    it('groups chunk counts by chunk type', async () => {
      const doc = makeDocument({ id: 'doc-1', chunkCount: 3 })
      await docRepository.save(doc)

      await chunkRepository.save({ ...makeChunk('doc-1'), chunkType: 'function' })
      await chunkRepository.save({ ...makeChunk('doc-1'), chunkType: 'class' })
      await chunkRepository.save({ ...makeChunk('doc-1'), chunkType: 'function' })

      const stats = await docRepository.getStats()

      expect(stats.byChunkType['function']).toBe(2)
      expect(stats.byChunkType['class']).toBe(1)
    })

    it('includes lastIndexedAt when documents exist', async () => {
      await docRepository.save(makeDocument({ sourcePath: '/src/a.ts' }))

      const stats = await docRepository.getStats()

      expect(stats.lastIndexedAt).toBeInstanceOf(Date)
    })

    it('omits lastIndexedAt when database is empty', async () => {
      const stats = await docRepository.getStats()

      expect(stats.lastIndexedAt).toBeUndefined()
    })
  })
})