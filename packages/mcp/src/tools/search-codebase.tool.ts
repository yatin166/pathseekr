import { createContainer, TYPES } from '@pathseekr/core'
import type { IRetriever } from '@pathseekr/core'
import type { RetrievalStrategy, PathseekrConfig } from '@pathseekr/shared'
import type { IResultFormatter } from '../interfaces/result-formatter.interface'
import { BaseTool } from './base-tool'
import schema from '../schemas/search-codebase.schema.json'

const DEFAULT_STRATEGY: RetrievalStrategy = 'graph'
const DEFAULT_LIMIT = 10

const STRATEGY_TYPE_MAP: Record<string, symbol> = {
  graph: TYPES.GraphRetriever,
  bm25: TYPES.BM25Retriever,
  vector: TYPES.VectorRetriever,
  hybrid: TYPES.HybridRetriever,
}

export class SearchCodebaseTool extends BaseTool {
  readonly name = 'search_codebase'

  readonly description =
    'Searches the indexed codebase using structural and keyword search. ' +
    'Returns matching chunks with their source location and a content preview. ' +
    'Use graph strategy (default) for structural traversal, bm25 for keyword matching.'

  readonly inputSchema = schema as Record<string, unknown>

  constructor(config: PathseekrConfig, formatter: IResultFormatter) {
    super(config, formatter)
  }

  async execute(args: Record<string, unknown>): Promise<string> {
    const query = this.getString(args, 'query')

    if (!query) {
      return 'query is required.'
    }

    const contextName = this.getString(args, 'context_name')
    const strategy = (this.getString(args, 'strategy') ?? DEFAULT_STRATEGY) as RetrievalStrategy
    const limit = this.getNumber(args, 'limit') ?? DEFAULT_LIMIT

    const resolved = this.resolveContext(contextName)

    if ('error' in resolved) {
      return resolved.error
    }

    let retriever: IRetriever

    try {
      const container = createContainer(this.config, resolved.dbPath)
      const typeSymbol = STRATEGY_TYPE_MAP[strategy] ?? TYPES.GraphRetriever
      retriever = container.get<IRetriever>(typeSymbol)
    } catch (err) {
      return `Failed to initialise search: ${this.formatError(err)}`
    }

    const ready = await retriever.isReady()

    if (!ready) {
      if (strategy === 'hybrid') {
        return (
          'Hybrid search requires embeddings.\n' +
          'Run: seek embed to generate them, or use strategy: bm25'
        )
      }
      return 'No search index found for this context. Run: seek index'
    }

    const results = await retriever.search({ query, strategy, limit })

    if (results.length === 0) {
      return `No results found for "${query}"`
    }

    return this.formatter.formatSearchResults(results, query)
  }
}