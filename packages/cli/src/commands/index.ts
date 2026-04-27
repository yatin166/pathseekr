import { Command } from 'commander'
import chalk from 'chalk'
import path from 'path'
import { createContainer, TYPES } from '@spyglass/core'
import type { IIndexer } from '@spyglass/core'
import type { IndexingProgress } from '@spyglass/shared'
import { config } from '../config'
import { renderProgressBar, formatStatus, formatDuration } from '../ui/progress'

export const indexCommand = new Command('index')
    .description('Index a local directory or file')
    .argument(
        '<path>',
        'Path to the directory or file to index'
    )
    .option(
        '-f, --force',
        'Force re-index even if files have not changed',
        false
    )
    .option(
        '--skip-embedding',
        'Parse and store chunks without generating embeddings',
        false
    )
    .action(async (inputPath: string, options) => {
        const absolutePath = path.resolve(inputPath)

        console.log(`\n${chalk.bold('Spyglass')} ${chalk.dim('—')} indexing ${chalk.cyan(absolutePath)}\n`)

        const container = createContainer(config)
        const indexer = container.get<IIndexer>(TYPES.IIndexer)

        const startTime = Date.now()
        let lastLine = ''

        const job = await indexer.index(
            absolutePath,
            {
                force: options.force as boolean,
                skipEmbedding: options.skipEmbedding as boolean,
            },
            (progress: IndexingProgress) => {
                const line = renderProgressBar(progress)

                if (lastLine) {
                    process.stdout.write('\r' + ' '.repeat(lastLine.length) + '\r')
                }
                process.stdout.write(line)
                lastLine = line
            }
        )


        if (lastLine) {
            process.stdout.write('\r' + ' '.repeat(lastLine.length) + '\r')
        }

        const duration = Date.now() - startTime

        // Results summary
        console.log(`${formatStatus(job.status)}  ${chalk.dim(formatDuration(duration))}\n`)

        if (job.status === 'completed') {
            console.log(`  ${chalk.green('✓')} ${chalk.bold(String(job.totalChunks))} chunks from ${chalk.bold(String(job.processedFiles))} files`)
            if (job.skippedFiles > 0) {
                console.log(`  ${chalk.dim(`${job.skippedFiles} files skipped (unchanged or unsupported)`)}`)
            }
        }

        if (job.status === 'failed' && job.errorMessage) {
            console.error(`\n${chalk.red('Error:')} ${job.errorMessage}`)
            process.exit(1)
        }

        console.log()
})