import { describe, it, expect } from 'vitest'
import { mapRetrievalResult } from '../../../../src/retrieval/shared/mappers'
import type { RawChunkWithDocument } from '../../../../src/retrieval/shared/retrieval-queries'

function makeRawRow(overrides: Partial<RawChunkWithDocument> = {}): RawChunkWithDocument {
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
    created_at: '2024-06-01T12:00:00.000Z',
    doc_name: 'parser.ts',
    source_path: '/src/parsers/parser.ts',
    chunk_count: 8,
    ...overrides,
  }
}

describe('mapRetrievalResult', () => {
  describe('chunk mapping', () => {
    it('maps chunk id correctly', () => {
      const result = mapRetrievalResult(makeRawRow({ id: 'chunk-abc' }), 0.9, 1, 'bm25')

      expect(result.chunk.id).toBe('chunk-abc')
    })

    it('maps documentId from document_id', () => {
      const result = mapRetrievalResult(makeRawRow({ document_id: 'doc-xyz' }), 0.9, 1, 'bm25')

      expect(result.chunk.documentId).toBe('doc-xyz')
    })

    it('maps content correctly', () => {
      const result = mapRetrievalResult(makeRawRow({ content: 'class Foo {}' }), 0.9, 1, 'bm25')

      expect(result.chunk.content).toBe('class Foo {}')
    })

    it('maps chunkType from chunk_type', () => {
      const result = mapRetrievalResult(makeRawRow({ chunk_type: 'class' }), 0.9, 1, 'bm25')

      expect(result.chunk.chunkType).toBe('class')
    })

    it('maps language correctly', () => {
      const result = mapRetrievalResult(makeRawRow({ language: 'python' }), 0.9, 1, 'bm25')

      expect(result.chunk.language).toBe('python')
    })

    it('maps name correctly', () => {
      const result = mapRetrievalResult(makeRawRow({ name: 'ChunkBuilder' }), 0.9, 1, 'bm25')

      expect(result.chunk.name).toBe('ChunkBuilder')
    })

    it('maps startLine from start_line', () => {
      const result = mapRetrievalResult(makeRawRow({ start_line: 42 }), 0.9, 1, 'bm25')

      expect(result.chunk.startLine).toBe(42)
    })

    it('maps endLine from end_line', () => {
      const result = mapRetrievalResult(makeRawRow({ end_line: 99 }), 0.9, 1, 'bm25')

      expect(result.chunk.endLine).toBe(99)
    })

    it('parses metadata from JSON string', () => {
      const metadata = { signature: 'foo(x: number): void', isExported: true }
      const result = mapRetrievalResult(
        makeRawRow({ metadata: JSON.stringify(metadata) }),
        0.9,
        1,
        'bm25'
      )

      expect(result.chunk.metadata).toEqual(metadata)
    })

    it('converts created_at string to a Date object', () => {
      const result = mapRetrievalResult(
        makeRawRow({ created_at: '2024-06-01T12:00:00.000Z' }),
        0.9,
        1,
        'bm25'
      )

      expect(result.chunk.createdAt).toBeInstanceOf(Date)
      expect(result.chunk.createdAt.toISOString()).toBe('2024-06-01T12:00:00.000Z')
    })
  })

  describe('document mapping', () => {
    it('maps document id from document_id', () => {
      const result = mapRetrievalResult(makeRawRow({ document_id: 'doc-123' }), 0.9, 1, 'bm25')

      expect(result.document.id).toBe('doc-123')
    })

    it('maps document name from doc_name', () => {
      const result = mapRetrievalResult(makeRawRow({ doc_name: 'indexer.ts' }), 0.9, 1, 'bm25')

      expect(result.document.name).toBe('indexer.ts')
    })

    it('maps sourcePath from source_path', () => {
      const result = mapRetrievalResult(
        makeRawRow({ source_path: '/src/indexer/indexer.ts' }),
        0.9,
        1,
        'bm25'
      )

      expect(result.document.sourcePath).toBe('/src/indexer/indexer.ts')
    })

    it('maps chunkCount from chunk_count', () => {
      const result = mapRetrievalResult(makeRawRow({ chunk_count: 12 }), 0.9, 1, 'bm25')

      expect(result.document.chunkCount).toBe(12)
    })
  })

  describe('result metadata', () => {
    it('sets score to the provided value', () => {
      const result = mapRetrievalResult(makeRawRow(), 0.742, 1, 'bm25')

      expect(result.score).toBe(0.742)
    })

    it('sets rank to the provided value', () => {
      const result = mapRetrievalResult(makeRawRow(), 0.9, 3, 'bm25')

      expect(result.rank).toBe(3)
    })

    it('sets strategy to bm25', () => {
      const result = mapRetrievalResult(makeRawRow(), 0.9, 1, 'bm25')

      expect(result.strategy).toBe('bm25')
    })

    it('sets strategy to vector', () => {
      const result = mapRetrievalResult(makeRawRow(), 0.9, 1, 'vector')

      expect(result.strategy).toBe('vector')
    })

    it('sets strategy to graph', () => {
      const result = mapRetrievalResult(makeRawRow(), 0.9, 1, 'graph')

      expect(result.strategy).toBe('graph')
    })
  })
})