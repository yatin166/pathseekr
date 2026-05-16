import { describe, it, expect, beforeEach, vi } from 'vitest'
import { HybridRetriever } from '../../../../../src/retrieval/strategies/hybrid/hybrid-retriever'
import { BM25Retriever } from '../../../../../src/retrieval/strategies/bm25/bm25-retriever'
import { VectorRetriever } from '../../../../../src/retrieval/strategies/vector/vector-retriever'
import type { RetrievalResult, PathseekrConfig } from '@pathseekr/shared'


const TEST_CONFIG: PathseekrConfig = {
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
  storage: { dataDir: '/tmp' },
  indexing: { maxFileSizeBytes: 1_048_576, concurrency: 2, excludePatterns: [] },
  retrieval: { defaultLimit: 10, bm25Weight: 0.5 },
  server: { apiPort: 3001, mcpPort: 3002, webPort: 3000 },
  logLevel: 'error',
  nodeEnv: 'test',
}

function makeResult(
  id: string,
  name: string,
  score: number,
  strategy: RetrievalResult['strategy'] = 'bm25'
): RetrievalResult {
  return {
    chunk: {
      id,
      documentId: 'doc-1',
      content: `content for ${name}`,
      chunkType: 'function',
      language: 'typescript',
      name,
      startLine: 1,
      endLine: 10,
      metadata: {},
      createdAt: new Date(),
    },
    document: {
      id: 'doc-1',
      name: 'test.ts',
      sourcePath: '/src/test.ts',
      language: 'typescript',
      chunkCount: 5,
      updatedAt: new Date(),
    },
    score,
    strategy,
    rank: 1,
  }
}

function createMockBM25(results: RetrievalResult[] = [], ready = true): BM25Retriever {
  return {
    isReady: vi.fn().mockResolvedValue(ready),
    search: vi.fn().mockResolvedValue(results),
  } as unknown as BM25Retriever
}

function createMockVector(results: RetrievalResult[] = [], ready = true): VectorRetriever {
  return {
    isReady: vi.fn().mockResolvedValue(ready),
    search: vi.fn().mockResolvedValue(results),
  } as unknown as VectorRetriever
}

describe('HybridRetriever', () => {
  describe('isReady', () => {
    it('returns true when both BM25 and vector are ready', async () => {
      const retriever = new HybridRetriever(
        createMockBM25([], true),
        createMockVector([], true),
        TEST_CONFIG
      )

      expect(await retriever.isReady()).toBe(true)
    })

    it('returns false when BM25 is not ready', async () => {
      const retriever = new HybridRetriever(
        createMockBM25([], false),
        createMockVector([], true),
        TEST_CONFIG
      )

      expect(await retriever.isReady()).toBe(false)
    })

    it('returns false when vector is not ready', async () => {
      const retriever = new HybridRetriever(
        createMockBM25([], true),
        createMockVector([], false),
        TEST_CONFIG
      )

      expect(await retriever.isReady()).toBe(false)
    })

    it('returns false when neither is ready', async () => {
      const retriever = new HybridRetriever(
        createMockBM25([], false),
        createMockVector([], false),
        TEST_CONFIG
      )

      expect(await retriever.isReady()).toBe(false)
    })
  })

  describe('search — RRF fusion', () => {
    it('returns results from both sources combined', async () => {
      const bm25 = createMockBM25([
        makeResult('chunk-a', 'FunctionA', 0.9),
        makeResult('chunk-b', 'FunctionB', 0.7),
      ])
      const vector = createMockVector([
        makeResult('chunk-c', 'FunctionC', 0.85, 'vector'),
        makeResult('chunk-d', 'FunctionD', 0.6, 'vector'),
      ])

      const retriever = new HybridRetriever(bm25, vector, TEST_CONFIG)
      const results = await retriever.search({ query: 'function', limit: 10, strategy: 'hybrid' })

      const ids = results.map((r) => r.chunk.id)
      expect(ids).toContain('chunk-a')
      expect(ids).toContain('chunk-b')
      expect(ids).toContain('chunk-c')
      expect(ids).toContain('chunk-d')
    })

    it('scores a chunk appearing in both sources higher than one appearing in only one', async () => {
      // chunk-a appears in both BM25 (rank 1) and vector (rank 1)
      // chunk-b appears only in BM25 (rank 2)
      const sharedResult = makeResult('chunk-a', 'SharedChunk', 0.9)

      const bm25 = createMockBM25([
        sharedResult,
        makeResult('chunk-b', 'BM25Only', 0.8),
      ])
      const vector = createMockVector([
        { ...sharedResult, strategy: 'vector' },
        makeResult('chunk-c', 'VectorOnly', 0.75, 'vector'),
      ])

      const retriever = new HybridRetriever(bm25, vector, TEST_CONFIG)
      const results = await retriever.search({ query: 'chunk', limit: 10, strategy: 'hybrid' })

      const chunkAScore = results.find((r) => r.chunk.id === 'chunk-a')!.score
      const chunkBScore = results.find((r) => r.chunk.id === 'chunk-b')!.score
      const chunkCScore = results.find((r) => r.chunk.id === 'chunk-c')!.score

      expect(chunkAScore).toBeGreaterThan(chunkBScore)
      expect(chunkAScore).toBeGreaterThan(chunkCScore)
    })

    it('returns no results when both sources return nothing', async () => {
      const retriever = new HybridRetriever(
        createMockBM25([]),
        createMockVector([]),
        TEST_CONFIG
      )

      const results = await retriever.search({ query: 'nothing', limit: 10, strategy: 'hybrid' })

      expect(results).toHaveLength(0)
    })

    it('returns results when only BM25 has matches', async () => {
      const retriever = new HybridRetriever(
        createMockBM25([makeResult('chunk-a', 'FunctionA', 0.9)]),
        createMockVector([]),
        TEST_CONFIG
      )

      const results = await retriever.search({ query: 'function', limit: 10, strategy: 'hybrid' })

      expect(results.length).toBeGreaterThan(0)
      expect(results[0]!.chunk.id).toBe('chunk-a')
    })

    it('returns results when only vector has matches', async () => {
      const retriever = new HybridRetriever(
        createMockBM25([]),
        createMockVector([makeResult('chunk-a', 'FunctionA', 0.9, 'vector')]),
        TEST_CONFIG
      )

      const results = await retriever.search({ query: 'function', limit: 10, strategy: 'hybrid' })

      expect(results.length).toBeGreaterThan(0)
      expect(results[0]!.chunk.id).toBe('chunk-a')
    })

    it('respects the limit parameter', async () => {
      const bm25Results = Array.from({ length: 8 }, (_, i) =>
        makeResult(`chunk-${i}`, `Function${i}`, 0.9 - i * 0.05)
      )
      const vectorResults = Array.from({ length: 8 }, (_, i) =>
        makeResult(`chunk-v${i}`, `VFunction${i}`, 0.85 - i * 0.05, 'vector')
      )

      const retriever = new HybridRetriever(
        createMockBM25(bm25Results),
        createMockVector(vectorResults),
        TEST_CONFIG
      )

      const results = await retriever.search({ query: 'function', limit: 5, strategy: 'hybrid' })

      expect(results.length).toBeLessThanOrEqual(5)
    })

    it('returns results sorted by score descending', async () => {
      const bm25 = createMockBM25([
        makeResult('chunk-a', 'FunctionA', 0.9),
        makeResult('chunk-b', 'FunctionB', 0.5),
      ])
      const vector = createMockVector([
        makeResult('chunk-c', 'FunctionC', 0.8, 'vector'),
      ])

      const retriever = new HybridRetriever(bm25, vector, TEST_CONFIG)
      const results = await retriever.search({ query: 'function', limit: 10, strategy: 'hybrid' })

      for (let i = 0; i < results.length - 1; i++) {
        expect(results[i]!.score).toBeGreaterThanOrEqual(results[i + 1]!.score)
      }
    })

    it('sets strategy to hybrid on all returned results', async () => {
      const retriever = new HybridRetriever(
        createMockBM25([makeResult('chunk-a', 'FunctionA', 0.9)]),
        createMockVector([makeResult('chunk-b', 'FunctionB', 0.8, 'vector')]),
        TEST_CONFIG
      )

      const results = await retriever.search({ query: 'function', limit: 10, strategy: 'hybrid' })

      for (const result of results) {
        expect(result.strategy).toBe('hybrid')
      }
    })

    it('assigns sequential ranks starting at 1', async () => {
      const retriever = new HybridRetriever(
        createMockBM25([makeResult('chunk-a', 'FunctionA', 0.9)]),
        createMockVector([makeResult('chunk-b', 'FunctionB', 0.8, 'vector')]),
        TEST_CONFIG
      )

      const results = await retriever.search({ query: 'function', limit: 10, strategy: 'hybrid' })

      results.forEach((result, index) => {
        expect(result.rank).toBe(index + 1)
      })
    })
  })

  describe('search — name boost', () => {
    it('boosts a chunk whose name contains query terms', async () => {
      /**
      * IndexerService matches both "indexer" and "service" → gets full boost
      * UnrelatedClass matches neither → no boost
      * Set UnrelatedClass score higher initially so boost effect is visible
      */
      const bm25 = createMockBM25([
        makeResult('chunk-indexer', 'IndexerService', 0.6),
        makeResult('chunk-other', 'UnrelatedClass', 0.75),
      ])

      const retriever = new HybridRetriever(bm25, createMockVector([]), TEST_CONFIG)
      const results = await retriever.search({
        query: 'indexer service',
        limit: 10,
        strategy: 'hybrid',
      })

      const indexerScore = results.find((r) => r.chunk.id === 'chunk-indexer')!.score
      const otherScore = results.find((r) => r.chunk.id === 'chunk-other')!.score

      /**
      * IndexerService gets boosted by 0.25 (full match ratio)
      * 0.6 + 0.25 = 0.85 > 0.75 (UnrelatedClass)
      */
      expect(indexerScore).toBeGreaterThan(otherScore)
    })

    it('does not boost a chunk whose name does not match any query terms', async () => {
      /**
      * Two chunks at equal BM25 rank positions — same raw RRF score
      * TokenizerClass matches "tokenizer" → gets name boost
      * UnrelatedName matches nothing → no boost, stays at raw RRF score
      */
      const bm25 = createMockBM25([
        makeResult('chunk-matching', 'TokenizerClass', 0.9),
        makeResult('chunk-unrelated', 'UnrelatedName', 0.9),
      ])

      const retriever = new HybridRetriever(bm25, createMockVector([]), TEST_CONFIG)
      const results = await retriever.search({
        query: 'tokenizer',
        limit: 10,
        strategy: 'hybrid',
      })

      const matchingScore = results.find((r) => r.chunk.id === 'chunk-matching')!.score
      const unrelatedScore = results.find((r) => r.chunk.id === 'chunk-unrelated')!.score

      expect(matchingScore).toBeGreaterThan(unrelatedScore)
    })

    it('does not exceed a score of 1.0 after boost', async () => {
      const bm25 = createMockBM25([
        makeResult('chunk-a', 'IndexerService', 0.99),
      ])

      const retriever = new HybridRetriever(bm25, createMockVector([]), TEST_CONFIG)
      const results = await retriever.search({
        query: 'indexer service',
        limit: 10,
        strategy: 'hybrid',
      })

      for (const result of results) {
        expect(result.score).toBeLessThanOrEqual(1.0)
      }
    })
  })
})