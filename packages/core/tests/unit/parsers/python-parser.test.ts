import { describe, it, expect, beforeEach } from 'vitest'
import { PythonParser } from '../../../src/parsers/python-parser'
import type { ParseResult } from '../../../src/interfaces/document-parser.interface'
import type { Chunk } from '@pathseekr/shared'
import { SIMPLE_CLASS } from '../../../../../test-support/fixtures/python/simple-class'

// No fs import needed — fixture content comes from a TypeScript module

function findChunk(result: ParseResult, name: string): Chunk | undefined {
  return result.chunks.find((c) => c.name === name)
}

function findChunksByType(result: ParseResult, chunkType: string): Chunk[] {
  return result.chunks.filter((c) => c.chunkType === chunkType)
}

describe('PythonParser', () => {
  let parser: PythonParser

  beforeEach(() => {
    parser = new PythonParser()
  })

  describe('supports', () => {
    it('returns true for .py files', () => {
      expect(parser.supports('/src/file.py')).toBe(true)
    })

    it('returns true for .pyw files', () => {
      expect(parser.supports('/src/file.pyw')).toBe(true)
    })

    it('returns false for .ts files', () => {
      expect(parser.supports('/src/file.ts')).toBe(false)
    })

    it('returns false for .js files', () => {
      expect(parser.supports('/src/file.js')).toBe(false)
    })

    it('returns false for files with no extension', () => {
      expect(parser.supports('/src/Makefile')).toBe(false)
    })
  })

  describe('parse — simple_class.py', () => {
    let result: ParseResult

    beforeEach(async () => {
      result = await parser.parse('/src/simple_class.py', SIMPLE_CLASS)
    })

    describe('parse result shape', () => {
      it('sets language to python', () => {
        expect(result.language).toBe('python')
      })

      it('returns a positive totalLines count', () => {
        expect(result.totalLines).toBeGreaterThan(0)
      })

      it('returns at least one chunk', () => {
        expect(result.chunks.length).toBeGreaterThan(0)
      })
    })

    describe('imports', () => {
      it('extracts top-level imports', () => {
        expect(result.imports).toContain('os')
        expect(result.imports).toContain('sys')
      })

      it('extracts from-imports by module name', () => {
        expect(result.imports).toContain('pathlib')
        expect(result.imports).toContain('typing')
      })
    })

    describe('class extraction', () => {
      it('extracts the BaseProcessor class', () => {
        const chunk = findChunk(result, 'BaseProcessor')

        expect(chunk).toBeDefined()
        expect(chunk!.chunkType).toBe('class')
      })

      it('sets language to python on the class chunk', () => {
        const chunk = findChunk(result, 'BaseProcessor')

        expect(chunk!.language).toBe('python')
      })

      it('extracts the DataProcessor class', () => {
        const chunk = findChunk(result, 'DataProcessor')

        expect(chunk).toBeDefined()
        expect(chunk!.chunkType).toBe('class')
      })

      it('captures the base class that DataProcessor extends', () => {
        const chunk = findChunk(result, 'DataProcessor')

        expect(chunk!.metadata.extendsNames).toContain('BaseProcessor')
      })

      it('does not set extendsNames on BaseProcessor which has no base', () => {
        const chunk = findChunk(result, 'BaseProcessor')

        expect(chunk!.metadata.extendsNames).toBeUndefined()
      })
    })

    describe('method extraction', () => {
      it('extracts public methods from BaseProcessor', () => {
        const methods = findChunksByType(result, 'method').filter(
          (c) => c.metadata.parentName === 'BaseProcessor'
        )

        const names = methods.map((m) => m.name)
        expect(names.some((n) => n.includes('process'))).toBe(true)
        expect(names.some((n) => n.includes('get_name'))).toBe(true)
      })

      it('extracts public methods from DataProcessor', () => {
        const methods = findChunksByType(result, 'method').filter(
          (c) => c.metadata.parentName === 'DataProcessor'
        )

        const names = methods.map((m) => m.name)
        expect(names.some((n) => n.includes('process'))).toBe(true)
        expect(names.some((n) => n.includes('get_count'))).toBe(true)
        expect(names.some((n) => n.includes('reset'))).toBe(true)
      })

      it('skips dunder methods like __init__', () => {
        const methods = findChunksByType(result, 'method')
        const names = methods.map((m) => m.name)

        expect(names.some((n) => n.includes('__init__'))).toBe(false)
      })

      it('skips private methods starting with underscore', () => {
        const methods = findChunksByType(result, 'method')
        const names = methods.map((m) => m.name)

        expect(names.some((n) => n.includes('_helper'))).toBe(false)
      })

      it('sets parentName on all method chunks', () => {
        const methods = findChunksByType(result, 'method')

        for (const method of methods) {
          expect(method.metadata.parentName).toBeTruthy()
        }
      })

      it('sets a signature on all method chunks', () => {
        const methods = findChunksByType(result, 'method')

        for (const method of methods) {
          expect(method.metadata.signature).toBeTruthy()
        }
      })

      it('records correct start and end lines for methods', () => {
        const methods = findChunksByType(result, 'method')

        for (const method of methods) {
          expect(method.startLine).toBeGreaterThan(0)
          expect(method.endLine).toBeGreaterThanOrEqual(method.startLine)
        }
      })
    })

    describe('function extraction', () => {
      it('extracts top-level functions', () => {
        const chunk = findChunk(result, 'create_processor')

        expect(chunk).toBeDefined()
        expect(chunk!.chunkType).toBe('function')
      })

      it('extracts all top-level functions', () => {
        const functions = findChunksByType(result, 'function')
        const names = functions.map((f) => f.name)

        expect(names).toContain('create_processor')
        expect(names).toContain('format_result')
      })

      it('includes a signature for the function', () => {
        const chunk = findChunk(result, 'create_processor')

        expect(chunk!.metadata.signature).toBeTruthy()
        expect(chunk!.metadata.signature).toContain('create_processor')
      })

      it('does not extract class methods as top-level functions', () => {
        const functions = findChunksByType(result, 'function')
        const names = functions.map((f) => f.name)

        expect(names).not.toContain('process')
        expect(names).not.toContain('get_count')
      })
    })

    describe('chunk content integrity', () => {
      it('every chunk has non-empty content', () => {
        for (const chunk of result.chunks) {
          expect(chunk.content.trim().length).toBeGreaterThan(0)
        }
      })

      it('every chunk has a non-empty name', () => {
        for (const chunk of result.chunks) {
          expect(chunk.name.trim().length).toBeGreaterThan(0)
        }
      })

      it('every chunk has a positive start line', () => {
        for (const chunk of result.chunks) {
          expect(chunk.startLine).toBeGreaterThan(0)
        }
      })

      it('end line is always greater than or equal to start line', () => {
        for (const chunk of result.chunks) {
          expect(chunk.endLine).toBeGreaterThanOrEqual(chunk.startLine)
        }
      })
    })
  })
})