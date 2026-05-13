import { Command } from 'commander'
import chalk from 'chalk'
import path from 'path'
import { createContainer, IRetriever, TYPES } from '@pathseekr/core'
import { config } from '../config'
import {RetrievalStrategy} from "@pathseekr/shared";

const getRetriever = (strategy: RetrievalStrategy): IRetriever => {
    const container = createContainer(config)
    switch (strategy) {
        case 'bm25':
            return container.get<IRetriever>(TYPES.BM25Retriever)
        case 'vector':
            return container.get<IRetriever>(TYPES.VectorRetriever)
        case 'hybrid':
            return container.get<IRetriever>(TYPES.HybridRetriever)
        case 'graph':
            return container.get<IRetriever>(TYPES.GraphRetriever)
        default:
            throw new Error(`Unknown retrieval strategy: ${strategy}`)
    }
}

export const searchCommand = new Command('search')
    .description('Search your indexed codebase')
    .argument('<query>', 'What to search for')
    .option(
        '-n, --limit <number>',
        'Number of results to return',
        '5'
    )
    .option(
        '-s, --strategy <strategy>',
        'Retrieval strategy: hybrid, bm25, vector, graph',
        'hybrid'
    )
    .action(async (query: string, options) => {
        const limit = parseInt(options.limit as string, 10)
        const strategy = options.strategy as RetrievalStrategy

        console.log(`\n${chalk.bold('Pathseekr')} ${chalk.dim('—')} searching for ${chalk.cyan(`"${query}"`)} using ${chalk.cyan(`"${strategy}"`)} strategy\n`)

        const retriever = getRetriever(strategy)

        const ready = await retriever.isReady()
        if (!ready) {
            console.log(chalk.yellow('  No search index found. Run: pathseekr index <path>\n'))
            return
        }

        const results = await retriever.search({
            query,
            strategy,
            limit,
        })

        if (results.length === 0) {
            console.log(chalk.dim(`  No results found for "${query}"\n`))
            return
        }

        console.log(chalk.dim(`  Found ${results.length} results\n`))

        for (const result of results) {
            const score = (result.score * 100).toFixed(0)
            const relativePath = path.relative(
                process.cwd(),
                result.document.sourcePath
            )

            console.log(
                `${chalk.bold(result.chunk.name)} ` +
                `${chalk.dim(`[${result.chunk.chunkType}]`)}`
            )
            console.log(
                `${chalk.dim(relativePath)} ` +
                `${chalk.dim(`lines ${result.chunk.startLine}–${result.chunk.endLine}`)} ` +
                `${chalk.cyan(`${score}% match`)}`
            )

            // Show first 3 lines as a preview
            const preview = result.chunk.content
                .split('\n')
                .slice(0, 3)
                .join('\n')
                .trim()

            console.log(chalk.dim(preview))
            console.log()
        }
    })