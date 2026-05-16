import { describe, it, expect, beforeEach } from 'vitest'
import { JavaScriptParser } from '../../../src/parsers/javascript-parser'
import type { ParseResult } from '../../../src/interfaces/document-parser.interface'
import type { Chunk } from '@pathseekr/shared'
import { SIMPLE_CLASS } from '../../../../../test-support/fixtures/javascript/simple-class'

function findChunk(result: ParseResult, name: string): Chunk | undefined {
  return result.chunks.find((c) => c.name === name)
}

function findChunksByType(result: ParseResult, chunkType: string): Chunk[] {
  return result.chunks.filter((c) => c.chunkType === chunkType)
}

describe('JavaScriptParser', () => {
  let parser: JavaScriptParser

  beforeEach(() => {
    parser = new JavaScriptParser()
  })

  describe('supports', () => {
    it('returns true for .js files', () => {
      expect(parser.supports('/src/file.js')).toBe(true)
    })

    it('returns true for .jsx files', () => {
      expect(parser.supports('/src/component.jsx')).toBe(true)
    })

    it('returns true for .mjs files', () => {
      expect(parser.supports('/src/module.mjs')).toBe(true)
    })

    it('returns true for .cjs files', () => {
      expect(parser.supports('/src/module.cjs')).toBe(true)
    })

    it('returns false for .ts files', () => {
      expect(parser.supports('/src/file.ts')).toBe(false)
    })

    it('returns false for .py files', () => {
      expect(parser.supports('/src/file.py')).toBe(false)
    })

    it('returns false for files with no extension', () => {
      expect(parser.supports('/src/Makefile')).toBe(false)
    })
  })

  describe('parse — simple-class.js', () => {
    let result: ParseResult

    beforeEach(async () => {
      result = await parser.parse('/src/simple-class.js', SIMPLE_CLASS)
    })

    describe('parse result shape', () => {
      it('sets language to javascript', () => {
        expect(result.language).toBe('javascript')
      })

      it('returns a positive totalLines count', () => {
        expect(result.totalLines).toBeGreaterThan(0)
      })

      it('returns at least one chunk', () => {
        expect(result.chunks.length).toBeGreaterThan(0)
      })
    })

    describe('imports', () => {
      it('extracts ES module import sources', () => {
        expect(result.imports).toContain('events')
        expect(result.imports).toContain('path')
      })
    })

    describe('class extraction', () => {
      it('extracts the BaseProcessor class', () => {
        const chunk = findChunk(result, 'BaseProcessor')

        expect(chunk).toBeDefined()
        expect(chunk!.chunkType).toBe('class')
      })

      it('sets language to javascript on the class chunk', () => {
        const chunk = findChunk(result, 'BaseProcessor')

        expect(chunk!.language).toBe('javascript')
      })

      it('captures the class that BaseProcessor extends', () => {
        const chunk = findChunk(result, 'BaseProcessor')

        expect(chunk!.metadata.extendsNames).toContain('EventEmitter')
      })

      it('extracts the DataProcessor class', () => {
        const chunk = findChunk(result, 'DataProcessor')

        expect(chunk).toBeDefined()
        expect(chunk!.chunkType).toBe('class')
      })

      it('captures the class that DataProcessor extends', () => {
        const chunk = findChunk(result, 'DataProcessor')

        expect(chunk!.metadata.extendsNames).toContain('BaseProcessor')
      })
    })

    describe('method extraction', () => {
      it('extracts public methods from BaseProcessor', () => {
        const methods = findChunksByType(result, 'method').filter(
          (c) => c.metadata.parentName === 'BaseProcessor'
        )

        const names = methods.map((m) => m.name)
        expect(names.some((n) => n.includes('process'))).toBe(true)
        expect(names.some((n) => n.includes('getName'))).toBe(true)
      })

      it('extracts public methods from DataProcessor', () => {
        const methods = findChunksByType(result, 'method').filter(
          (c) => c.metadata.parentName === 'DataProcessor'
        )

        const names = methods.map((m) => m.name)
        expect(names.some((n) => n.includes('process'))).toBe(true)
        expect(names.some((n) => n.includes('getCount'))).toBe(true)
        expect(names.some((n) => n.includes('reset'))).toBe(true)
      })

      it('skips methods starting with underscore', () => {
        const methods = findChunksByType(result, 'method')
        const names = methods.map((m) => m.name)

        expect(names.some((n) => n.includes('_internalHelper'))).toBe(false)
      })

      it('skips private class fields starting with #', () => {
        const methods = findChunksByType(result, 'method')
        const names = methods.map((m) => m.name)

        expect(names.some((n) => n.startsWith('#'))).toBe(false)
      })

      it('sets parentName on all method chunks', () => {
        const methods = findChunksByType(result, 'method')

        for (const method of methods) {
          expect(method.metadata.parentName).toBeTruthy()
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
      it('extracts function declarations', () => {
        const chunk = findChunk(result, 'createProcessor')

        expect(chunk).toBeDefined()
        expect(chunk!.chunkType).toBe('function')
      })

      it('extracts arrow functions assigned to const', () => {
        const chunk = findChunk(result, 'formatResult')

        expect(chunk).toBeDefined()
        expect(chunk!.chunkType).toBe('function')
      })

      it('extracts async arrow functions', () => {
        const chunk = findChunk(result, 'processAsync')

        expect(chunk).toBeDefined()
        expect(chunk!.chunkType).toBe('function')
      })

      it('marks async arrow functions correctly', () => {
        const chunk = findChunk(result, 'processAsync')

        expect(chunk!.metadata.isAsync).toBe(true)
      })

      it('does not mark non-async functions as async', () => {
        const chunk = findChunk(result, 'formatResult')

        expect(chunk!.metadata.isAsync).toBe(false)
      })

      it('does not extract class methods as top-level functions', () => {
        const functions = findChunksByType(result, 'function')
        const names = functions.map((f) => f.name)

        expect(names).not.toContain('process')
        expect(names).not.toContain('getCount')
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