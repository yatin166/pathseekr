import chalk from 'chalk'
import ora, { type Ora } from 'ora'
import type { IndexingProgress } from '@pathseekr/shared'

export function createSpinner(text: string): Ora {
    return ora({
        text,
        color: 'cyan',
    })
}

export function renderProgressBar(progress: IndexingProgress): string {
    const width = 25
    const filled = Math.floor(
        (progress.percentComplete / 100) * width
    )
    const empty = width - filled

    const bar =
        chalk.cyan('█'.repeat(filled)) +
        chalk.dim('░'.repeat(empty))

    const percent = String(progress.percentComplete).padStart(3)
    const files =
        `${progress.processedFiles}/${progress.totalFiles}`.padEnd(
            10
        )
    const chunks = chalk.dim(
        `${progress.totalChunks} chunks`
    )

    return `  [${bar}] ${percent}%  ${files}  ${chunks}`
}

export function formatStatus(status: string): string {
    switch (status) {
        case 'completed':
            return chalk.green('✓ completed')
        case 'failed':
            return chalk.red('✗ failed')
        case 'scanning':
            return chalk.cyan('⟳ scanning')
        case 'parsing':
            return chalk.cyan('⟳ parsing')
        case 'embedding':
            return chalk.cyan('⟳ embedding')
        default:
            return chalk.dim(status)
    }
}

export function formatDuration(ms: number): string {
    if (ms < 1000) {
        return `${ms}ms`
    }
    if (ms < 60000) {
        return `${(ms / 1000).toFixed(1)}s`
    }
    const minutes = Math.floor(ms / 60000)
    const seconds = Math.floor((ms % 60000) / 1000)
    return `${minutes}m ${seconds}s`
}