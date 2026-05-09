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
    .argument('<path>', 'Path to the directory or file to index')
    .option('-f, --force',         'Force re-index even if files have not changed', false)
    .option('--skip-embedding',    'Skip embedding generation — only BM25 and graph search available', true)
    .action(async (inputPath: string, options) => {
        const absolutePath = path.resolve(inputPath)

        console.log(
            `\n${chalk.bold('Spyglass')} ${chalk.dim('—')} ` +
            `indexing ${chalk.cyan(absolutePath)}\n`
        )

        const container = createContainer(config)
        const indexer   = container.get<IIndexer>(TYPES.IIndexer)

        let lastLine = ''

        const clearProgress = () => {
            if (lastLine) {
                process.stdout.write('\r' + ' '.repeat(lastLine.length) + '\r')
                lastLine = ''
            }
        }

        const writeProgress = (line: string) => {
            clearProgress()
            process.stdout.write(`    ${line}`)
            lastLine = `    ${line}`
        }

        const stepStart = (label: string) => {
            clearProgress()
            console.log(`  ${chalk.dim('◆')} ${chalk.dim(label)}`)
        }

        const stepDone = (label: string, detail: string, ms: number) => {
            clearProgress()
            console.log(
                `  ${chalk.green('✓')} ` +
                `${chalk.bold(label.padEnd(16))} ` +
                `${detail.padEnd(28)} ` +
                chalk.dim(formatDuration(ms))
            )
        }

        const stepSkipped = (label: string, reason: string) => {
            clearProgress()
            console.log(
                `  ${chalk.dim('–')} ` +
                `${chalk.dim(label.padEnd(16))} ` +
                chalk.dim(reason)
            )
        }

        let currentStatus = ''
        let stepStartTime = Date.now()
        const startedAt = Date.now()

        stepStart('Scanning files')

        const job = await indexer.index(
            absolutePath,
            {
                force: options.force as boolean,
                skipEmbedding: options.skipEmbedding as boolean,
            },
            (progress: IndexingProgress) => {
                const { status } = progress

                if (status !== currentStatus) {

                    if (currentStatus === 'scanning' && status === 'parsing') {
                        stepDone('Scanning', `${progress.totalFiles} files found`, progress.scanMs ?? 0)
                        console.log()
                        stepStart('Parsing & BM25 index')
                    }

                    else if (currentStatus === 'parsing' && status === 'graphing') {
                        stepDone(
                            'Parsing & BM25',
                            `${progress.totalChunks} chunks indexed`,
                            Date.now() - stepStartTime
                        )
                        console.log()
                        stepStart('Building graph')
                    }

                    else if (currentStatus === 'graphing' && status === 'embedding') {
                        console.log()
                        stepStart('Generating embeddings')
                    }

                    currentStatus = status
                    stepStartTime = Date.now()
                }

                if (status === 'graphing' && progress.graphMs !== undefined) {
                    stepDone('Graph', 'edges resolved', progress.graphMs)
                }

                if (status === 'parsing' && progress.totalFiles > 0) {
                    writeProgress(renderProgress(progress))
                }

                if (status === 'embedding') {
                    writeProgress(renderProgress(progress))
                }
            }
        )

        clearProgress()

        if (job.status === 'completed') {

            if (options.skipEmbedding) {
                console.log()
                stepSkipped('Embeddings', 'skipped — run spyglass embed for hybrid search')
            } else {
                stepDone(
                    'Embeddings',
                    `${job.totalChunks} chunks embedded`,
                    job.embedMs ?? 0
                )
            }

            console.log(
                `\n${chalk.dim('─'.repeat(50))}\n` +
                `${chalk.green('✓')} Done in ${chalk.bold(formatDuration(Date.now() - startedAt))}\n`
            )

            console.log(
                `  ${chalk.bold(String(job.totalChunks))} chunks ` +
                `from ${chalk.bold(String(job.processedFiles))} files`
            )

            if (job.parseMs) {
                console.log(chalk.dim(`  Parsing:     ${formatDuration(job.parseMs)}`))
            }
            if (job.graphMs) {
                console.log(chalk.dim(`  Graph:       ${formatDuration(job.graphMs)}`))
            }
            if (job.embedMs) {
                console.log(chalk.dim(`  Embedding:   ${formatDuration(job.embedMs)}`))
            }
            if (job.skippedFiles > 0) {
                console.log(chalk.dim(`  Skipped:     ${job.skippedFiles} files unchanged`))
            }

        } else if (job.status === 'failed') {
            console.error(`\n${chalk.red('✗')} Indexing failed: ${job.errorMessage}\n`)
            process.exit(1)
        }

        console.log()
    })

function renderProgress(progress: IndexingProgress): string {
    const isEmbedding = progress.phase === 'embedding'
    const width = 25
    const filled = Math.floor(progress.percentComplete / 4)
    const bar =
        chalk.cyan('█'.repeat(filled)) +
        chalk.dim('░'.repeat(width - filled))
    const pct = String(progress.percentComplete).padStart(3)

    if (isEmbedding && progress.processedChunks !== undefined) {
        return `[${bar}] ${pct}%  ${progress.processedChunks}/${progress.totalChunksToEmbed ?? '?'} chunks`
    }

    return (
        `[${bar}] ${pct}%  ` +
        `${progress.processedFiles}/${progress.totalFiles} files  ` +
        chalk.dim(`${progress.totalChunks} chunks`)
    )
}