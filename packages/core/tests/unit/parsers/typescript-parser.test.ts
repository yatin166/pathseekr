import { describe, it, expect, beforeEach } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import { TypeScriptParser } from '../../../src/parsers/typescript-parser'
import type { ParseResult } from '../../../src/interfaces/document-parser.interface'
import type { Chunk } from '@pathseekr/shared'

const FIXTURE_DIR = path.resolve(__dirname, '../../../../../test-support/fixtures/typescript')

function readFixture(filename: string): string {
  return fs.readFileSync(path.join(FIXTURE_DIR, filename), 'utf-8')
}

function findChunk(result: ParseResult, name: string): Chunk | undefined {
  return result.chunks.find((c) => c.name === name)
}

function findChunksByType(result: ParseResult, chunkType: string): Chunk[] {
  return result.chunks.filter((c) => c.chunkType === chunkType)
}

describe('TypeScriptParser', () => {
  let parser: TypeScriptParser

  beforeEach(() => {
    parser = new TypeScriptParser()
  })

  describe('supports', () => {
    it('returns true for .ts files', () => {
      expect(parser.supports('/src/file.ts')).toBe(true)
    })

    it('returns true for .tsx files', () => {
      expect(parser.supports('/src/component.tsx')).toBe(true)
    })

    it('returns false for .js files', () => {
      expect(parser.supports('/src/file.js')).toBe(false)
    })

    it('returns false for .py files', () => {
      expect(parser.supports('/src/file.py')).toBe(false)
    })

    it('returns false for files with no extension', () => {
      expect(parser.supports('/src/Makefile')).toBe(false)
    })
  })

  describe('parse — simple-class.ts', () => {
    let result: ParseResult

    beforeEach(async () => {
      const content = readFixture('simple-class.ts')
      result = await parser.parse('/src/simple-class.ts', content)
    })

    describe('parse result shape', () => {
      it('sets language to typescript', () => {
        expect(result.language).toBe('typescript')
      })

      it('returns a positive totalLines count', () => {
        expect(result.totalLines).toBeGreaterThan(0)
      })

      it('returns at least one chunk', () => {
        expect(result.chunks.length).toBeGreaterThan(0)
      })
    })

    describe('imports', () => {
      it('extracts import sources', () => {
        expect(result.imports).toBeDefined()
        expect(result.imports).toContain('events')
      })
    })

    describe('interface extraction', () => {
      it('extracts the IProcessor interface', () => {
        const chunk = findChunk(result, 'IProcessor')

        expect(chunk).toBeDefined()
        expect(chunk!.chunkType).toBe('interface')
      })

      it('sets language to typescript on the interface chunk', () => {
        const chunk = findChunk(result, 'IProcessor')

        expect(chunk!.language).toBe('typescript')
      })

      it('includes interface content in the chunk', () => {
        const chunk = findChunk(result, 'IProcessor')

        expect(chunk!.content).toContain('IProcessor')
      })
    })

    describe('type extraction', () => {
      it('extracts the ProcessorStatus type alias', () => {
        const chunk = findChunk(result, 'ProcessorStatus')

        expect(chunk).toBeDefined()
        expect(chunk!.chunkType).toBe('type')
      })

      it('includes the type content in the chunk', () => {
        const chunk = findChunk(result, 'ProcessorStatus')

        expect(chunk!.content).toContain('ProcessorStatus')
      })
    })

    describe('abstract class extraction', () => {
      it('extracts BaseProcessor as a class chunk', () => {
        const chunk = findChunk(result, 'BaseProcessor')

        expect(chunk).toBeDefined()
        expect(chunk!.chunkType).toBe('class')
      })

      it('captures the class that BaseProcessor extends', () => {
        const chunk = findChunk(result, 'BaseProcessor')

        expect(chunk!.metadata.extendsNames).toContain('EventEmitter')
      })
    })

    describe('class extraction', () => {
      it('extracts the DataProcessor class', () => {
        const chunk = findChunk(result, 'DataProcessor')

        expect(chunk).toBeDefined()
        expect(chunk!.chunkType).toBe('class')
      })

      it('captures the class that DataProcessor extends', () => {
        const chunk = findChunk(result, 'DataProcessor')

        expect(chunk!.metadata.extendsNames).toContain('BaseProcessor')
      })

      it('captures the interface that DataProcessor implements', () => {
        const chunk = findChunk(result, 'DataProcessor')

        expect(chunk!.metadata.implementsNames).toContain('IProcessor')
      })
    })

    describe('method extraction', () => {
      it('extracts methods belonging to BaseProcessor', () => {
        const methods = findChunksByType(result, 'method').filter(
          (c) => c.metadata.parentName === 'BaseProcessor'
        )

        const names = methods.map((m) => m.name)
        expect(names.some((n) => n.includes('getStatus'))).toBe(true)
      })

      it('extracts methods belonging to DataProcessor', () => {
        const methods = findChunksByType(result, 'method').filter(
          (c) => c.metadata.parentName === 'DataProcessor'
        )

        const names = methods.map((m) => m.name)
        expect(names.some((n) => n.includes('process'))).toBe(true)
        expect(names.some((n) => n.includes('isReady'))).toBe(true)
        expect(names.some((n) => n.includes('getCount'))).toBe(true)
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
      it('extracts the createProcessor function', () => {
        const chunk = findChunk(result, 'createProcessor')

        expect(chunk).toBeDefined()
        expect(chunk!.chunkType).toBe('function')
      })

      it('includes a signature for the function', () => {
        const chunk = findChunk(result, 'createProcessor')

        expect(chunk!.metadata.signature).toBeTruthy()
        expect(chunk!.metadata.signature).toContain('createProcessor')
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