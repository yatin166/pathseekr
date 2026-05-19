import { createContainer, TYPES } from '@pathseekr/core'
import { DatabaseConnection } from '@pathseekr/core/dist/storage/database'
import type { ChunkType, PathseekrConfig } from '@pathseekr/shared'
import type { IResultFormatter, RawSymbolRow } from '../interfaces/result-formatter.interface'
import { BaseTool } from './base-tool'
import schema from '../schemas/find-symbol.schema.json'

const SYMBOL_QUERY_BASE = `
    SELECT
        c.id,
        c.name,
        c.chunk_type,
        c.start_line,
        c.end_line,
        c.content,
        c.metadata,
        d.source_path
    FROM chunks c
    JOIN documents d ON c.document_id = d.id
    WHERE LOWER(c.name) LIKE LOWER(?)
`

const RESULT_LIMIT = 20

const SYMBOL_QUERY_WITH_TYPE = `${SYMBOL_QUERY_BASE} AND c.chunk_type = ? ORDER BY c.name LIMIT ${RESULT_LIMIT}`
const SYMBOL_QUERY_ALL_TYPES = `${SYMBOL_QUERY_BASE} ORDER BY c.name LIMIT ${RESULT_LIMIT}`

export class FindSymbolTool extends BaseTool {
  readonly name = 'find_symbol'

  readonly description =
    'Finds a specific symbol (class, function, method, interface, or type) by name. ' +
    'Supports partial name matching. Use this when you know the name of what you are looking for.'

  readonly inputSchema = schema as Record<string, unknown>

  constructor(config: PathseekrConfig, formatter: IResultFormatter) {
    super(config, formatter)
  }

  async execute(args: Record<string, unknown>): Promise<string> {
    const name = this.getString(args, 'name')

    if (!name) {
      return 'name is required.'
    }

    const contextName = this.getString(args, 'context_name')
    const chunkType = this.getString(args, 'type') as ChunkType | undefined

    const resolved = this.resolveContext(contextName)

    if ('error' in resolved) {
      return resolved.error
    }

    let rows: RawSymbolRow[]

    try {
      const container = createContainer(this.config, resolved.dbPath)
      const connection = container.get<DatabaseConnection>(TYPES.DatabaseConnection)
      const db = connection.getDb()

      rows = chunkType
        ? db.prepare(SYMBOL_QUERY_WITH_TYPE).all(`%${name}%`, chunkType) as RawSymbolRow[]
        : db.prepare(SYMBOL_QUERY_ALL_TYPES).all(`%${name}%`) as RawSymbolRow[]
    } catch (err) {
      return `Symbol lookup failed: ${this.formatError(err)}`
    }

    if (rows.length === 0) {
      const typeFilter = chunkType ? ` of type "${chunkType}"` : ''
      return `No symbol named "${name}"${typeFilter} found in this context.`
    }

    return this.formatter.formatSymbolResults(rows, name)
  }
}