import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { ContextManager } from '@pathseekr/core'
import type { PathseekrConfig } from '@pathseekr/shared'
import { contextLabel, resolveDbPath } from '../src/context'

function createTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'pathseekr-cli-test-'))
}

function removeTempDir(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true })
}

function makeConfig(dataDir: string): PathseekrConfig {
  return {
    embedding: {
      provider: 'ollama',
      model: 'nomic-embed-text',
      baseUrl: 'http://localhost:11434',
      dimensions: 768,
      batchSize: 20,
    },
    llm: { provider: 'ollama', model: 'llama2', baseUrl: 'http://localhost:11434' },
    storage: { dataDir },
    indexing: { maxFileSizeBytes: 1_048_576, concurrency: 2, excludePatterns: [] },
    retrieval: { defaultLimit: 10, bm25Weight: 0.5 },
    server: { apiPort: 3001, mcpPort: 3002, webPort: 3000 },
    logLevel: 'error',
    nodeEnv: 'test',
  }
}

describe('CLI context helpers', () => {
  let tempDir: string
  let config: PathseekrConfig
  let manager: ContextManager

  beforeEach(() => {
    tempDir = createTempDir()
    config = makeConfig(tempDir)
    manager = new ContextManager(tempDir)
  })

  afterEach(() => {
    removeTempDir(tempDir)
  })

  describe('resolveDbPath', () => {
    describe('with an explicit context name', () => {
      it('returns the database path for a named context', () => {
        manager.create('team_tiger')

        const dbPath = resolveDbPath('team_tiger', config)

        expect(dbPath).toContain('team_tiger.db')
      })

      it('throws when the named context does not exist', () => {
        expect(() =>
          resolveDbPath('nonexistent', config)
        ).toThrow('nonexistent')
      })

      it('throws with a helpful message pointing to context list', () => {
        expect(() =>
          resolveDbPath('nonexistent', config)
        ).toThrow('seek context list')
      })
    })

    describe('without a context name', () => {
      it('returns the active context database path when one is set', () => {
        manager.create('platform')
        manager.setActive('platform')

        const dbPath = resolveDbPath(undefined, config)

        expect(dbPath).toContain('platform.db')
      })

      it('throws when no context name is given and no active context exists', () => {
        expect(() =>
          resolveDbPath(undefined, config)
        ).toThrow()
      })

      it('throws with a helpful message guiding toward context creation', () => {
        expect(() =>
          resolveDbPath(undefined, config)
        ).toThrow('seek context create')
      })
    })

    describe('explicit context name takes precedence over active', () => {
      it('returns the named context even when a different context is active', () => {
        manager.create('team_tiger')
        manager.create('platform')
        manager.setActive('platform')

        const dbPath = resolveDbPath('team_tiger', config)

        expect(dbPath).toContain('team_tiger.db')
        expect(dbPath).not.toContain('platform')
      })
    })
  })

  describe('contextLabel', () => {
    describe('with an explicit context name', () => {
      it('returns "context: name" when the context exists', () => {
        manager.create('team_tiger')

        const label = contextLabel('team_tiger', config)

        expect(label).toBe('context: team_tiger')
      })

      it('returns "context: name" even when context does not exist', () => {
        const label = contextLabel('nonexistent', config)

        expect(label).toBe('context: nonexistent')
      })
    })

    describe('without a context name', () => {
      it('returns "context: name (active)" when an active context is set', () => {
        manager.create('platform')
        manager.setActive('platform')

        const label = contextLabel(undefined, config)

        expect(label).toBe('context: platform (active)')
      })

      it('returns "no context" when no active context exists', () => {
        const label = contextLabel(undefined, config)

        expect(label).toBe('no context')
      })
    })
  })
})