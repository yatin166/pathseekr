import { Command } from 'commander'
import chalk from 'chalk'
import { createContainer, TYPES } from '@pathseekr/core'
import type { EmbeddingIndexBuilder } from '@pathseekr/core'
import { config } from '../config'
import { resolveDbPath, workspaceLabel } from '../workspace'

export const embedCommand = new Command('embed')
  .description('Generate embeddings for indexed chunks (enables semantic search)')
  .option('-w, --workspace <name>', 'Workspace to generate embeddings for')
  .action(async (options) => {
    try {
      const workspaceName = options.workspace as string | undefined
      const dbPath = resolveDbPath(workspaceName, config)
      const label = workspaceLabel(workspaceName, config)

      console.log(
        `\n${chalk.bold('Pathseekr')} ${chalk.dim('—')} ` +
        `generating embeddings ${chalk.dim(`[${label}]`)}\n`
      )

      const container = createContainer(config, dbPath)
      const embeddingIndexBuilder = container.get<EmbeddingIndexBuilder>(TYPES.EmbeddingIndexBuilder)

      let lastLine = ''

      await embeddingIndexBuilder.embedPending((progress) => {
        const bar = '█'.repeat(Math.floor(progress.percentComplete / 5))
        const empty = '░'.repeat(20 - Math.floor(progress.percentComplete / 5))
        const line =
          `  [${chalk.cyan(bar)}${chalk.dim(empty)}] ` +
          `${progress.percentComplete}%  ` +
          `${progress.processed}/${progress.total} chunks`

        if (lastLine) {
          process.stdout.write('\r' + ' '.repeat(lastLine.length) + '\r')
        }

        process.stdout.write(line)
        lastLine = line
      })

      if (lastLine) {
        process.stdout.write('\r' + ' '.repeat(lastLine.length) + '\r')
      }

      console.log(`\n${chalk.green('✓')} Embeddings complete\n`)

    } catch (err) {
      console.error(`\n${chalk.red('✗')} ${err instanceof Error ? err.message : String(err)}\n`)
      process.exit(1)
    }
  })