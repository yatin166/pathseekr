import { Command } from 'commander'
import chalk from 'chalk'
import path from 'path'
import { createContainer, TYPES } from '@spyglass/core'
import type { IIndexer } from '@spyglass/core'
import type { IndexingProgress } from '@spyglass/shared'
import { config } from '../config'
import { formatDuration } from '../ui/progress'

const SKIP_REASON_LABELS: Record<string, string> = {
    ignored_extension: 'unsupported file type',
    hidden_file: 'hidden file',
    declaration_file: 'TypeScript declaration file (.d.ts)',
    too_large: 'file too large',
    empty_file: 'empty file',
    exclude_pattern: 'matches exclude pattern',
    stat_error: 'could not read file',
    unreadable_directory: 'unreadable directory',
}


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
        const startedAt = Date.now()

        let lastLine      = ''
        let currentStatus = ''
        let stepStartTime = Date.now()

        const clearProgress = (): void => {
            if (!lastLine) return
            process.stdout.write('\r' + ' '.repeat(lastLine.length) + '\r')
            lastLine = ''
        }

        const writeProgress = (line: string): void => {
            clearProgress()
            const prefixed = `    ${line}`
            process.stdout.write(prefixed)
            lastLine = prefixed
        }

        const stepStart = (label: string): void => {
            clearProgress()
            console.log(`  ${chalk.dim('◆')} ${chalk.dim(label)}`)
        }

        const stepDone = (label: string, detail: string, ms: number): void => {
            clearProgress()
            console.log(
                `  ${chalk.green('✓')} ` +
                `${chalk.bold(label.padEnd(18))} ` +
                `${detail.padEnd(30)} ` +
                chalk.dim(formatDuration(ms))
            )
        }

        const stepSkipped = (label: string, reason: string): void => {
            clearProgress()
            console.log(
                `  ${chalk.dim('–')} ` +
                `${chalk.dim(label.padEnd(18))} ` +
                chalk.dim(reason)
            )
        }

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
                    clearProgress()

                    switch (`${currentStatus}→${status}`) {

                        // Scan complete, parsing starting
                        case '→parsing':
                        case 'scanning→parsing':
                            stepDone(
                                'Scanning',
                                `${progress.totalFiles} files found`,
                                progress.scanMs ?? 0,
                            )
                            console.log()
                            stepStart('Parsing & BM25 index')
                            break

                        // Parse complete, graph starting
                        case 'parsing→graphing':
                            stepDone(
                                'Parsing & BM25',
                                `${progress.totalChunks} chunks indexed`,
                                Date.now() - stepStartTime,
                            )
                            console.log()
                            stepStart('Building graph')
                            break

                        // Graph complete, embedding starting
                        case 'graphing→embedding':
                            console.log()
                            stepStart('Generating embeddings')
                            break
                    }

                    currentStatus = status
                    stepStartTime = Date.now()
                }

                // Graph completion signal
                // The graph phase emits two events: one when it starts
                // (no graphMs) and one when it finishes (has graphMs).
                if (status === 'graphing' && progress.graphMs !== undefined) {
                    stepDone('Graph', 'edges resolved', progress.graphMs)
                }

                // In-progress bars
                if (status === 'parsing' && progress.totalFiles > 0) {
                    writeProgress(renderParsingProgress(progress))
                }

                if (status === 'embedding') {
                    writeProgress(renderEmbeddingProgress(progress))
                }
            }
        )

        clearProgress()

        // Post-job steps

        if (job.status === 'completed') {

            if (options.skipEmbedding) {
                console.log()
                stepSkipped('Embeddings', 'skipped — run spyglass embed for hybrid search')
            } else {
                stepDone(
                    'Embeddings',
                    `${job.totalChunks} chunks embedded`,
                    job.embedMs ?? 0,
                )
            }

            // ── Summary ────────────────────────────────────────────────
            console.log(
                `\n${chalk.dim('─'.repeat(50))}\n` +
                `${chalk.green('✓')} Done in ${chalk.bold(formatDuration(Date.now() - startedAt))}\n`
            )

            console.log(
                `  ${chalk.bold(String(job.totalChunks))} chunks ` +
                `from ${chalk.bold(String(job.processedFiles))} files`
            )

            // File status breakdown
            const statusParts = [
                job.newFiles     ? chalk.green(`${job.newFiles} new`)           : '',
                job.changedFiles ? chalk.yellow(`${job.changedFiles} changed`)   : '',
            ].filter(Boolean)

            if (statusParts.length > 0) {
                console.log(`  ${statusParts.join('  ')}`)
            }

            if ((job.unchangedFiles ?? 0) > 0) {
                console.log(chalk.dim(`  ${job.unchangedFiles} unchanged — skipped`))
            }

            // Files not indexed breakdown
            if (job.skippedFiles > 0 && job.skippedReasons) {
                console.log()
                console.log(chalk.dim(`  ${job.skippedFiles} files not indexed:`))

                const sorted = Object.entries(job.skippedReasons)
                    .sort(([, a], [, b]) => b - a)

                for (const [reason, count] of sorted) {
                    const label = SKIP_REASON_LABELS[reason] ?? reason
                    console.log(chalk.dim(`    ${String(count).padStart(4)}  ${label}`))
                }
            }

        } else if (job.status === 'failed') {
            console.error(`\n${chalk.red('✗')} Indexing failed: ${job.errorMessage}\n`)
            process.exit(1)
        }

        console.log()
    })

function renderBar(percent: number, width = 20): string {
    const filled = Math.min(width, Math.max(0, Math.floor(percent / (100 / width))))
    return chalk.cyan('█'.repeat(filled)) + chalk.dim('░'.repeat(width - filled))
}

function renderParsingProgress(progress: IndexingProgress): string {
    const bar = renderBar(progress.percentComplete)
    const pct = String(progress.percentComplete).padStart(3)

    const fileStat = `${progress.processedFiles}/${progress.totalFiles} files`

    const statusParts = [
        progress.newFiles ? chalk.green(`${progress.newFiles} new`)           : '',
        progress.changedFiles ? chalk.yellow(`${progress.changedFiles} changed`)   : '',
        progress.unchangedFiles ? chalk.dim(`${progress.unchangedFiles} unchanged`)  : '',
    ].filter(Boolean).join('  ')

    return `[${bar}] ${pct}%  ${fileStat}  ${statusParts}`
}

function renderEmbeddingProgress(progress: IndexingProgress): string {
    const bar = renderBar(progress.percentComplete)
    const pct = String(progress.percentComplete).padStart(3)

    const chunkStat = progress.processedChunks !== undefined
        ? `${progress.processedChunks}/${progress.totalChunksToEmbed ?? '?'} chunks`
        : `${progress.totalChunks} chunks`

    return `[${bar}] ${pct}%  ${chunkStat}`
}