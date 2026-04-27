import { Command } from 'commander'
import chalk from 'chalk'
import { createContainer, TYPES } from '@spyglass/core'
import type { IDocumentRepository } from '@spyglass/core'
import { config } from '../config'
import { renderStatsTable, renderLanguageTable } from '../ui/table'

export const statusCommand = new Command('status')
    .description('Show indexing statistics for the current project')
    .action(async () => {
        const container = createContainer(config)
        const documentRepository =
            container.get<IDocumentRepository>(
                TYPES.IDocumentRepository
            )

        const stats = await documentRepository.getStats()

        console.log(`\n${chalk.bold('Spyglass')} ${chalk.dim('— index status')}\n`)

        if (stats.totalDocuments === 0) {
            console.log(chalk.dim('  No files indexed yet. Run: spyglass index <path>\n'))
            return
        }

        console.log(
            renderStatsTable([
                ['Documents', stats.totalDocuments],
                ['Chunks', stats.totalChunks],
                ['Embeddings', stats.totalEmbeddings],
                ['Database size', formatBytes(stats.databaseSizeBytes)],
                ['Last indexed', stats.lastIndexedAt ? stats.lastIndexedAt.toLocaleString() : 'never'],
            ])
        )

        if (Object.keys(stats.byLanguage).length > 0) {
            console.log(`\n${chalk.dim('By language:')}\n`)
            console.log(renderLanguageTable(stats.byLanguage))
        }

        console.log()
    })

function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / 1048576).toFixed(1)} MB`
}
