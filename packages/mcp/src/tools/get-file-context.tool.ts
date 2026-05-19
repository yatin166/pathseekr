import { createContainer, TYPES } from '@pathseekr/core'
import type { IDocumentRepository, IChunkRepository } from '@pathseekr/core'
import type { PathseekrConfig } from '@pathseekr/shared'
import type { IResultFormatter } from '../interfaces/result-formatter.interface'
import { BaseTool } from './base-tool'
import schema from '../schemas/get-file-context.schema.json'

export class GetFileContextTool extends BaseTool {
  readonly name = 'get_file_context'

  readonly description =
    'Returns all indexed symbols from a specific file. ' +
    'Shows classes, functions, methods and their signatures grouped by type. ' +
    'Use this when you know the file path and want to understand its full structure.'

  readonly inputSchema = schema as Record<string, unknown>

  constructor(config: PathseekrConfig, formatter: IResultFormatter) {
    super(config, formatter)
  }

  async execute(args: Record<string, unknown>): Promise<string> {
    const filePath = this.getString(args, 'file_path')

    if (!filePath) {
      return 'file_path is required.'
    }

    const contextName = this.getString(args, 'context_name')
    const resolved = this.resolveContext(contextName)

    if ('error' in resolved) {
      return resolved.error
    }

    try {
      const container = createContainer(this.config, resolved.dbPath)
      const documentRepository = container.get<IDocumentRepository>(TYPES.IDocumentRepository)
      const chunkRepository = container.get<IChunkRepository>(TYPES.IChunkRepository)

      const document = await documentRepository.findByPath(filePath)

      if (!document) {
        return (
          `File "${filePath}" has not been indexed in this context.\n` +
          `Run: seek index to index it.`
        )
      }

      const chunks = await chunkRepository.findByDocumentId(document.id)

      if (chunks.length === 0) {
        return (
          `File "${filePath}" is indexed but contains no extractable symbols.\n` +
          `It may have no exported classes, functions, or methods.`
        )
      }

      return this.formatter.formatFileContext(filePath, document.language, chunks)
    } catch (err) {
      return `Failed to retrieve file context: ${this.formatError(err)}`
    }
  }
}