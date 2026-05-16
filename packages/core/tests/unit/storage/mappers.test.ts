import { describe, it, expect } from 'vitest'
import {
  mapDocument,
  mapDocumentSummary,
  mapChunk,
  mapStoredChunk,
  embeddingToBuffer,
  bufferToEmbedding,
} from '../../../src/storage/mappers'
import type { RawDocument, RawChunk, RawChunkWithEmbedding, RawDocumentSummary } from '../../../src/storage/schema'

function makeRawDocument(overrides: Partial<RawDocument> = {}): RawDocument {
  return {
    id: 'doc-1',
    source_path: '/src/parser.ts',
    source_type: 'filesystem',
    document_type: 'code',
    language: 'typescript',
    name: 'parser.ts',
    checksum: 'abc123',
    size_bytes: 2048,
    chunk_count: 5,
    job_id: 'job-1',
    created_at: '2024-06-01T10:00:00.000Z',
    updated_at: '2024-06-01T10:00:00.000Z',
    imports: null,
    ...overrides,
  }
}

function makeRawChunk(overrides: Partial<RawChunk> = {}): RawChunk {
  return {
    id: 'chunk-1',
    document_id: 'doc-1',
    content: 'function parseResult(input: string): Result {}',
    chunk_type: 'function',
    language: 'typescript',
    name: 'parseResult',
    start_line: 10,
    end_line: 20,
    metadata: '{"signature":"parseResult(input: string): Result","isExported":true}',
    created_at: '2024-06-01T10:00:00.000Z',
    breadcrumb: 'File: /src/parser.ts\nFunction: parseResult',
    ...overrides,
  }
}

describe('Storage mappers', () => {
  describe('mapDocument', () => {
    it('maps all scalar fields correctly', () => {
      const result = mapDocument(makeRawDocument())

      expect(result.id).toBe('doc-1')
      expect(result.sourcePath).toBe('/src/parser.ts')
      expect(result.sourceType).toBe('filesystem')
      expect(result.documentType).toBe('code')
      expect(result.language).toBe('typescript')
      expect(result.name).toBe('parser.ts')
      expect(result.checksum).toBe('abc123')
      expect(result.sizeBytes).toBe(2048)
      expect(result.chunkCount).toBe(5)
      expect(result.jobId).toBe('job-1')
    })

    it('converts created_at and updated_at strings to Date objects', () => {
      const result = mapDocument(makeRawDocument())

      expect(result.createdAt).toBeInstanceOf(Date)
      expect(result.updatedAt).toBeInstanceOf(Date)
      expect(result.createdAt.toISOString()).toBe('2024-06-01T10:00:00.000Z')
    })

    it('parses imports from a JSON string when present', () => {
      const result = mapDocument(
        makeRawDocument({ imports: '["events","path"]' })
      )

      expect(result.imports).toEqual(['events', 'path'])
    })

    it('sets imports to undefined when the column is null', () => {
      const result = mapDocument(makeRawDocument({ imports: null }))

      expect(result.imports).toBeUndefined()
    })
  })

  describe('mapDocumentSummary', () => {
    it('maps all fields correctly', () => {
      const raw: RawDocumentSummary = {
        id: 'doc-1',
        name: 'parser.ts',
        source_path: '/src/parser.ts',
        language: 'typescript',
        chunk_count: 8,
        updated_at: '2024-06-01T10:00:00.000Z',
      }

      const result = mapDocumentSummary(raw)

      expect(result.id).toBe('doc-1')
      expect(result.name).toBe('parser.ts')
      expect(result.sourcePath).toBe('/src/parser.ts')
      expect(result.language).toBe('typescript')
      expect(result.chunkCount).toBe(8)
      expect(result.updatedAt).toBeInstanceOf(Date)
    })
  })

  describe('mapChunk', () => {
    it('maps all scalar fields correctly', () => {
      const result = mapChunk(makeRawChunk())

      expect(result.id).toBe('chunk-1')
      expect(result.documentId).toBe('doc-1')
      expect(result.content).toBe('function parseResult(input: string): Result {}')
      expect(result.chunkType).toBe('function')
      expect(result.language).toBe('typescript')
      expect(result.name).toBe('parseResult')
      expect(result.startLine).toBe(10)
      expect(result.endLine).toBe(20)
      expect(result.breadcrumb).toBe('File: /src/parser.ts\nFunction: parseResult')
    })

    it('parses metadata from JSON string', () => {
      const result = mapChunk(makeRawChunk())

      expect(result.metadata).toEqual({
        signature: 'parseResult(input: string): Result',
        isExported: true,
      })
    })

    it('converts created_at string to a Date object', () => {
      const result = mapChunk(makeRawChunk())

      expect(result.createdAt).toBeInstanceOf(Date)
      expect(result.createdAt.toISOString()).toBe('2024-06-01T10:00:00.000Z')
    })
  })

  describe('mapStoredChunk', () => {
    it('returns a chunk without embedding when embedding column is null', () => {
      const raw: RawChunkWithEmbedding = {
        ...makeRawChunk(),
        embedding: null,
      }

      const result = mapStoredChunk(raw)

      expect((result as { embedding?: number[] }).embedding).toBeUndefined()
    })

    it('returns a chunk with embedding when embedding column has data', () => {
      const original = [0.1, 0.2, 0.3]
      const raw: RawChunkWithEmbedding = {
        ...makeRawChunk(),
        embedding: embeddingToBuffer(original),
      }

      const result = mapStoredChunk(raw) as { embedding: number[] }

      expect(result.embedding).toBeDefined()
      expect(result.embedding).toHaveLength(3)
    })

    it('correctly round-trips embedding values through buffer conversion', () => {
      const original = [1.0, 0.0, 0.5]
      const raw: RawChunkWithEmbedding = {
        ...makeRawChunk(),
        embedding: embeddingToBuffer(original),
      }

      const result = mapStoredChunk(raw) as { embedding: number[] }

      for (let i = 0; i < original.length; i++) {
        expect(result.embedding[i]).toBeCloseTo(original[i]!, 5)
      }
    })
  })

  describe('embeddingToBuffer', () => {
    it('returns a Buffer', () => {
      const result = embeddingToBuffer([0.1, 0.2, 0.3])

      expect(Buffer.isBuffer(result)).toBe(true)
    })

    it('produces 4 bytes per dimension (Float32)', () => {
      const embedding = [0.1, 0.2, 0.3]
      const result = embeddingToBuffer(embedding)

      expect(result.byteLength).toBe(embedding.length * 4)
    })

    it('handles an empty embedding without throwing', () => {
      expect(() => embeddingToBuffer([])).not.toThrow()
    })
  })

  describe('bufferToEmbedding', () => {
    it('returns an array of numbers', () => {
      const buffer = embeddingToBuffer([0.1, 0.2, 0.3])
      const result = bufferToEmbedding(buffer)

      expect(Array.isArray(result)).toBe(true)
    })

    it('returns the correct number of dimensions', () => {
      const original = [0.1, 0.2, 0.3, 0.4]
      const buffer = embeddingToBuffer(original)
      const result = bufferToEmbedding(buffer)

      expect(result).toHaveLength(4)
    })

    it('round-trips values correctly within Float32 precision', () => {
      const original = [1.0, 0.5, 0.0, -0.5, -1.0]
      const buffer = embeddingToBuffer(original)
      const result = bufferToEmbedding(buffer)

      for (let i = 0; i < original.length; i++) {
        expect(result[i]).toBeCloseTo(original[i]!, 5)
      }
    })
  })
})