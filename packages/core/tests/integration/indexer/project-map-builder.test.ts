import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { Container } from 'inversify'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { randomUUID } from 'crypto'
import { DatabaseConnection } from '../../../src/storage/database'
import { DocumentRepository } from '../../../src/storage/document-repository'
import { ChunkRepository } from '../../../src/storage/chunk-repository'
import { ProjectMapBuilder } from '../../../src/indexer/project-map-builder'
import { TYPES } from '../../../src/container/types'
import type { Document, Chunk } from '@pathseekr/shared'

function createTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'pathseekr-map-test-'))
}

function removeTempDir(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true })
}


function createTestContainer(dbPath: string): Container {
  const container = new Container({ defaultScope: 'Singleton' })

  container
    .bind<string>(TYPES.DatabasePath)
    .toConstantValue(dbPath)

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
    .bind<ProjectMapBuilder>(TYPES.ProjectMapBuilder)
    .to(ProjectMapBuilder)

  return container
}

function makeDocument(overrides: Partial<Document> = {}): Document {
  return {
    id: randomUUID(),
    sourcePath: '/src/test.ts',
    sourceType: 'filesystem',
    documentType: 'code',
    language: 'typescript',
    name: 'test.ts',
    checksum: 'abc',
    sizeBytes: 1000,
    chunkCount: 0,
    jobId: 'job-1',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }
}

function makeChunk(documentId: string, overrides: Partial<Chunk> = {}): Chunk {
  return {
    id: randomUUID(),
    documentId,
    content: 'content',
    chunkType: 'function',
    language: 'typescript',
    name: 'example',
    startLine: 1,
    endLine: 5,
    metadata: {},
    createdAt: new Date(),
    ...overrides,
  }
}

describe('ProjectMapBuilder', () => {
  let tempDir: string
  let dbPath: string
  let container: Container
  let docRepository: DocumentRepository
  let chunkRepository: ChunkRepository
  let builder: ProjectMapBuilder

  beforeEach(() => {
    tempDir = createTempDir()
    dbPath = path.join(tempDir, 'test.db')
    container = createTestContainer(dbPath)
    docRepository = container.get<DocumentRepository>(TYPES.IDocumentRepository)
    chunkRepository = container.get<ChunkRepository>(TYPES.IChunkRepository)
    builder = container.get<ProjectMapBuilder>(TYPES.ProjectMapBuilder)
  })

  afterEach(() => {
    removeTempDir(tempDir)
  })

  describe('output file location', () => {
    it('creates the project map co-located with the database', async () => {
      await builder.build(tempDir)

      const mapPath = path.join(tempDir, 'test-project-map.txt')
      expect(fs.existsSync(mapPath)).toBe(true)
    })

    it('derives the map filename from the database filename', async () => {
      await builder.build(tempDir)

      const entries = fs.readdirSync(tempDir)
      expect(entries.some((e) => e.endsWith('-project-map.txt'))).toBe(true)
    })
  })

  describe('file header', () => {
    it('includes the Pathseekr project map title', async () => {
      await builder.build(tempDir)

      const content = fs.readFileSync(
        path.join(tempDir, 'test-project-map.txt'),
        'utf-8'
      )
      expect(content).toContain('# Pathseekr Project Map')
    })

    it('includes a generated timestamp', async () => {
      await builder.build(tempDir)

      const content = fs.readFileSync(
        path.join(tempDir, 'test-project-map.txt'),
        'utf-8'
      )
      expect(content).toContain('# Generated:')
    })

    it('includes the file and chunk count summary', async () => {
      const doc = makeDocument({ id: 'doc-1', chunkCount: 2 })
      await docRepository.save(doc)
      await chunkRepository.saveBatch([
        makeChunk('doc-1', { chunkType: 'function' }),
        makeChunk('doc-1', { chunkType: 'class' }),
      ])

      await builder.build(tempDir)

      const content = fs.readFileSync(
        path.join(tempDir, 'test-project-map.txt'),
        'utf-8'
      )
      expect(content).toContain('1 files | 2 chunks')
    })
  })

  describe('empty repository', () => {
    it('produces a file with only the header when no documents exist', async () => {
      await builder.build(tempDir)

      const content = fs.readFileSync(
        path.join(tempDir, 'test-project-map.txt'),
        'utf-8'
      )
      expect(content).toContain('0 files | 0 chunks')
    })
  })

  describe('document listing', () => {
    it('lists documents sorted alphabetically by source path', async () => {
      await docRepository.save(makeDocument({
        id: 'doc-c',
        sourcePath: '/src/c-retriever.ts',
        name: 'c-retriever.ts',
      }))
      await docRepository.save(makeDocument({
        id: 'doc-a',
        sourcePath: '/src/a-indexer.ts',
        name: 'a-indexer.ts',
      }))
      await docRepository.save(makeDocument({
        id: 'doc-b',
        sourcePath: '/src/b-parser.ts',
        name: 'b-parser.ts',
      }))

      await builder.build('/src')

      const content = fs.readFileSync(
        path.join(tempDir, 'test-project-map.txt'),
        'utf-8'
      )
      const aIndex = content.indexOf('a-indexer.ts')
      const bIndex = content.indexOf('b-parser.ts')
      const cIndex = content.indexOf('c-retriever.ts')

      expect(aIndex).toBeLessThan(bIndex)
      expect(bIndex).toBeLessThan(cIndex)
    })

    it('shows paths relative to the rootPath argument', async () => {
      await docRepository.save(makeDocument({
        id: 'doc-1',
        sourcePath: '/src/parsers/typescript-parser.ts',
        name: 'typescript-parser.ts',
      }))

      await builder.build('/src')

      const content = fs.readFileSync(
        path.join(tempDir, 'test-project-map.txt'),
        'utf-8'
      )
      expect(content).toContain('parsers/typescript-parser.ts')
      expect(content).not.toContain('/src/parsers/typescript-parser.ts')
    })

    it('shows the language tag next to each file', async () => {
      await docRepository.save(makeDocument({
        id: 'doc-1',
        sourcePath: '/src/parser.py',
        language: 'python',
        name: 'parser.py',
      }))

      await builder.build('/src')

      const content = fs.readFileSync(
        path.join(tempDir, 'test-project-map.txt'),
        'utf-8'
      )
      expect(content).toContain('[python]')
    })
  })

  describe('chunk rendering', () => {
    it('renders class names', async () => {
      const doc = makeDocument({ id: 'doc-1', sourcePath: '/src/indexer.ts' })
      await docRepository.save(doc)
      await chunkRepository.save(makeChunk('doc-1', {
        chunkType: 'class',
        name: 'CodebaseIndexer',
        metadata: {},
      }))

      await builder.build('/src')

      const content = fs.readFileSync(
        path.join(tempDir, 'test-project-map.txt'),
        'utf-8'
      )
      expect(content).toContain('  class CodebaseIndexer')
    })

    it('renders method signatures indented under their class', async () => {
      const doc = makeDocument({ id: 'doc-1', sourcePath: '/src/indexer.ts' })
      await docRepository.save(doc)
      await chunkRepository.saveBatch([
        makeChunk('doc-1', {
          chunkType: 'class',
          name: 'CodebaseIndexer',
          metadata: {},
        }),
        makeChunk('doc-1', {
          chunkType: 'method',
          name: 'CodebaseIndexer.index',
          metadata: {
            parentName: 'CodebaseIndexer',
            signature: 'index(sourcePath: string): Promise<IngestionJob>',
          },
        }),
      ])

      await builder.build('/src')

      const content = fs.readFileSync(
        path.join(tempDir, 'test-project-map.txt'),
        'utf-8'
      )
      expect(content).toContain('    index(sourcePath: string): Promise<IngestionJob>')
    })

    it('renders interface names', async () => {
      const doc = makeDocument({ id: 'doc-1', sourcePath: '/src/retriever.ts' })
      await docRepository.save(doc)
      await chunkRepository.save(makeChunk('doc-1', {
        chunkType: 'interface',
        name: 'IRetriever',
        metadata: {},
      }))

      await builder.build('/src')

      const content = fs.readFileSync(
        path.join(tempDir, 'test-project-map.txt'),
        'utf-8'
      )
      expect(content).toContain('  interface IRetriever')
    })

    it('renders type alias names', async () => {
      const doc = makeDocument({ id: 'doc-1', sourcePath: '/src/types.ts' })
      await docRepository.save(doc)
      await chunkRepository.save(makeChunk('doc-1', {
        chunkType: 'type',
        name: 'RetrievalStrategy',
        metadata: {},
      }))

      await builder.build('/src')

      const content = fs.readFileSync(
        path.join(tempDir, 'test-project-map.txt'),
        'utf-8'
      )
      expect(content).toContain('  type RetrievalStrategy')
    })

    it('renders function signatures with fn prefix', async () => {
      const doc = makeDocument({ id: 'doc-1', sourcePath: '/src/utils.ts' })
      await docRepository.save(doc)
      await chunkRepository.save(makeChunk('doc-1', {
        chunkType: 'function',
        name: 'formatBytes',
        metadata: { signature: 'formatBytes(bytes: number): string' },
      }))

      await builder.build('/src')

      const content = fs.readFileSync(
        path.join(tempDir, 'test-project-map.txt'),
        'utf-8'
      )
      expect(content).toContain('  fn formatBytes(bytes: number): string')
    })

    it('falls back to name() when function has no signature', async () => {
      const doc = makeDocument({ id: 'doc-1', sourcePath: '/src/utils.ts' })
      await docRepository.save(doc)
      await chunkRepository.save(makeChunk('doc-1', {
        chunkType: 'function',
        name: 'doSomething',
        metadata: {},
      }))

      await builder.build('/src')

      const content = fs.readFileSync(
        path.join(tempDir, 'test-project-map.txt'),
        'utf-8'
      )
      expect(content).toContain('  fn doSomething()')
    })
  })
})