import { Command } from 'commander'
import chalk from 'chalk'
import { createContainer, TYPES } from '@pathseekr/core'
import type { EmbeddingIndexBuilder } from '@pathseekr/core'
import { config } from '../config'

export const embedCommand = new Command('embed')
    .description('Generate embeddings for indexed chunks (enables semantic search)')
    .action(async () => {
        console.log(`\n${chalk.bold('Pathseekr')} ${chalk.dim('— generating embeddings')}\n`)

        const container = createContainer(config)
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

        console.log(`\n\n${chalk.green('✓')} Embeddings complete\n`)
    })