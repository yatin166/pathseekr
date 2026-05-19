import fs from 'fs'
import type { PathseekrConfig } from '@pathseekr/shared'
import type { IResultFormatter } from '../interfaces/result-formatter.interface'
import { BaseTool } from './base-tool'
import { resolveProjectMapPath } from '../context'
import schema from '../schemas/get-project-map.schema.json'

export class GetProjectMapTool extends BaseTool {
  readonly name = 'get_project_map'

  readonly description =
    'Returns the structural overview of the indexed codebase. ' +
    'Shows all files with their classes, interfaces, types, and functions. ' +
    'Use this first to understand what is in the codebase before searching.'

  readonly inputSchema = schema as Record<string, unknown>

  constructor(config: PathseekrConfig, formatter: IResultFormatter) {
    super(config, formatter)
  }

  async execute(args: Record<string, unknown>): Promise<string> {
    const contextName = this.getString(args, 'context_name')
    const resolved = this.resolveContext(contextName)

    if ('error' in resolved) {
      return resolved.error
    }

    const mapPath = resolveProjectMapPath(resolved.dbPath)

    if (!fs.existsSync(mapPath)) {
      return (
        'No project map found for this context.\n' +
        'Run: seek index to generate one.'
      )
    }

    return fs.readFileSync(mapPath, 'utf-8')
  }
}