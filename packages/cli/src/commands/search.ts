import { Command } from 'commander'
import chalk from 'chalk'
import path from 'path'
import {createContainer, IRetriever, TYPES} from '@spyglass/core'
import { config } from '../config'

export const searchCommand = new Command('search')
    .description('Search your indexed codebase')
    .argument('<query>', 'What to search for')
    .option(
        '-n, --limit <number>',
        'Number of results to return',
        '10'
    )
    .option(
        '-s, --strategy <strategy>',
        'Retrieval strategy: bm25, vector',
        'bm25'
    )
    .action(async (query: string, options) => {
        const limit = parseInt(options.limit as string, 10)
        const strategy = options.strategy as string

        console.log(`\n${chalk.bold('Spyglass')} ${chalk.dim('—')} searching for ${chalk.cyan(`"${query}"`)}\n`)

        const container = createContainer(config)
        const retriever = strategy === 'vector'
            ? container.get<IRetriever>(TYPES.VectorRetriever)
            : container.get<IRetriever>(TYPES.BM25Retriever)

        const ready = await retriever.isReady()
        if (!ready) {
            console.log(chalk.yellow('  No search index found. Run: spyglass index <path>\n'))
            return
        }

        const results = await retriever.search({
            query,
            strategy: 'bm25',
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