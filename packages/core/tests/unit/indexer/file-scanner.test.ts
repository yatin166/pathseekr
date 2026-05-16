import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { FileScanner } from '../../../src/indexer/file-scanner'
import type { PathseekrConfig } from '@pathseekr/shared'

function makeConfig(overrides: Partial<PathseekrConfig['indexing']> = {}): PathseekrConfig {
  return {
    embedding: {
      provider: 'ollama',
      model: 'nomic-embed-text',
      baseUrl: 'http://localhost:11434',
      dimensions: 768,
      batchSize: 20,
    },
    llm: { provider: 'ollama', model: 'llama2', baseUrl: 'http://localhost:11434' },
    storage: { dataDir: os.tmpdir() },
    indexing: {
      maxFileSizeBytes: 1_048_576,
      concurrency: 2,
      excludePatterns: [],
      ...overrides,
    },
    retrieval: { defaultLimit: 10, bm25Weight: 0.5 },
    server: { apiPort: 3001, mcpPort: 3002, webPort: 3000 },
    logLevel: 'error',
    nodeEnv: 'test',
  }
}

function createTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'pathseekr-scanner-test-'))
}

function removeTempDir(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true })
}

function writeFile(dir: string, name: string, content = 'hello'): string {
  const filePath = path.join(dir, name)
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, content)
  return filePath
}

describe('FileScanner', () => {
  let tempDir: string
  let scanner: FileScanner

  beforeEach(() => {
    tempDir = createTempDir()
    scanner = new FileScanner(makeConfig())
  })

  afterEach(() => {
    removeTempDir(tempDir)
  })

  describe('scan — error handling', () => {
    it('throws when the path does not exist', () => {
      expect(() =>
        scanner.scan(path.join(tempDir, 'nonexistent'))
      ).toThrow()
    })
  })

  describe('scan — single file', () => {
    it('returns the file when it is valid', () => {
      const filePath = writeFile(tempDir, 'index.ts')
      const result = scanner.scan(filePath)

      expect(result.files).toHaveLength(1)
      expect(result.files[0]!.absolutePath).toBe(filePath)
    })

    it('sets sizeBytes correctly on the scanned file', () => {
      const content = 'export const x = 1'
      const filePath = writeFile(tempDir, 'index.ts', content)
      const result = scanner.scan(filePath)

      expect(result.files[0]!.sizeBytes).toBe(Buffer.byteLength(content))
    })

    it('sets extension correctly on the scanned file', () => {
      const filePath = writeFile(tempDir, 'parser.ts')
      const result = scanner.scan(filePath)

      expect(result.files[0]!.extension).toBe('.ts')
    })

    it('totalScanned is 1 for a single file', () => {
      const filePath = writeFile(tempDir, 'index.ts')
      const result = scanner.scan(filePath)

      expect(result.totalScanned).toBe(1)
    })
  })

  describe('scan — directory', () => {
    it('returns all valid files in the directory', () => {
      writeFile(tempDir, 'a.ts')
      writeFile(tempDir, 'b.ts')
      writeFile(tempDir, 'c.ts')

      const result = scanner.scan(tempDir)

      expect(result.files).toHaveLength(3)
    })

    it('walks nested subdirectories', () => {
      writeFile(tempDir, 'src/parser.ts')
      writeFile(tempDir, 'src/utils/helper.ts')
      writeFile(tempDir, 'tests/parser.test.ts')

      const result = scanner.scan(tempDir)

      expect(result.files).toHaveLength(3)
    })

    it('sets relativePath relative to the scan root', () => {
      writeFile(tempDir, 'src/parser.ts')
      const result = scanner.scan(tempDir)

      expect(result.files[0]!.relativePath).toBe('src/parser.ts')
    })

    it('returns an empty files array for an empty directory', () => {
      const result = scanner.scan(tempDir)

      expect(result.files).toHaveLength(0)
      expect(result.totalScanned).toBe(0)
    })
  })

  describe('hidden files', () => {
    it('skips files starting with a dot', () => {
      writeFile(tempDir, '.env')
      writeFile(tempDir, '.gitignore')
      writeFile(tempDir, 'visible.ts')

      const result = scanner.scan(tempDir)

      expect(result.files).toHaveLength(1)
      expect(result.files[0]!.relativePath).toBe('visible.ts')
    })

    it('records hidden files in skippedReasons', () => {
      writeFile(tempDir, '.env')
      writeFile(tempDir, '.gitignore')

      const result = scanner.scan(tempDir)

      expect(result.skippedReasons['hidden_file']).toBe(2)
    })
  })

  describe('ignored extensions', () => {
    it('skips files with ignored extensions', () => {
      writeFile(tempDir, 'data.json')
      writeFile(tempDir, 'readme.md')
      writeFile(tempDir, 'config.yaml')
      writeFile(tempDir, 'valid.ts')

      const result = scanner.scan(tempDir)

      expect(result.files).toHaveLength(1)
      expect(result.files[0]!.relativePath).toBe('valid.ts')
    })

    it('records skipped extension names', () => {
      writeFile(tempDir, 'data.json')
      writeFile(tempDir, 'readme.md')

      const result = scanner.scan(tempDir)

      expect(result.skippedExtensions).toContain('.json')
      expect(result.skippedExtensions).toContain('.md')
    })

    it('skips .d.ts declaration files', () => {
      writeFile(tempDir, 'types.d.ts')
      writeFile(tempDir, 'parser.ts')

      const result = scanner.scan(tempDir)

      expect(result.files).toHaveLength(1)
      expect(result.files[0]!.relativePath).toBe('parser.ts')
    })

    it('records .d.ts in skipped extensions', () => {
      writeFile(tempDir, 'types.d.ts')

      const result = scanner.scan(tempDir)

      expect(result.skippedExtensions).toContain('.d.ts')
    })
  })

  describe('ignored directories', () => {
    it('skips node_modules directory', () => {
      writeFile(tempDir, 'node_modules/package/index.js')
      writeFile(tempDir, 'src/index.ts')

      const result = scanner.scan(tempDir)

      expect(result.files).toHaveLength(1)
    })

    it('skips dist directory', () => {
      writeFile(tempDir, 'dist/bundle.js')
      writeFile(tempDir, 'src/index.ts')

      const result = scanner.scan(tempDir)

      expect(result.files).toHaveLength(1)
    })

    it('skips hidden directories starting with a dot', () => {
      writeFile(tempDir, '.git/config')
      writeFile(tempDir, '.github/workflows/ci.yml')
      writeFile(tempDir, 'src/index.ts')

      const result = scanner.scan(tempDir)

      expect(result.files).toHaveLength(1)
    })

    it('records skipped directory names without duplicates', () => {
      writeFile(tempDir, 'packages/a/node_modules/lib/index.js')
      writeFile(tempDir, 'packages/b/node_modules/lib/index.js')

      const result = scanner.scan(tempDir)

      const nodeModulesCount = result.skippedDirectories.filter(
        (d) => d === 'node_modules'
      ).length
      expect(nodeModulesCount).toBe(1)
    })

    it('records ignored_directory in skippedReasons', () => {
      writeFile(tempDir, 'node_modules/lib/index.js')
      writeFile(tempDir, 'dist/bundle.js')

      const result = scanner.scan(tempDir)

      expect(result.skippedReasons['ignored_directory']).toBeGreaterThan(0)
    })
  })

  describe('file size filtering', () => {
    it('skips files exceeding the max file size', () => {
      const smallScanner = new FileScanner(
        makeConfig({ maxFileSizeBytes: 10 })
      )
      writeFile(tempDir, 'large.ts', 'x'.repeat(100))
      writeFile(tempDir, 'small.ts', 'tiny')

      const result = smallScanner.scan(tempDir)

      expect(result.files).toHaveLength(1)
      expect(result.files[0]!.relativePath).toBe('small.ts')
    })

    it('records too_large in skippedReasons', () => {
      const smallScanner = new FileScanner(
        makeConfig({ maxFileSizeBytes: 10 })
      )
      writeFile(tempDir, 'large.ts', 'x'.repeat(100))

      const result = smallScanner.scan(tempDir)

      expect(result.skippedReasons['too_large']).toBe(1)
    })
  })

  describe('empty files', () => {
    it('skips empty files', () => {
      writeFile(tempDir, 'empty.ts', '')
      writeFile(tempDir, 'valid.ts', 'export const x = 1')

      const result = scanner.scan(tempDir)

      expect(result.files).toHaveLength(1)
      expect(result.files[0]!.relativePath).toBe('valid.ts')
    })

    it('records empty_file in skippedReasons', () => {
      writeFile(tempDir, 'empty.ts', '')

      const result = scanner.scan(tempDir)

      expect(result.skippedReasons['empty_file']).toBe(1)
    })
  })

  describe('exclude patterns', () => {
    it('skips files matching a glob pattern', () => {
      const patternScanner = new FileScanner(
        makeConfig({ excludePatterns: ['**/generated/**'] })
      )
      writeFile(tempDir, 'generated/schema.ts')
      writeFile(tempDir, 'src/parser.ts')

      const result = patternScanner.scan(tempDir)

      expect(result.files).toHaveLength(1)
      expect(result.files[0]!.relativePath).toBe('src/parser.ts')
    })

    it('records exclude_pattern in skippedReasons', () => {
      const patternScanner = new FileScanner(
        makeConfig({ excludePatterns: ['**/generated/**'] })
      )
      writeFile(tempDir, 'generated/schema.ts')

      const result = patternScanner.scan(tempDir)

      expect(result.skippedReasons['exclude_pattern']).toBe(1)
    })

    it('supports multiple exclude patterns', () => {
      const patternScanner = new FileScanner(
        makeConfig({ excludePatterns: ['**/generated/**', '**/fixtures/**'] })
      )
      writeFile(tempDir, 'generated/schema.ts')
      writeFile(tempDir, 'fixtures/data.ts')
      writeFile(tempDir, 'src/parser.ts')

      const result = patternScanner.scan(tempDir)

      expect(result.files).toHaveLength(1)
    })
  })

  describe('skippedCount', () => {
    it('equals totalScanned minus the number of returned files', () => {
      writeFile(tempDir, 'valid.ts')
      writeFile(tempDir, 'data.json')
      writeFile(tempDir, '.hidden.ts')
      writeFile(tempDir, 'empty.ts', '')

      const result = scanner.scan(tempDir)

      expect(result.skippedCount).toBe(result.totalScanned - result.files.length)
    })
  })
})