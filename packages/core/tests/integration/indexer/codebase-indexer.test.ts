import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { createContainer } from '../../../src/container/container'
import { BM25Retriever } from '../../../src/retrieval/strategies/bm25/bm25-retriever'
import { TYPES } from '../../../src/container/types'
import type { IIndexer } from '../../../src/interfaces/indexer.interface'
import type { PathseekrConfig } from '@pathseekr/shared'
import type { SearchQuery } from '@pathseekr/shared'
import { fixturePath } from '../../../../../test-support/helpers/fixtures'

const TS_FIXTURE_CONTENT = fs.readFileSync(
  fixturePath('typescript', 'simple-class.ts'),
  'utf-8'
)

function createTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'pathseekr-indexer-test-'))
}

function removeTempDir(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true })
}

function makeTestConfig(): PathseekrConfig {
  return {
    embedding: {
      provider: 'ollama',
      model: 'nomic-embed-text',
      baseUrl: 'http://localhost:11434',
      dimensions: 768,
      batchSize: 20,
    },
    llm: {
      provider: 'ollama',
      model: 'llama2',
      baseUrl: 'http://localhost:11434',
    },
    storage: {
      dataDir: os.tmpdir(),
    },
    indexing: {
      maxFileSizeBytes: 1_048_576,
      concurrency: 2,
      excludePatterns: [],
    },
    retrieval: {
      defaultLimit: 10,
      bm25Weight: 0.5,
    },
    server: {
      apiPort: 3001,
      mcpPort: 3002,
      webPort: 3000,
    },
    logLevel: 'error',
    nodeEnv: 'test',
  }
}

function makeSearchQuery(query: string, limit = 10): SearchQuery {
  return { query, limit, strategy: 'bm25' }
}

describe('CodebaseIndexer', () => {
  let tempDir: string
  let dbPath: string

  beforeEach(() => {
    tempDir = createTempDir()
    dbPath = path.join(tempDir, 'test.db')
  })

  afterEach(() => {
    removeTempDir(tempDir)
  })

  describe('single file indexing', () => {
    let sourceDir: string

    beforeEach(() => {
      sourceDir = path.join(tempDir, 'src')
      fs.mkdirSync(sourceDir)
      fs.writeFileSync(
        path.join(sourceDir, 'simple-class.ts'),
        TS_FIXTURE_CONTENT
      )
    })

    it('returns a completed job', async () => {
      const container = createContainer(makeTestConfig(), dbPath)
      const indexer = container.get<IIndexer>(TYPES.IIndexer)

      const job = await indexer.index(sourceDir, { skipEmbedding: true })

      expect(job.status).toBe('completed')
    })

    it('indexes the TypeScript file', async () => {
      const container = createContainer(makeTestConfig(), dbPath)
      const indexer = container.get<IIndexer>(TYPES.IIndexer)

      const job = await indexer.index(sourceDir, { skipEmbedding: true })

      expect(job.totalFiles).toBe(1)
    })

    it('creates chunks from the parsed file', async () => {
      const container = createContainer(makeTestConfig(), dbPath)
      const indexer = container.get<IIndexer>(TYPES.IIndexer)

      const job = await indexer.index(sourceDir, { skipEmbedding: true })

      expect(job.totalChunks).toBeGreaterThan(0)
    })

    it('creates the project map file alongside the database', async () => {
      const container = createContainer(makeTestConfig(), dbPath)
      const indexer = container.get<IIndexer>(TYPES.IIndexer)

      await indexer.index(sourceDir, { skipEmbedding: true })

      const mapPath = path.join(tempDir, 'test-project-map.txt')
      expect(fs.existsSync(mapPath)).toBe(true)
    })

    it('makes BM25 search available after indexing', async () => {
      const container = createContainer(makeTestConfig(), dbPath)
      const indexer = container.get<IIndexer>(TYPES.IIndexer)
      const retriever = container.get<BM25Retriever>(TYPES.BM25Retriever)

      await indexer.index(sourceDir, { skipEmbedding: true })

      expect(await retriever.isReady()).toBe(true)
    })

    it('returns relevant search results after indexing', async () => {
      const container = createContainer(makeTestConfig(), dbPath)
      const indexer = container.get<IIndexer>(TYPES.IIndexer)
      const retriever = container.get<BM25Retriever>(TYPES.BM25Retriever)

      await indexer.index(sourceDir, { skipEmbedding: true })

      const results = await retriever.search(makeSearchQuery('DataProcessor'))
      expect(results.length).toBeGreaterThan(0)
    })

    it('finds the class by name in search results', async () => {
      const container = createContainer(makeTestConfig(), dbPath)
      const indexer = container.get<IIndexer>(TYPES.IIndexer)
      const retriever = container.get<BM25Retriever>(TYPES.BM25Retriever)

      await indexer.index(sourceDir, { skipEmbedding: true })

      const results = await retriever.search(makeSearchQuery('DataProcessor'))
      const names = results.map((r) => r.chunk.name)
      expect(names.some((n) => n.includes('DataProcessor'))).toBe(true)
    })
  })

  describe('change detection', () => {
    let sourceDir: string
    let filePath: string

    beforeEach(() => {
      sourceDir = path.join(tempDir, 'src')
      fs.mkdirSync(sourceDir)
      filePath = path.join(sourceDir, 'simple-class.ts')
      fs.writeFileSync(filePath, TS_FIXTURE_CONTENT)
    })

    it('marks files as unchanged on second index run without changes', async () => {
      const container = createContainer(makeTestConfig(), dbPath)
      const indexer = container.get<IIndexer>(TYPES.IIndexer)

      await indexer.index(sourceDir, { skipEmbedding: true })
      const secondJob = await indexer.index(sourceDir, { skipEmbedding: true })

      expect(secondJob.unchangedFiles).toBe(1)
      expect(secondJob.newFiles).toBe(0)
    })

    it('marks a file as changed after its content is modified', async () => {
      const container = createContainer(makeTestConfig(), dbPath)
      const indexer = container.get<IIndexer>(TYPES.IIndexer)

      await indexer.index(sourceDir, { skipEmbedding: true })

      fs.appendFileSync(filePath, '\n// modified')
      const secondJob = await indexer.index(sourceDir, { skipEmbedding: true })

      expect(secondJob.changedFiles).toBe(1)
      expect(secondJob.unchangedFiles).toBe(0)
    })

    it('creates no new chunks when re-indexing unchanged files', async () => {
      const container = createContainer(makeTestConfig(), dbPath)
      const indexer = container.get<IIndexer>(TYPES.IIndexer)
      const retriever = container.get<BM25Retriever>(TYPES.BM25Retriever)

      await indexer.index(sourceDir, { skipEmbedding: true })
      const secondJob = await indexer.index(sourceDir, { skipEmbedding: true })

      expect(secondJob.totalChunks).toBe(0)
      expect(secondJob.unchangedFiles).toBe(1)

      const results = await retriever.search(makeSearchQuery('DataProcessor'))
      expect(results.length).toBeGreaterThan(0)
    })
  })

  describe('multi-file indexing', () => {
    let sourceDir: string

    beforeEach(() => {
      sourceDir = path.join(tempDir, 'src')
      fs.mkdirSync(sourceDir)

      fs.writeFileSync(
        path.join(sourceDir, 'processor.ts'),
        TS_FIXTURE_CONTENT
      )
      fs.writeFileSync(
        path.join(sourceDir, 'service.ts'),
        [
          'export class ServiceA {',
          '    run(): void {}',
          '}',
          '',
          'export class ServiceB extends ServiceA {',
          '    run(): void {}',
          '    stop(): void {}',
          '}',
        ].join('\n')
      )
      fs.writeFileSync(
        path.join(sourceDir, 'utils.ts'),
        [
          'export function formatDate(date: Date): string {',
          '    return date.toISOString()',
          '}',
          '',
          'export function parseDate(input: string): Date {',
          '    return new Date(input)',
          '}',
        ].join('\n')
      )
    })

    it('indexes all TypeScript files in the directory', async () => {
      const container = createContainer(makeTestConfig(), dbPath)
      const indexer = container.get<IIndexer>(TYPES.IIndexer)

      const job = await indexer.index(sourceDir, { skipEmbedding: true })

      expect(job.totalFiles).toBe(3)
    })

    it('creates chunks from all indexed files', async () => {
      const container = createContainer(makeTestConfig(), dbPath)
      const indexer = container.get<IIndexer>(TYPES.IIndexer)

      const job = await indexer.index(sourceDir, { skipEmbedding: true })

      expect(job.totalChunks).toBeGreaterThan(5)
    })

    it('finds results from different files in search', async () => {
      const container = createContainer(makeTestConfig(), dbPath)
      const indexer = container.get<IIndexer>(TYPES.IIndexer)
      const retriever = container.get<BM25Retriever>(TYPES.BM25Retriever)

      await indexer.index(sourceDir, { skipEmbedding: true })

      const processorResults = await retriever.search(makeSearchQuery('DataProcessor'))
      const utilsResults = await retriever.search(makeSearchQuery('formatDate'))

      expect(processorResults.length).toBeGreaterThan(0)
      expect(utilsResults.length).toBeGreaterThan(0)
    })

    it('skips non-TypeScript files and counts them as skipped', async () => {
      fs.writeFileSync(path.join(sourceDir, 'notes.md'), '# Notes')
      fs.writeFileSync(path.join(sourceDir, 'config.json'), '{}')

      const container = createContainer(makeTestConfig(), dbPath)
      const indexer = container.get<IIndexer>(TYPES.IIndexer)

      const job = await indexer.index(sourceDir, { skipEmbedding: true })

      expect(job.totalFiles).toBe(3)
      expect(job.skippedFiles).toBeGreaterThan(0)
    })
  })
})