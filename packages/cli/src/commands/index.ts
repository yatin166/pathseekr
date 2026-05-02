import { Command } from 'commander'
import chalk from 'chalk'
import path from 'path'
import { createContainer, TYPES } from '@spyglass/core'
import type { IIndexer } from '@spyglass/core'
import type { IndexingProgress } from '@spyglass/shared'
import { config } from '../config'
import { formatDuration } from '../ui/progress'

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
        'Skip embedding generation — only BM25 search available',
        false
    )
    .action(async (inputPath: string, options) => {
        const absolutePath = path.resolve(inputPath)

        console.log(
            `\n${chalk.bold('Spyglass')} ${chalk.dim('—')} ` +
            `indexing ${chalk.cyan(absolutePath)}\n`
        )

        const container = createContainer(config)
        const indexer = container.get<IIndexer>(TYPES.IIndexer)

        const startTime = Date.now()

        // Track phase separately for clean display
        let currentPhase = 'parsing'
        let lastLine = ''
        let parseTime = 0
        let phaseStartTime = Date.now()

        const job = await indexer.index(
            absolutePath,
            {
                force: options.force as boolean,
                skipEmbedding: options.skipEmbedding as boolean,
            },
            (progress: IndexingProgress) => {
                // Detect phase transition
                if (progress.phase !== currentPhase) {
                    // Clear progress line
                    if (lastLine) {
                        process.stdout.write(
                            '\r' + ' '.repeat(lastLine.length) + '\r'
                        )
                    }

                    if (progress.phase === 'embedding') {
                        // Phase 1 complete message
                        parseTime = Date.now() - phaseStartTime
                        console.log(
                            `${chalk.green('✓')} Phase 1 — Parsing complete ` +
                            `${chalk.dim(formatDuration(parseTime))}\n` +
                            `  ${chalk.bold(String(progress.totalChunks))} chunks indexed ` +
                            `${chalk.green('— BM25 search available now')}\n`
                        )

                        console.log(chalk.dim('Phase 2 — Generating embeddings...'))
                        phaseStartTime = Date.now()
                    }

                    currentPhase = progress.phase
                    lastLine = ''
                }

                // Render progress bar
                const line = renderProgress(progress)

                if (lastLine) {
                    process.stdout.write('\r' + ' '.repeat(lastLine.length) + '\r')
                }
                process.stdout.write(line)
                lastLine = line
            }
        )

        // Clear final progress line
        if (lastLine) {
            process.stdout.write('\r' + ' '.repeat(lastLine.length) + '\r')
        }

        const totalDuration = Date.now() - startTime

        if (job.status === 'completed') {
            // Phase 2 complete message
            if (!options.skipEmbedding) {
                const embedTime = job.embedMs ?? 0
                console.log(
                    `${chalk.green('✓')} Phase 2 — Embedding complete ` +
                    `${chalk.dim(formatDuration(embedTime))}\n` +
                    `  ${chalk.bold(String(job.totalChunks))} chunks embedded ` +
                    `${chalk.green('— Hybrid search available now')}\n`
                )
            }

            // Final summary
            console.log(
                chalk.dim('─'.repeat(50)) + '\n' +
                `${chalk.green('✓')} Done in ${chalk.bold(formatDuration(totalDuration))}\n`
            )

            console.log(
                `  ${chalk.bold(String(job.totalChunks))} chunks ` +
                `from ${chalk.bold(String(job.processedFiles))} files`
            )

            if (job.parseMs) {
                console.log(
                    chalk.dim(
                        `  Parse + BM25:  ${formatDuration(job.parseMs)}`
                    )
                )
            }

            if (job.embedMs) {
                console.log(
                    chalk.dim(
                        `  Embedding:     ${formatDuration(job.embedMs)}`
                    )
                )
            }

            if (job.skippedFiles > 0) {
                console.log(
                    chalk.dim(
                        `  Skipped:       ${job.skippedFiles} files unchanged`
                    )
                )
            }

            if (options.skipEmbedding) {
                console.log(
                    `\n${chalk.yellow('!')} Embedding skipped. ` +
                    `Run ${chalk.cyan('spyglass embed')} for hybrid search.\n`
                )
            }

        } else if (job.status === 'failed') {
            console.error(
                `\n${chalk.red('✗')} Indexing failed: ${job.errorMessage}\n`
            )
            process.exit(1)
        }

        console.log()
    })

function renderProgress(progress: IndexingProgress): string {
    const isEmbedding = progress.phase === 'embedding'

    const width = 25
    const filled = Math.floor(progress.percentComplete / 4)
    const empty = width - filled

    const bar = chalk.cyan('█'.repeat(filled)) + chalk.dim('░'.repeat(empty))

    const percent = String(progress.percentComplete).padStart(3)

    if (isEmbedding && progress.processedChunks !== undefined) {
        const chunks = `${progress.processedChunks}/${progress.totalChunksToEmbed ?? '?'} chunks`
        return `  [${bar}] ${percent}%  ${chunks}`
    }

    const files =
        `${progress.processedFiles}/${progress.totalFiles} files`
    const chunks = chalk.dim(`${progress.totalChunks} chunks`)
    return `  [${bar}] ${percent}%  ${files}  ${chunks}`
}