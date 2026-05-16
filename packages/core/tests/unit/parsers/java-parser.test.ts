import { describe, it, expect, beforeEach } from 'vitest'
import { JavaParser } from '../../../src/parsers/java-parser'
import type { ParseResult } from '../../../src/interfaces/document-parser.interface'
import type { Chunk } from '@pathseekr/shared'
import { SIMPLE_CLASS } from '../../../../../test-support/fixtures/java/simple-class'

function findChunk(result: ParseResult, name: string): Chunk | undefined {
  return result.chunks.find((c) => c.name === name)
}

function findChunksByType(result: ParseResult, chunkType: string): Chunk[] {
  return result.chunks.filter((c) => c.chunkType === chunkType)
}

describe('JavaParser', () => {
  let parser: JavaParser

  beforeEach(() => {
    parser = new JavaParser()
  })

  describe('supports', () => {
    it('returns true for .java files', () => {
      expect(parser.supports('/src/MyClass.java')).toBe(true)
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

  describe('parse — SimpleClass.java', () => {
    let result: ParseResult

    beforeEach(async () => {
      result = await parser.parse('/src/SimpleClass.java', SIMPLE_CLASS)
    })

    describe('parse result shape', () => {
      it('sets language to java', () => {
        expect(result.language).toBe('java')
      })

      it('returns a positive totalLines count', () => {
        expect(result.totalLines).toBeGreaterThan(0)
      })

      it('returns at least one chunk', () => {
        expect(result.chunks.length).toBeGreaterThan(0)
      })
    })

    describe('imports', () => {
      it('extracts import statements', () => {
        expect(result.imports).toBeDefined()
        expect(result.imports!.length).toBeGreaterThan(0)
      })

      it('extracts fully qualified import paths', () => {
        const imports = result.imports ?? []

        expect(imports.some((i) => i.includes('java.util'))).toBe(true)
      })
    })

    describe('interface extraction', () => {
      it('extracts the IProcessor interface', () => {
        const chunk = findChunk(result, 'IProcessor')

        expect(chunk).toBeDefined()
        expect(chunk!.chunkType).toBe('interface')
      })

      it('sets language to java on the interface chunk', () => {
        const chunk = findChunk(result, 'IProcessor')

        expect(chunk!.language).toBe('java')
      })
    })

    describe('enum extraction', () => {
      it('extracts the ProcessorStatus enum as a type chunk', () => {
        const chunk = findChunk(result, 'ProcessorStatus')

        expect(chunk).toBeDefined()
        expect(chunk!.chunkType).toBe('type')
      })
    })

    describe('class extraction', () => {
      it('extracts BaseProcessor class', () => {
        const chunk = findChunk(result, 'BaseProcessor')

        expect(chunk).toBeDefined()
        expect(chunk!.chunkType).toBe('class')
      })

      it('captures the interface that BaseProcessor implements', () => {
        const chunk = findChunk(result, 'BaseProcessor')

        expect(chunk!.metadata.implementsNames).toContain('IProcessor')
      })

      it('extracts DataProcessor class', () => {
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
        expect(names.some((n) => n.includes('isReady'))).toBe(true)
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

      it('skips private methods', () => {
        const methods = findChunksByType(result, 'method')
        const names = methods.map((m) => m.name)

        expect(names.some((n) => n.includes('internalReset'))).toBe(false)
        expect(names.some((n) => n.includes('helper'))).toBe(false)
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