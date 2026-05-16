import { describe, it, expect, beforeEach } from 'vitest'
import { ParserRegistry } from '../../../src/parsers/parser-registry'

describe('ParserRegistry', () => {
  let registry: ParserRegistry

  beforeEach(() => {
    registry = new ParserRegistry()
  })

  describe('getParser', () => {
    describe('TypeScript files', () => {
      it('returns a parser for .ts files', () => {
        expect(registry.getParser('/src/indexer.ts')).not.toBeNull()
      })

      it('returns a parser for .tsx files', () => {
        expect(registry.getParser('/src/component.tsx')).not.toBeNull()
      })

      it('returns the TypeScript parser for .ts files', () => {
        const parser = registry.getParser('/src/indexer.ts')

        expect(parser!.supports('/src/indexer.ts')).toBe(true)
      })
    })

    describe('JavaScript files', () => {
      it('returns a parser for .js files', () => {
        expect(registry.getParser('/src/utils.js')).not.toBeNull()
      })

      it('returns a parser for .jsx files', () => {
        expect(registry.getParser('/src/component.jsx')).not.toBeNull()
      })

      it('returns a parser for .mjs files', () => {
        expect(registry.getParser('/src/module.mjs')).not.toBeNull()
      })

      it('returns a parser for .cjs files', () => {
        expect(registry.getParser('/src/module.cjs')).not.toBeNull()
      })
    })

    describe('Python files', () => {
      it('returns a parser for .py files', () => {
        expect(registry.getParser('/src/processor.py')).not.toBeNull()
      })

      it('returns a parser for .pyw files', () => {
        expect(registry.getParser('/src/app.pyw')).not.toBeNull()
      })
    })

    describe('Java files', () => {
      it('returns a parser for .java files', () => {
        expect(registry.getParser('/src/MyClass.java')).not.toBeNull()
      })
    })

    describe('ignored extensions', () => {
      it('returns null for .json files', () => {
        expect(registry.getParser('/src/config.json')).toBeNull()
      })

      it('returns null for .md files', () => {
        expect(registry.getParser('/README.md')).toBeNull()
      })

      it('returns null for .yaml files', () => {
        expect(registry.getParser('/config.yaml')).toBeNull()
      })

      it('returns null for .yml files', () => {
        expect(registry.getParser('/config.yml')).toBeNull()
      })

      it('returns null for .toml files', () => {
        expect(registry.getParser('/Cargo.toml')).toBeNull()
      })

      it('returns null for .lock files', () => {
        expect(registry.getParser('/package-lock.lock')).toBeNull()
      })

      it('returns null for image files', () => {
        expect(registry.getParser('/assets/logo.png')).toBeNull()
        expect(registry.getParser('/assets/photo.jpg')).toBeNull()
        expect(registry.getParser('/assets/icon.svg')).toBeNull()
      })

      it('returns null for font files', () => {
        expect(registry.getParser('/fonts/icon.woff')).toBeNull()
        expect(registry.getParser('/fonts/icon.woff2')).toBeNull()
        expect(registry.getParser('/fonts/icon.ttf')).toBeNull()
      })

      it('returns null for archive files', () => {
        expect(registry.getParser('/dist/bundle.zip')).toBeNull()
        expect(registry.getParser('/dist/bundle.gz')).toBeNull()
        expect(registry.getParser('/dist/bundle.tar')).toBeNull()
      })
    })

    describe('unsupported extensions', () => {
      it('returns null for .rs files', () => {
        expect(registry.getParser('/src/main.rs')).toBeNull()
      })

      it('returns null for .go files', () => {
        expect(registry.getParser('/src/main.go')).toBeNull()
      })

      it('returns null for .sh files', () => {
        expect(registry.getParser('/scripts/build.sh')).toBeNull()
      })

      it('returns null for .sql files', () => {
        expect(registry.getParser('/migrations/001.sql')).toBeNull()
      })

      it('returns null for files with no extension', () => {
        expect(registry.getParser('/src/Makefile')).toBeNull()
      })

      it('returns null for .txt files', () => {
        expect(registry.getParser('/notes.txt')).toBeNull()
      })
    })
  })

  describe('canParse', () => {
    it('returns true for supported TypeScript files', () => {
      expect(registry.canParse('/src/indexer.ts')).toBe(true)
    })

    it('returns true for supported JavaScript files', () => {
      expect(registry.canParse('/src/utils.js')).toBe(true)
    })

    it('returns true for supported Python files', () => {
      expect(registry.canParse('/src/processor.py')).toBe(true)
    })

    it('returns true for supported Java files', () => {
      expect(registry.canParse('/src/MyClass.java')).toBe(true)
    })

    it('returns false for explicitly ignored extensions', () => {
      expect(registry.canParse('/config.json')).toBe(false)
    })

    it('returns false for unsupported extensions', () => {
      expect(registry.canParse('/src/main.rs')).toBe(false)
    })

    it('returns false for files with no extension', () => {
      expect(registry.canParse('/Makefile')).toBe(false)
    })
  })

  describe('getSupportedExtensions', () => {
    it('returns a non-empty array', () => {
      expect(registry.getSupportedExtensions().length).toBeGreaterThan(0)
    })

    it('includes TypeScript extensions', () => {
      const extensions = registry.getSupportedExtensions()

      expect(extensions).toContain('.ts')
      expect(extensions).toContain('.tsx')
    })

    it('includes JavaScript extensions', () => {
      const extensions = registry.getSupportedExtensions()

      expect(extensions).toContain('.js')
      expect(extensions).toContain('.jsx')
      expect(extensions).toContain('.mjs')
      expect(extensions).toContain('.cjs')
    })

    it('includes Python extensions', () => {
      const extensions = registry.getSupportedExtensions()

      expect(extensions).toContain('.py')
    })

    it('includes Java extensions', () => {
      const extensions = registry.getSupportedExtensions()

      expect(extensions).toContain('.java')
    })

    it('does not include ignored extensions', () => {
      const extensions = registry.getSupportedExtensions()

      expect(extensions).not.toContain('.json')
      expect(extensions).not.toContain('.md')
      expect(extensions).not.toContain('.yaml')
    })
  })
})