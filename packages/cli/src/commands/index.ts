import { Command } from 'commander'
import chalk from 'chalk'
import path from 'path'
import { createContainer, TYPES, WorkspaceManager } from '@pathseekr/core'
import type { IIndexer } from '@pathseekr/core'
import type { IndexingProgress } from '@pathseekr/shared'
import { config } from '../config'
import { resolveDbPath, workspaceLabel } from '../workspace'
import { formatDuration } from '../ui/progress'

export const indexCommand = new Command('index')
  .description('Index a directory or all paths in a workspace')
  .argument('[path]', 'Path to index (optional when using a workspace)')
  .option('-w, --workspace <name>', 'Workspace to index into')
  .option('-f, --force', 'Force re-index even if files have not changed', false)
  .option('--skip-embedding', 'Skip embedding generation — only BM25 and graph search available', true)
  .action(async (inputPath: string | undefined, options) => {
    try {
      const workspaceName = options.workspace as string | undefined
      const dbPath = resolveDbPath(workspaceName, config)
      const label = workspaceLabel(workspaceName, config)

      // Resolve which paths to index
      const pathsToIndex = resolveIndexPaths(inputPath, workspaceName)

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
  workspaceName: string | undefined
): string[] {
  // Explicit path always takes precedence
  if (inputPath) {
    return [path.resolve(inputPath)]
  }

  // Workspace with registered paths — index all of them
  if (workspaceName) {
    const manager = new WorkspaceManager(config.storage.dataDir)
    const workspace = manager.get(workspaceName)

    if (!workspace) {
      throw new Error(`Workspace "${workspaceName}" not found. Run: seek workspace list`)
    }

    if (workspace.paths.length === 0) {
      throw new Error(
        `Workspace "${workspaceName}" has no paths registered.\n` +
        `  Add a path first: seek workspace add ${workspaceName} /path/to/project`
      )
    }

    return workspace.paths
  }

  // Active workspace
  const manager = new WorkspaceManager(config.storage.dataDir)
  const active = manager.getActive()

  if (active) {
    if (active.paths.length === 0) {
      throw new Error(
        `Active workspace "${active.name}" has no paths registered.\n` +
        `  Add a path first: seek workspace add ${active.name} /path/to/project`
      )
    }

    return active.paths
  }

  throw new Error(
    'No path provided and no active workspace set.\n' +
    '  Provide a path:          seek index /path/to/project\n' +
    '  Or create a workspace:   seek workspace create my_project'
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
      const sorted = Object.entries(job.skippedReasons).sort(([, a], [, b]) => b - a)
      console.log()
      console.log(chalk.dim(`  ${job.skippedFiles} files not indexed:`))

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