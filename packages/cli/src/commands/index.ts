import { Command } from 'commander'
import chalk from 'chalk'
import path from 'path'
import { createContainer, TYPES, ContextManager } from '@pathseekr/core'
import type { IIndexer } from '@pathseekr/core'
import type { IndexingProgress } from '@pathseekr/shared'
import { config } from '../config'
import { resolveDbPath, contextLabel } from '../context'
import { formatDuration } from '../ui/progress'
import { formatBytes } from '../ui/format'

export const indexCommand = new Command('index')
  .description('Index a directory or all paths in a context')
  .argument('[path]', 'Path to index (optional when using a context)')
  .option('-w, --context <name>', 'Context to index into')
  .option('-f, --force', 'Force re-index even if files have not changed', false)
  .option('--skip-embedding', 'Skip embedding generation — only BM25 and graph search available', true)
  .action(async (inputPath: string | undefined, options) => {
    try {
      const contextName = options.context as string | undefined
      const dbPath = resolveDbPath(contextName, config)
      const label = contextLabel(contextName, config)

      // Resolve which paths to index
      const pathsToIndex = resolveIndexPaths(inputPath, contextName)

      console.log(
        `\n${chalk.bold('Pathseekr')} ${chalk.dim('—')} ` +
        `indexing ${chalk.dim(`[${label}]`)}\n`
      )

      const container = createContainer(config, dbPath)
      const indexer = container.get<IIndexer>(TYPES.IIndexer)

      for (const targetPath of pathsToIndex) {
        await runIndex(indexer, targetPath, options)
      }

    } catch (err) {
      console.error(`\n${chalk.red('✗')} ${err instanceof Error ? err.message : String(err)}\n`)
      process.exit(1)
    }
  })


function resolveIndexPaths(
  inputPath: string | undefined,
  contextName: string | undefined
): string[] {
  const manager = new ContextManager(config.storage.dataDir)

  if (inputPath) {
    const resolved = path.resolve(inputPath)

    // Determine which context to register the path in —
    // either the explicit --context flag or the active context
    const targetContextName = contextName ?? manager.getActive()?.name

    if (targetContextName) {
      const context = manager.get(targetContextName)

      if (!context) {
        throw new Error(
          `Context "${targetContextName}" not found.\n` +
          `  Run: seek context list`
        )
      }

      if (!context.paths.includes(resolved)) {
        manager.addPath(targetContextName, resolved)
      }
    }

    return [resolved]
  }

  if (contextName) {
    const context = manager.get(contextName)

    if (!context) {
      throw new Error(
        `Context "${contextName}" not found.\n` +
        `  Run: seek context list`
      )
    }

    if (context.paths.length === 0) {
      throw new Error(
        `Context "${contextName}" has no paths registered.\n` +
        `  Add a path: seek context add ${contextName} /path/to/project`
      )
    }

    return context.paths
  }

  const active = manager.getActive()

  if (active) {
    if (active.paths.length === 0) {
      throw new Error(
        `Active context "${active.name}" has no paths registered.\n` +
        `  Add a path: seek context add ${active.name} /path/to/project`
      )
    }

    return active.paths
  }

  throw new Error(
    'No path provided and no context selected.\n\n' +
    '  Index a specific path:   seek index /path/to/project --context <name>\n' +
    '  Or set active context: seek context use <name>'
  )
}

async function runIndex(
  indexer: IIndexer,
  targetPath: string,
  options: Record<string, unknown>
): Promise<void> {
  const absolutePath = path.resolve(targetPath)
  const startedAt = Date.now()

  console.log(`  ${chalk.dim('→')} ${absolutePath}\n`)

  let lastLine = ''
  let currentStatus = ''
  let stepStartTime = Date.now()

  const clearProgress = (): void => {
    if (!lastLine) {
      return
    }
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
          case '→parsing':
          case 'scanning→parsing':
            stepDone('Scanning', `${progress.totalFiles} files found`, progress.scanMs ?? 0)
            console.log()
            stepStart('Parsing & BM25 index')
            break

          case 'parsing→graphing':
            stepDone(
              'Parsing & BM25',
              `${progress.totalChunks} chunks indexed`,
              Date.now() - stepStartTime
            )
            console.log()
            stepStart('Building graph')
            break

          case 'graphing→embedding':
            console.log()
            stepStart('Generating embeddings')
            break
        }

        currentStatus = status
        stepStartTime = Date.now()
      }

      if (status === 'graphing' && progress.graphMs !== undefined) {
        stepDone('Graph', 'edges resolved', progress.graphMs)
      }

      if (status === 'parsing' && progress.totalFiles > 0) {
        writeProgress(renderParsingProgress(progress))
      }

      if (status === 'embedding') {
        writeProgress(renderEmbeddingProgress(progress))
      }
    }
  )

  clearProgress()

  if (job.status === 'completed') {
    if (options.skipEmbedding && job.graphMs !== undefined) {
      stepDone('Graph', 'edges resolved', job.graphMs)
    }

    if (options.skipEmbedding) {
      console.log()
      stepSkipped('Embeddings', 'skipped — run seek embed for hybrid search')
    } else {
      stepDone('Embeddings', `${job.totalChunks} chunks embedded`, job.embedMs ?? 0)
    }

    console.log(
      `\n${chalk.dim('─'.repeat(50))}\n` +
      `${chalk.green('✓')} Done in ${chalk.bold(formatDuration(Date.now() - startedAt))}\n`
    )

    console.log(
      `  ${chalk.bold(String(job.totalChunks))} chunks ` +
      `from ${chalk.bold(String(job.processedFiles))} files`
    )

    const statusParts = [
      job.newFiles ? chalk.green(`${job.newFiles} new`) : '',
      job.changedFiles ? chalk.yellow(`${job.changedFiles} changed`) : '',
    ].filter(Boolean)

    if (statusParts.length > 0) {
      console.log(`  ${statusParts.join('  ')}`)
    }

    if ((job.unchangedFiles ?? 0) > 0) {
      console.log(chalk.dim(`  ${job.unchangedFiles} unchanged — skipped`))
    }

    console.log()

    if (job.parseMs) {
      console.log(chalk.dim(`  Parsing:     ${formatDuration(job.parseMs)}`))
    }

    if (job.graphMs) {
      console.log(chalk.dim(`  Graph:       ${formatDuration(job.graphMs)}`))
    }

    if (job.embedMs) {
      console.log(chalk.dim(`  Embedding:   ${formatDuration(job.embedMs)}`))
    }

    if (job.skippedFiles > 0 && job.skippedReasons) {
      const reasons = job.skippedReasons
      const extensions = job.skippedExtensions ?? []
      const directories = job.skippedDirectories ?? []

      console.log()
      console.log(chalk.dim(`  ${job.skippedFiles} files not indexed:`))

      const extensionCount = (reasons['ignored_extension'] ?? 0) + (reasons['declaration_file'] ?? 0)
      if (extensionCount > 0) {
        console.log(chalk.dim(
          `  ${String(extensionCount).padStart(6)}  excluded by default     ${formatList(extensions, 8)}`
        ))
      }

      if (reasons['hidden_file']) {
        console.log(chalk.dim(`  ${String(reasons['hidden_file']).padStart(6)}  hidden files`))
      }

      if (reasons['no_parser']) {
        const extList = formatList(job.unparsableExtensions ?? [], 8)
        console.log(chalk.dim(
          `  ${String(reasons['no_parser']).padStart(6)}  unsupported language    ${extList}`
        ))
      }

      if (reasons['too_large']) {
        console.log(chalk.dim(
          `  ${String(reasons['too_large']).padStart(6)}  too large               max ${formatBytes(config.indexing.maxFileSizeBytes)}`
        ))
      }

      if (reasons['empty_file']) {
        console.log(chalk.dim(`  ${String(reasons['empty_file']).padStart(6)}  empty files`))
      }

      if (reasons['exclude_pattern']) {
        console.log(chalk.dim(`  ${String(reasons['exclude_pattern']).padStart(6)}  matched exclude pattern`))
      }

      // Directories are not files — shown separately so the counts above add up correctly
      if (reasons['ignored_directory'] && directories.length > 0) {
        console.log()
        console.log(chalk.dim(
          `  ${reasons['ignored_directory']} directories skipped    ${formatList(directories, 6)}`
        ))
      }
    }

  } else if (job.status === 'failed') {
    console.error(`\n${chalk.red('✗')} Indexing failed: ${job.errorMessage}\n`)
    process.exit(1)
  }

  console.log()
}

function renderBar(percent: number, width = 20): string {
  const filled = Math.min(width, Math.max(0, Math.floor(percent / (100 / width))))
  return chalk.cyan('█'.repeat(filled)) + chalk.dim('░'.repeat(width - filled))
}

function renderParsingProgress(progress: IndexingProgress): string {
  const bar = renderBar(progress.percentComplete)
  const pct = String(progress.percentComplete).padStart(3)
  const fileStat = `${progress.processedFiles}/${progress.totalFiles} files`

  const statusParts = [
    progress.newFiles ? chalk.green(`${progress.newFiles} new`) : '',
    progress.changedFiles ? chalk.yellow(`${progress.changedFiles} changed`) : '',
    progress.unchangedFiles ? chalk.dim(`${progress.unchangedFiles} unchanged`) : '',
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

function formatList(items: string[], max: number): string {
  if (items.length === 0) {
    return ''
  }

  const visible = items.slice(0, max)
  const rest = items.length - visible.length
  const base = visible.join(' ')

  if (rest > 0) {
    return chalk.dim(`${base} (+${rest} more)`)
  }

  return chalk.dim(base)
}