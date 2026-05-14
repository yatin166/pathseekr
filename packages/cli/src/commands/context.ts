import { Command } from 'commander'
import chalk from 'chalk'
import { ContextManager } from '@pathseekr/core'
import type { Context } from '@pathseekr/shared'
import { config } from '../config'
import * as path from 'path'
import * as fs from 'node:fs'


function resolveProjectMapPath(dbPath: string): string {
  const dir = path.dirname(dbPath)
  const baseName = path.basename(dbPath, '.db')
  return path.join(dir, `${baseName}-project-map.txt`)
}

function getManager(): ContextManager {
  return new ContextManager(config.storage.dataDir)
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

function printContextDetail(context: Context, isActive: boolean): void {
  const activeTag = isActive ? chalk.green(' ✓ active') : ''

  console.log(`\n  ${chalk.bold(context.name)}${activeTag}`)

  if (context.description) {
    console.log(`  ${chalk.dim(context.description)}`)
  }

  console.log()
  console.log(`  ${chalk.dim('Database')}  ${context.database}`)
  console.log(`  ${chalk.dim('Created')}   ${formatDate(context.createdAt)}`)
  console.log(`  ${chalk.dim('Updated')}   ${formatDate(context.updatedAt)}`)

  if (context.paths.length === 0) {
    console.log(`\n  ${chalk.dim('No paths registered. Run: seek context add <name> <path>')}`)
  } else {
    console.log(`\n  ${chalk.dim('Paths')} (${context.paths.length}):`)
    for (const p of context.paths) {
      console.log(`    ${chalk.cyan('→')} ${p}`)
    }
  }
}

const createCommand = new Command('create')
  .description('Create a new context')
  .argument('<name>', 'Context name (lowercase, letters, numbers, _ and - only)')
  .option('-d, --description <text>', 'Optional description')
  .action((name: string, options) => {
    try {
      const manager = getManager()
      const context = manager.create(name, options.description as string | undefined)

      console.log(`\n${chalk.green('✓')} Context ${chalk.bold(name)} created\n`)
      console.log(`  ${chalk.dim('Database')}  ${context.database}`)
      console.log(`\n  Add paths to index:`)
      console.log(`    ${chalk.cyan(`seek context add ${name} /path/to/project`)}\n`)
    } catch (err) {
      console.error(`\n${chalk.red('✗')} ${err instanceof Error ? err.message : String(err)}\n`)
      process.exit(1)
    }
  })

const listCommand = new Command('list')
  .description('List all contexts')
  .action(() => {
    try {
      const manager = getManager()
      const contexts = manager.list()
      const activeName = manager.getActiveContextName()

      if (contexts.length === 0) {
        console.log(`\n${chalk.dim('No contexts found. Run: seek context create <name>')}\n`)
        return
      }

      console.log(`\n${chalk.bold('Contexts')}\n`)

      for (const context of contexts) {
        const isActive = context.name === activeName
        const activeTag = isActive ? chalk.green(' ✓') : ''
        const pathCount = context.paths.length
        const pathLabel = pathCount === 1 ? '1 path' : `${pathCount} paths`

        console.log(
          `  ${chalk.bold(context.name)}${activeTag}` +
          `  ${chalk.dim(pathLabel)}` +
          (context.description ? `  ${chalk.dim('—')} ${chalk.dim(context.description)}` : '')
        )
      }

      console.log()
    } catch (err) {
      console.error(`\n${chalk.red('✗')} ${err instanceof Error ? err.message : String(err)}\n`)
      process.exit(1)
    }
  })

const infoCommand = new Command('info')
  .description('Show detailed information about a context')
  .argument('<name>', 'Context name')
  .action((name: string) => {
    try {
      const manager = getManager()
      const context = manager.get(name)

      if (!context) {
        console.error(`\n${chalk.red('✗')} Context "${name}" not found.\n`)
        process.exit(1)
        return
      }

      const activeName = manager.getActiveContextName()
      printContextDetail(context, context.name === activeName)
      console.log()
    } catch (err) {
      console.error(`\n${chalk.red('✗')} ${err instanceof Error ? err.message : String(err)}\n`)
      process.exit(1)
    }
  })

const useCommand = new Command('use')
  .description('Set the active context (used when --context is not specified)')
  .argument('<name>', 'Context name')
  .action((name: string) => {
    try {
      const manager = getManager()
      manager.setActive(name)

      console.log(`\n${chalk.green('✓')} Active context set to ${chalk.bold(name)}\n`)
      console.log(`  All commands will now use this context by default.`)
      console.log(`  Override with: ${chalk.cyan('seek <command> --context <other-name>')}\n`)
    } catch (err) {
      console.error(`\n${chalk.red('✗')} ${err instanceof Error ? err.message : String(err)}\n`)
      process.exit(1)
    }
  })

const deleteCommand = new Command('delete')
  .description('Delete a context and all its indexed data')
  .argument('<name>', 'Context name')
  .option('--confirm', 'Skip confirmation prompt')
  .action((name: string, options) => {
    try {
      const manager = getManager()
      const context = manager.get(name)

      if (!context) {
        console.error(`\n${chalk.red('✗')} Context "${name}" not found.\n`)
        process.exit(1)
        return
      }

      if (!options.confirm) {
        console.log(`\n${chalk.yellow('!')} This will permanently delete:`)
        console.log(`    Database:    ${context.database}`)
        console.log(`    Project map: ${resolveProjectMapPath(context.database)}`)
        console.log(`\n  Re-run with ${chalk.cyan('--confirm')} to proceed.\n`)
        return
      }

      // Remove database file
      if (fs.existsSync(context.database)) {
        fs.unlinkSync(context.database)
      }

      // Remove project map file
      const projectMapPath = resolveProjectMapPath(context.database)
      if (fs.existsSync(projectMapPath)) {
        fs.unlinkSync(projectMapPath)
      }

      // Remove context entry from contexts.json
      manager.delete(name)

      console.log(`\n${chalk.green('✓')} Context ${chalk.bold(name)} and all its data deleted\n`)

    } catch (err) {
      console.error(`\n${chalk.red('✗')} ${err instanceof Error ? err.message : String(err)}\n`)
      process.exit(1)
    }
  })

const addCommand = new Command('add')
  .description('Add a source path to a context')
  .argument('<name>', 'Context name')
  .argument('<path>', 'Directory path to add')
  .action((name: string, sourcePath: string) => {
    try {
      const manager = getManager()
      const context = manager.addPath(name, sourcePath)

      console.log(`\n${chalk.green('✓')} Path added to context ${chalk.bold(name)}\n`)
      console.log(`  ${chalk.dim('Paths')} (${context.paths.length}):`)

      for (const p of context.paths) {
        console.log(`    ${chalk.cyan('→')} ${p}`)
      }

      console.log(`\n  Index this context:`)
      console.log(`    ${chalk.cyan(`seek index --context ${name}`)}\n`)
    } catch (err) {
      console.error(`\n${chalk.red('✗')} ${err instanceof Error ? err.message : String(err)}\n`)
      process.exit(1)
    }
  })

const removeCommand = new Command('remove')
  .description('Remove a source path from a context')
  .argument('<name>', 'Context name')
  .argument('<path>', 'Directory path to remove')
  .action((name: string, sourcePath: string) => {
    try {
      const manager = getManager()
      const context = manager.removePath(name, sourcePath)

      console.log(`\n${chalk.green('✓')} Path removed from context ${chalk.bold(name)}\n`)

      if (context.paths.length === 0) {
        console.log(`  ${chalk.dim('No paths remaining in this context.')}\n`)
      } else {
        console.log(`  ${chalk.dim('Remaining paths')} (${context.paths.length}):`)
        for (const p of context.paths) {
          console.log(`    ${chalk.cyan('→')} ${p}`)
        }
        console.log()
      }
    } catch (err) {
      console.error(`\n${chalk.red('✗')} ${err instanceof Error ? err.message : String(err)}\n`)
      process.exit(1)
    }
  })


export const contextCommand = new Command('context')
  .description('Manage contexts for multi-project and monorepo indexing')
  .addCommand(createCommand)
  .addCommand(listCommand)
  .addCommand(infoCommand)
  .addCommand(useCommand)
  .addCommand(deleteCommand)
  .addCommand(addCommand)
  .addCommand(removeCommand)