import { describe, it, expect, beforeEach } from 'vitest'
import { CodeTokenizer } from '../../../src/retrieval/infrastructure/tokenizer/code-tokenizer'

describe('CodeTokenizer', () => {
  let tokenizer: CodeTokenizer

  beforeEach(() => {
    tokenizer = new CodeTokenizer()
  })

  describe('return shape', () => {
    it('returns terms array and termFrequencies map', () => {
      const result = tokenizer.tokenize('hello world')

      expect(result.terms).toBeDefined()
      expect(result.termFrequencies).toBeDefined()
      expect(result.termFrequencies).toBeInstanceOf(Map)
    })

    it('returns empty result for empty string', () => {
      const result = tokenizer.tokenize('')

      expect(result.terms).toEqual([])
      expect(result.termFrequencies.size).toBe(0)
    })

    it('terms array contains only unique values', () => {
      const result = tokenizer.tokenize('indexer indexer parser indexer')
      const unique = new Set(result.terms)

      expect(result.terms.length).toBe(unique.size)
    })

    it('normalizes all terms to lowercase', () => {
      const result = tokenizer.tokenize('Hello World FOO')

      expect(result.terms).toContain('hello')
      expect(result.terms).toContain('world')
      expect(result.terms).toContain('foo')
      expect(result.terms).not.toContain('Hello')
      expect(result.terms).not.toContain('FOO')
    })
  })

  describe('camelCase splitting', () => {
    it('splits simple camelCase into individual parts', () => {
      const result = tokenizer.tokenize('chunkBuilder')

      expect(result.terms).toContain('chunk')
      expect(result.terms).toContain('builder')
    })

    it('splits PascalCase into individual parts', () => {
      const result = tokenizer.tokenize('CodebaseIndexer')

      expect(result.terms).toContain('codebase')
      expect(result.terms).toContain('indexer')
    })

    it('handles consecutive uppercase letters correctly', () => {
      const result = tokenizer.tokenize('BM25Retriever')

      expect(result.terms).toContain('retriever')
      expect(result.terms).toContain('bm25')
      expect(result.terms).toContain('bm25retriever')
    })

    it('generates compound term from adjacent camelCase parts', () => {
      const result = tokenizer.tokenize('TypeScriptParser')

      expect(result.terms).toContain('typescript')
      expect(result.terms).toContain('typescriptparser')
    })

    it('adds full token as an additional term', () => {
      const result = tokenizer.tokenize('parseResult')

      expect(result.terms).toContain('parse')
      expect(result.terms).toContain('result')
      expect(result.terms).toContain('parseresult')
    })

    it('splits three-part PascalCase correctly', () => {
      const result = tokenizer.tokenize('EmbeddingIndexBuilder')

      expect(result.terms).toContain('embedding')
      expect(result.terms).toContain('index')
      expect(result.terms).toContain('builder')
    })
  })

  describe('stop word filtering', () => {
    it('filters TypeScript and JavaScript keywords', () => {
      const result = tokenizer.tokenize('const let var async await typeof')

      expect(result.terms).not.toContain('const')
      expect(result.terms).not.toContain('let')
      expect(result.terms).not.toContain('var')
      expect(result.terms).not.toContain('async')
      expect(result.terms).not.toContain('await')
      expect(result.terms).not.toContain('typeof')
    })

    it('filters class and interface keywords', () => {
      const result = tokenizer.tokenize('class interface enum namespace abstract')

      expect(result.terms).not.toContain('class')
      expect(result.terms).not.toContain('interface')
      expect(result.terms).not.toContain('enum')
      expect(result.terms).not.toContain('namespace')
      expect(result.terms).not.toContain('abstract')
    })

    it('filters Python keywords', () => {
      const result = tokenizer.tokenize('def self cls pass lambda')

      expect(result.terms).not.toContain('def')
      expect(result.terms).not.toContain('self')
      expect(result.terms).not.toContain('cls')
      expect(result.terms).not.toContain('pass')
      expect(result.terms).not.toContain('lambda')
    })

    it('filters Java keywords', () => {
      const result = tokenizer.tokenize('final synchronized volatile transient')

      expect(result.terms).not.toContain('final')
      expect(result.terms).not.toContain('synchronized')
      expect(result.terms).not.toContain('volatile')
      expect(result.terms).not.toContain('transient')
    })

    it('filters universal stop words', () => {
      const result = tokenizer.tokenize('the and or but for from with')

      expect(result.terms).not.toContain('the')
      expect(result.terms).not.toContain('and')
      expect(result.terms).not.toContain('or')
      expect(result.terms).not.toContain('but')
    })

    it('filters import and export keywords', () => {
      const result = tokenizer.tokenize('import export return')

      expect(result.terms).not.toContain('import')
      expect(result.terms).not.toContain('export')
      expect(result.terms).not.toContain('return')
    })

    it('keeps valid non-stop words', () => {
      const result = tokenizer.tokenize('retriever indexer parser workspace')

      expect(result.terms).toContain('retriever')
      expect(result.terms).toContain('indexer')
      expect(result.terms).toContain('parser')
      expect(result.terms).toContain('workspace')
    })
  })

  describe('term length filtering', () => {
    it('filters single character terms', () => {
      const result = tokenizer.tokenize('a b c x y z')

      expect(result.terms).not.toContain('a')
      expect(result.terms).not.toContain('b')
      expect(result.terms).not.toContain('c')
    })

    it('keeps terms at minimum length of 2', () => {
      const result = tokenizer.tokenize('id')

      expect(result.terms).toContain('id')
    })

    it('filters terms exceeding maximum length of 50', () => {
      const longTerm = 'a'.repeat(51)
      const result = tokenizer.tokenize(longTerm)

      expect(result.terms).not.toContain(longTerm)
    })

    it('keeps terms exactly at maximum length of 50', () => {
      const maxTerm = 'a'.repeat(50)
      const result = tokenizer.tokenize(maxTerm)

      expect(result.terms).toContain(maxTerm)
    })
  })

  describe('numeric filtering', () => {
    it('filters purely numeric tokens', () => {
      const result = tokenizer.tokenize('123 456 0 99')

      expect(result.terms).not.toContain('123')
      expect(result.terms).not.toContain('456')
      expect(result.terms).not.toContain('99')
    })

    it('keeps alphanumeric tokens', () => {
      const result = tokenizer.tokenize('bm25 v8 es6')

      expect(result.terms).toContain('bm25')
      expect(result.terms).toContain('v8')
      expect(result.terms).toContain('es6')
    })
  })

  describe('delimiter handling', () => {
    it('splits on whitespace including tabs and newlines', () => {
      const result = tokenizer.tokenize('alpha\tbeta\ngamma delta')

      expect(result.terms).toContain('alpha')
      expect(result.terms).toContain('beta')
      expect(result.terms).toContain('gamma')
      expect(result.terms).toContain('delta')
    })

    it('splits on dots and commas', () => {
      const result = tokenizer.tokenize('hello.world,foo')

      expect(result.terms).toContain('hello')
      expect(result.terms).toContain('world')
      expect(result.terms).toContain('foo')
    })

    it('splits on parentheses and brackets', () => {
      const result = tokenizer.tokenize('search(query)[index]{key}')

      expect(result.terms).toContain('search')
      expect(result.terms).toContain('query')
      expect(result.terms).toContain('index')
      expect(result.terms).toContain('key')
    })

    it('splits on angle brackets and operators', () => {
      const result = tokenizer.tokenize('Promise<Result>')

      expect(result.terms).toContain('promise')
      expect(result.terms).toContain('result')
    })

    it('handles multiple consecutive delimiters', () => {
      const result = tokenizer.tokenize('foo...bar;;;baz')

      expect(result.terms).toContain('foo')
      expect(result.terms).toContain('bar')
      expect(result.terms).toContain('baz')
    })
  })

  describe('term frequencies', () => {
    it('counts single occurrence as 1', () => {
      const result = tokenizer.tokenize('pathseekr')

      expect(result.termFrequencies.get('pathseekr')).toBe(1)
    })

    it('counts multiple occurrences of same term correctly', () => {
      const result = tokenizer.tokenize('search search search')

      expect(result.termFrequencies.get('search')).toBe(3)
    })

    it('tracks frequencies independently per term', () => {
      const result = tokenizer.tokenize('indexer parser indexer retriever')

      expect(result.termFrequencies.get('indexer')).toBe(2)
      expect(result.termFrequencies.get('parser')).toBe(1)
      expect(result.termFrequencies.get('retriever')).toBe(1)
    })

    it('terms array keys match termFrequencies keys', () => {
      const result = tokenizer.tokenize('chunk builder chunkBuilder')

      for (const term of result.terms) {
        expect(result.termFrequencies.has(term)).toBe(true)
      }
    })
  })

  describe('real code snippets', () => {
    it('tokenizes a method signature', () => {
      const result = tokenizer.tokenize(
        'async search(query: SearchQuery): Promise<RetrievalResult[]>'
      )

      expect(result.terms).toContain('search')
      expect(result.terms).toContain('query')
      expect(result.terms).toContain('retrieval')
      expect(result.terms).toContain('result')
      expect(result.terms).toContain('promise')
    })

    it('tokenizes a class declaration with implements', () => {
      const result = tokenizer.tokenize(
        'export class BM25Retriever implements IRetriever'
      )

      expect(result.terms).toContain('retriever')
      expect(result.terms).toContain('iretriever')
    })

    it('tokenizes an import statement with path stripping', () => {
      const result = tokenizer.tokenize(
        "import { ChunkBuilder } from '../indexer/chunk-builder'"
      )

      expect(result.terms).toContain('chunk')
      expect(result.terms).toContain('builder')
      expect(result.terms).toContain('chunkbuilder')
    })

    it('tokenizes a TypeScript interface definition', () => {
      const result = tokenizer.tokenize(
        'export interface IDocumentParser { parse(filePath: string): Promise<ParseResult> }'
      )

      expect(result.terms).toContain('document')
      expect(result.terms).toContain('parser')
      expect(result.terms).toContain('parse')
      expect(result.terms).toContain('filepath')
      expect(result.terms).toContain('parseresult')
    })
  })
})