import { Command } from 'commander'
import chalk from 'chalk'
import { createContainer, TYPES } from '@pathseekr/core'
import type { IDocumentRepository } from '@pathseekr/core'
import { config } from '../config'
import { resolveDbPath, workspaceLabel } from '../workspace'
import { renderStatsTable, renderLanguageTable } from '../ui/table'

export const statusCommand = new Command('status')
  .description('Show indexing statistics')
  .option('-w, --workspace <name>', 'Workspace to show status for')
  .action(async (options) => {
    try {
      const workspaceName = options.workspace as string | undefined
      const dbPath = resolveDbPath(workspaceName, config)
      const label = workspaceLabel(workspaceName, config)

      const container = createContainer(config, dbPath)
      const documentRepository = container.get<IDocumentRepository>(TYPES.IDocumentRepository)
      const stats = await documentRepository.getStats()

      console.log(
        `\n${chalk.bold('Pathseekr')} ${chalk.dim('—')} ` +
        `status ${chalk.dim(`[${label}]`)}\n`
      )

      if (stats.totalDocuments === 0) {
        console.log(chalk.dim('  No files indexed yet. Run: seek index\n'))
        return
      }

      console.log(
        renderStatsTable([
          ['Documents', stats.totalDocuments],
          ['Chunks', stats.totalChunks],
          ['Embeddings', stats.totalEmbeddings],
          ['Database size', formatBytes(stats.databaseSizeBytes)],
          ['Last indexed', stats.lastIndexedAt
            ? stats.lastIndexedAt.toLocaleString()
            : 'never'],
        ])
      )

      if (Object.keys(stats.byLanguage).length > 0) {
        console.log(`\n${chalk.dim('By language:')}\n`)
        console.log(renderLanguageTable(stats.byLanguage))
      }

      console.log()

    } catch (err) {
      console.error(`\n${chalk.red('✗')} ${err instanceof Error ? err.message : String(err)}\n`)
      process.exit(1)
    }
  })

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`
  }
  if (bytes < 1048576) {
    return `${(bytes / 1024).toFixed(1)} KB`
  }
  return `${(bytes / 1048576).toFixed(1)} MB`
}