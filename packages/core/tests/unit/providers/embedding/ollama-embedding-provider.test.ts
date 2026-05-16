import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Ollama } from 'ollama'
import type { PathseekrConfig } from '@pathseekr/shared'
import { OllamaEmbeddingProvider } from '../../../../src/providers/embedding/ollama-embedding-provider'


vi.mock('ollama', () => ({
  Ollama: vi.fn(),
}))

function makeTestConfig(overrides: Partial<PathseekrConfig['embedding']> = {}): PathseekrConfig {
  return {
    embedding: {
      provider: 'ollama',
      model: 'nomic-embed-text',
      baseUrl: 'http://localhost:11434',
      dimensions: 768,
      batchSize: 3,
      ...overrides,
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

describe('OllamaEmbeddingProvider', () => {
  let mockEmbeddings: ReturnType<typeof vi.fn>
  let provider: OllamaEmbeddingProvider

  beforeEach(() => {
    mockEmbeddings = vi.fn().mockResolvedValue({
      embedding: [0.1, 0.2, 0.3],
    })

    vi.mocked(Ollama).mockImplementation(function() {
      return { embeddings: mockEmbeddings } as unknown as Ollama
    })

    provider = new OllamaEmbeddingProvider(makeTestConfig())
  })

  describe('constructor', () => {
    it('sets modelName from config', () => {
      expect(provider.modelName).toBe('nomic-embed-text')
    })

    it('sets dimensions from config', () => {
      expect(provider.dimensions).toBe(768)
    })

    it('creates the Ollama client with the configured baseUrl', () => {
      expect(vi.mocked(Ollama)).toHaveBeenCalledWith({
        host: 'http://localhost:11434',
      })
    })

    it('uses the correct model name from a different config', () => {
      const customProvider = new OllamaEmbeddingProvider(
        makeTestConfig({ model: 'mxbai-embed-large', dimensions: 1024 })
      )

      expect(customProvider.modelName).toBe('mxbai-embed-large')
      expect(customProvider.dimensions).toBe(1024)
    })
  })

  describe('embed', () => {
    it('calls client.embeddings with the correct model and prompt', async () => {
      await provider.embed('some code content')

      expect(mockEmbeddings).toHaveBeenCalledWith({
        model: 'nomic-embed-text',
        prompt: 'some code content',
      })
    })

    it('returns the embedding from the client response', async () => {
      mockEmbeddings.mockResolvedValue({ embedding: [0.5, 0.6, 0.7] })

      const result = await provider.embed('test')

      expect(result.embedding).toEqual([0.5, 0.6, 0.7])
    })

    it('calculates tokenCount as the number of whitespace-separated words', async () => {
      const result = await provider.embed('function parseResult handles input')

      expect(result.tokenCount).toBe(4)
    })

    it('returns tokenCount of 1 for a single-word input', async () => {
      const result = await provider.embed('parseResult')

      expect(result.tokenCount).toBe(1)
    })

    it('returns tokenCount of 1 for an empty string', async () => {
      const result = await provider.embed('')

      expect(result.tokenCount).toBe(1)
    })

    it('calls embeddings exactly once per embed call', async () => {
      await provider.embed('first')
      await provider.embed('second')

      expect(mockEmbeddings).toHaveBeenCalledTimes(2)
    })
  })

  describe('embedBatch', () => {
    it('returns an empty array for empty input', async () => {
      const results = await provider.embedBatch([])

      expect(results).toHaveLength(0)
    })

    it('returns one result per input text', async () => {
      const results = await provider.embedBatch(['a', 'b', 'c'])

      expect(results).toHaveLength(3)
    })

    it('calls embeddings once per text', async () => {
      await provider.embedBatch(['a', 'b', 'c'])

      expect(mockEmbeddings).toHaveBeenCalledTimes(3)
    })

    it('preserves the order of results matching the order of inputs', async () => {
      let callCount = 0
      mockEmbeddings.mockImplementation(() => {
        callCount++
        return Promise.resolve({ embedding: [callCount, 0, 0] })
      })

      const results = await provider.embedBatch(['first', 'second', 'third'])

      expect(results[0]!.embedding[0]).toBe(1)
      expect(results[1]!.embedding[0]).toBe(2)
      expect(results[2]!.embedding[0]).toBe(3)
    })

    it('processes texts in batches of the configured batchSize', async () => {
      const texts = ['a', 'b', 'c', 'd', 'e', 'f', 'g']

      await provider.embedBatch(texts)

      expect(mockEmbeddings).toHaveBeenCalledTimes(7)
    })

    it('handles a batch smaller than batchSize without throwing', async () => {
      const results = await provider.embedBatch(['only-one'])

      expect(results).toHaveLength(1)
    })

    it('handles a batch exactly equal to batchSize', async () => {
      const results = await provider.embedBatch(['a', 'b', 'c'])

      expect(results).toHaveLength(3)
      expect(mockEmbeddings).toHaveBeenCalledTimes(3)
    })

    it('returns results with correct tokenCount per text', async () => {
      const results = await provider.embedBatch([
        'one word',
        'three words here',
      ])

      expect(results[0]!.tokenCount).toBe(2)
      expect(results[1]!.tokenCount).toBe(3)
    })
  })
})