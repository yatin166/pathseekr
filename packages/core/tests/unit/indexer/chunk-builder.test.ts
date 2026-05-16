import { describe, it, expect, beforeEach } from 'vitest'
import { ChunkBuilder } from '../../../src/indexer/chunk-builder'
import type { Chunk } from '@pathseekr/shared'
import type { ParseResult } from '../../../src/interfaces/document-parser.interface'

function makeChunk(overrides: Partial<Chunk> = {}): Chunk {
  return {
    id: '',
    documentId: '',
    content: 'function example() {}',
    chunkType: 'function',
    language: 'typescript',
    name: 'example',
    startLine: 1,
    endLine: 3,
    metadata: {},
    createdAt: new Date('2024-01-01T00:00:00Z'),
    ...overrides,
  } as Chunk
}

function makeParseResult(chunks: Chunk[], overrides: Partial<ParseResult> = {}): ParseResult {
  return {
    chunks,
    language: 'typescript',
    totalLines: 100,
    ...overrides,
  }
}

describe('ChunkBuilder', () => {
  let builder: ChunkBuilder

  beforeEach(() => {
    builder = new ChunkBuilder()
  })

  describe('build', () => {
    it('assigns documentId to every chunk', () => {
      const chunks = [makeChunk(), makeChunk(), makeChunk()]
      const result = builder.build(makeParseResult(chunks), 'doc-123', '/src/file.ts')

      for (const chunk of result) {
        expect(chunk.documentId).toBe('doc-123')
      }
    })

    it('returns the same number of chunks as the parse result', () => {
      const chunks = [makeChunk(), makeChunk(), makeChunk()]
      const result = builder.build(makeParseResult(chunks), 'doc-1', '/src/file.ts')

      expect(result).toHaveLength(3)
    })

    it('returns empty array when parse result has no chunks', () => {
      const result = builder.build(makeParseResult([]), 'doc-1', '/src/file.ts')

      expect(result).toEqual([])
    })

    it('generates a UUID when chunk has no id', () => {
      const chunk = makeChunk({ id: '' })
      const result = builder.build(makeParseResult([chunk]), 'doc-1', '/src/file.ts')

      expect(result[0]!.id).toBeTruthy()
      expect(result[0]!.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
      )
    })

    it('preserves existing chunk id when one is provided', () => {
      const chunk = makeChunk({ id: 'existing-id-abc' })
      const result = builder.build(makeParseResult([chunk]), 'doc-1', '/src/file.ts')

      expect(result[0]!.id).toBe('existing-id-abc')
    })

    it('sets createdAt to current time when chunk has none', () => {
      const chunk = makeChunk({ createdAt: undefined as unknown as Date })
      const before = new Date()
      const result = builder.build(makeParseResult([chunk]), 'doc-1', '/src/file.ts')
      const after = new Date()

      expect(result[0]!.createdAt).toBeDefined()
      expect(result[0]!.createdAt.getTime()).toBeGreaterThanOrEqual(before.getTime())
      expect(result[0]!.createdAt.getTime()).toBeLessThanOrEqual(after.getTime())
    })

    it('preserves existing createdAt when chunk already has one', () => {
      const existingDate = new Date('2024-06-15T12:00:00Z')
      const chunk = makeChunk({ createdAt: existingDate })
      const result = builder.build(makeParseResult([chunk]), 'doc-1', '/src/file.ts')

      expect(result[0]!.createdAt).toEqual(existingDate)
    })

    it('builds a breadcrumb for every chunk', () => {
      const chunks = [makeChunk(), makeChunk()]
      const result = builder.build(makeParseResult(chunks), 'doc-1', '/src/file.ts')

      for (const chunk of result) {
        expect(chunk.breadcrumb).toBeDefined()
        expect(chunk.breadcrumb).not.toBe('')
      }
    })
  })

  describe('breadcrumbs', () => {
    // Helper extracts breadcrumb lines for a single chunk
    function getBreadcrumbLines(chunk: Chunk, sourcePath = '/src/example.ts'): string[] {
      const result = builder.build(makeParseResult([chunk]), 'doc-1', sourcePath)
      return result[0]!.breadcrumb!.split('\n')
    }

    it('always starts with the source file path', () => {
      const chunk = makeChunk({ chunkType: 'function', name: 'doWork' })
      const lines = getBreadcrumbLines(chunk, '/src/services/auth.ts')

      expect(lines[0]).toBe('File: /src/services/auth.ts')
    })

    describe('method chunks', () => {
      it('includes class name, method name and signature', () => {
        const chunk = makeChunk({
          chunkType: 'method',
          name: 'MyService.process',
          metadata: {
            parentName: 'MyService',
            signature: 'process(id: string): void',
          },
        })
        const lines = getBreadcrumbLines(chunk)

        expect(lines).toContain('Class: MyService')
        expect(lines).toContain('Method: MyService.process')
        expect(lines).toContain('Signature: process(id: string): void')
      })

      it('omits class line when parentName is not provided', () => {
        const chunk = makeChunk({
          chunkType: 'method',
          name: 'orphanMethod',
          metadata: {},
        })
        const lines = getBreadcrumbLines(chunk)

        expect(lines.some((l) => l.startsWith('Class:'))).toBe(false)
        expect(lines).toContain('Method: orphanMethod')
      })

      it('omits signature line when signature is not provided', () => {
        const chunk = makeChunk({
          chunkType: 'method',
          name: 'MyClass.doWork',
          metadata: { parentName: 'MyClass' },
        })
        const lines = getBreadcrumbLines(chunk)

        expect(lines.some((l) => l.startsWith('Signature:'))).toBe(false)
      })
    })

    describe('function chunks', () => {
      it('includes function name and signature', () => {
        const chunk = makeChunk({
          chunkType: 'function',
          name: 'parseResult',
          metadata: {
            signature: 'parseResult(input: string): Result',
          },
        })
        const lines = getBreadcrumbLines(chunk)

        expect(lines).toContain('Function: parseResult')
        expect(lines).toContain('Signature: parseResult(input: string): Result')
      })

      it('omits signature line when signature is not provided', () => {
        const chunk = makeChunk({
          chunkType: 'function',
          name: 'doWork',
          metadata: {},
        })
        const lines = getBreadcrumbLines(chunk)

        expect(lines).toContain('Function: doWork')
        expect(lines.some((l) => l.startsWith('Signature:'))).toBe(false)
      })
    })

    describe('class chunks', () => {
      it('includes only the file path and class name', () => {
        const chunk = makeChunk({
          chunkType: 'class',
          name: 'ChunkBuilder',
          metadata: {},
        })
        const lines = getBreadcrumbLines(chunk)

        expect(lines).toContain('Class: ChunkBuilder')
        expect(lines).toHaveLength(2)
      })
    })

    describe('interface chunks', () => {
      it('includes only the file path and interface name', () => {
        const chunk = makeChunk({
          chunkType: 'interface',
          name: 'IRetriever',
          metadata: {},
        })
        const lines = getBreadcrumbLines(chunk)

        expect(lines).toContain('Interface: IRetriever')
        expect(lines).toHaveLength(2)
      })
    })

    describe('type chunks', () => {
      it('includes only the file path and type name', () => {
        const chunk = makeChunk({
          chunkType: 'type',
          name: 'RetrievalStrategy',
          metadata: {},
        })
        const lines = getBreadcrumbLines(chunk)

        expect(lines).toContain('Type: RetrievalStrategy')
        expect(lines).toHaveLength(2)
      })
    })

    describe('other chunk types', () => {
      it('uses the chunk type as label for enum', () => {
        const chunk = makeChunk({
          chunkType: 'enum',
          name: 'JobStatus',
          metadata: {},
        })
        const lines = getBreadcrumbLines(chunk)

        expect(lines).toContain('enum: JobStatus')
      })

      it('uses the chunk type as label for struct', () => {
        const chunk = makeChunk({
          chunkType: 'struct',
          name: 'Config',
          metadata: {},
        })
        const lines = getBreadcrumbLines(chunk)

        expect(lines).toContain('struct: Config')
      })

      it('uses the chunk type as label for trait', () => {
        const chunk = makeChunk({
          chunkType: 'trait',
          name: 'Serializable',
          metadata: {},
        })
        const lines = getBreadcrumbLines(chunk)

        expect(lines).toContain('trait: Serializable')
      })
    })
  })
})