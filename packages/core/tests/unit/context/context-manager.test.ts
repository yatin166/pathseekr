import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { ContextManager } from '../../../src/context/context-manager'

function createTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'pathseekr-test-'))
}

function removeTempDir(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true })
}

describe('ContextManager', () => {
  let tempDir: string
  let manager: ContextManager

  beforeEach(() => {
    tempDir = createTempDir()
    manager = new ContextManager(tempDir)
  })

  afterEach(() => {
    removeTempDir(tempDir)
  })

  describe('create', () => {
    it('creates a context with the given name', () => {
      const context = manager.create('team_tiger')

      expect(context.name).toBe('team_tiger')
    })

    it('creates a context with an empty paths array', () => {
      const context = manager.create('team_tiger')

      expect(context.paths).toEqual([])
    })

    it('sets database path inside the contexts directory', () => {
      const context = manager.create('team_tiger')

      expect(context.database).toContain('team_tiger.db')
      expect(context.database).toContain('contexts')
    })

    it('sets createdAt and updatedAt to current time', () => {
      const before = new Date().toISOString()
      const context = manager.create('team_tiger')
      const after = new Date().toISOString()

      expect(context.createdAt >= before).toBe(true)
      expect(context.createdAt <= after).toBe(true)
      expect(context.updatedAt >= before).toBe(true)
      expect(context.updatedAt <= after).toBe(true)
    })

    it('stores optional description when provided', () => {
      const context = manager.create('team_tiger', 'Tiger team services')

      expect(context.description).toBe('Tiger team services')
    })

    it('omits description when not provided', () => {
      const context = manager.create('team_tiger')

      expect(context.description).toBeUndefined()
    })

    it('persists the context to contexts.json', () => {
      manager.create('team_tiger')

      const stored = manager.get('team_tiger')
      expect(stored).not.toBeNull()
      expect(stored!.name).toBe('team_tiger')
    })

    it('throws when context name already exists', () => {
      manager.create('team_tiger')

      expect(() => manager.create('team_tiger')).toThrow(
        'team_tiger'
      )
    })

    it('throws when name is empty', () => {
      expect(() => manager.create('')).toThrow()
    })

    it('throws when name contains uppercase letters', () => {
      expect(() => manager.create('TeamTiger')).toThrow()
    })

    it('throws when name contains spaces', () => {
      expect(() => manager.create('team tiger')).toThrow()
    })

    it('throws when name contains special characters', () => {
      expect(() => manager.create('team@tiger')).toThrow()
    })

    it('accepts names with hyphens and underscores', () => {
      expect(() => manager.create('team-tiger_v2')).not.toThrow()
    })

    it('accepts names with numbers', () => {
      expect(() => manager.create('team42')).not.toThrow()
    })
  })

  describe('get', () => {
    it('returns the context when it exists', () => {
      manager.create('team_tiger')

      const context = manager.get('team_tiger')

      expect(context).not.toBeNull()
      expect(context!.name).toBe('team_tiger')
    })

    it('returns null when context does not exist', () => {
      const context = manager.get('nonexistent')

      expect(context).toBeNull()
    })
  })

  describe('list', () => {
    it('returns empty array when no contexts exist', () => {
      expect(manager.list()).toEqual([])
    })

    it('returns all created contexts', () => {
      manager.create('alpha')
      manager.create('beta')
      manager.create('gamma')

      const contexts = manager.list()

      expect(contexts).toHaveLength(3)
    })

    it('returns contexts sorted alphabetically by name', () => {
      manager.create('gamma')
      manager.create('alpha')
      manager.create('beta')

      const names = manager.list().map((c) => c.name)

      expect(names).toEqual(['alpha', 'beta', 'gamma'])
    })
  })

  describe('delete', () => {
    it('removes the context from storage', () => {
      manager.create('team_tiger')
      manager.delete('team_tiger')

      expect(manager.get('team_tiger')).toBeNull()
    })

    it('throws when context does not exist', () => {
      expect(() => manager.delete('nonexistent')).toThrow()
    })

    it('clears active context when the active one is deleted', () => {
      manager.create('team_tiger')
      manager.setActive('team_tiger')
      manager.delete('team_tiger')

      expect(manager.getActive()).toBeNull()
    })

    it('preserves active context when a different one is deleted', () => {
      manager.create('team_tiger')
      manager.create('platform')
      manager.setActive('team_tiger')
      manager.delete('platform')

      expect(manager.getActive()!.name).toBe('team_tiger')
    })
  })

  describe('addPath', () => {
    it('adds a resolved absolute path to the context', () => {
      manager.create('team_tiger')
      const updated = manager.addPath('team_tiger', tempDir)

      expect(updated.paths).toContain(path.resolve(tempDir))
    })

    it('resolves relative paths to absolute', () => {
      manager.create('team_tiger')
      manager.addPath('team_tiger', tempDir)

      const stored = manager.get('team_tiger')
      expect(path.isAbsolute(stored!.paths[0]!)).toBe(true)
    })

    it('throws when path is already registered', () => {
      manager.create('team_tiger')
      manager.addPath('team_tiger', tempDir)

      expect(() => manager.addPath('team_tiger', tempDir)).toThrow()
    })

    it('throws when context does not exist', () => {
      expect(() => manager.addPath('nonexistent', tempDir)).toThrow()
    })

    it('throws when path does not exist on disk', () => {
      manager.create('team_tiger')

      expect(() =>
        manager.addPath('team_tiger', '/this/path/does/not/exist')
      ).toThrow()
    })

    it('updates updatedAt after adding a path', () => {
      manager.create('team_tiger')
      const original = manager.get('team_tiger')!

      const updated = manager.addPath('team_tiger', tempDir)

      expect(updated.updatedAt >= original.updatedAt).toBe(true)
    })

    it('allows multiple paths to be added', () => {
      const dirA = fs.mkdtempSync(path.join(os.tmpdir(), 'pathseekr-a-'))
      const dirB = fs.mkdtempSync(path.join(os.tmpdir(), 'pathseekr-b-'))

      try {
        manager.create('team_tiger')
        manager.addPath('team_tiger', dirA)
        manager.addPath('team_tiger', dirB)

        const stored = manager.get('team_tiger')
        expect(stored!.paths).toHaveLength(2)
      } finally {
        removeTempDir(dirA)
        removeTempDir(dirB)
      }
    })
  })

  describe('removePath', () => {
    it('removes a registered path from the context', () => {
      manager.create('team_tiger')
      manager.addPath('team_tiger', tempDir)
      manager.removePath('team_tiger', tempDir)

      const stored = manager.get('team_tiger')
      expect(stored!.paths).toHaveLength(0)
    })

    it('throws when path is not registered in the context', () => {
      manager.create('team_tiger')

      expect(() =>
        manager.removePath('team_tiger', '/some/unregistered/path')
      ).toThrow()
    })

    it('throws when context does not exist', () => {
      expect(() =>
        manager.removePath('nonexistent', tempDir)
      ).toThrow()
    })
  })

  describe('setActive and getActive', () => {
    it('sets the active context', () => {
      manager.create('team_tiger')
      manager.setActive('team_tiger')

      const active = manager.getActive()
      expect(active!.name).toBe('team_tiger')
    })

    it('returns null when no active context is set', () => {
      expect(manager.getActive()).toBeNull()
    })

    it('replaces the previously active context', () => {
      manager.create('team_tiger')
      manager.create('platform')
      manager.setActive('team_tiger')
      manager.setActive('platform')

      expect(manager.getActive()!.name).toBe('platform')
    })

    it('throws when setting a nonexistent context as active', () => {
      expect(() => manager.setActive('nonexistent')).toThrow()
    })
  })

  describe('getActiveContextName', () => {
    it('returns the active context name when one is set', () => {
      manager.create('team_tiger')
      manager.setActive('team_tiger')

      expect(manager.getActiveContextName()).toBe('team_tiger')
    })

    it('returns undefined when no active context is set', () => {
      expect(manager.getActiveContextName()).toBeUndefined()
    })
  })

  describe('persistence', () => {
    it('persists data across separate manager instances', () => {
      manager.create('team_tiger')
      manager.setActive('team_tiger')

      const secondManager = new ContextManager(tempDir)

      expect(secondManager.get('team_tiger')).not.toBeNull()
      expect(secondManager.getActive()!.name).toBe('team_tiger')
    })

    it('starts with empty state when data directory is fresh', () => {
      const freshDir = createTempDir()

      try {
        const freshManager = new ContextManager(freshDir)
        expect(freshManager.list()).toEqual([])
        expect(freshManager.getActive()).toBeNull()
      } finally {
        removeTempDir(freshDir)
      }
    })
  })
})