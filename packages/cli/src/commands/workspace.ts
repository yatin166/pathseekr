import { Command } from 'commander'
import chalk from 'chalk'
import { WorkspaceManager } from '@pathseekr/core'
import type { Workspace } from '@pathseekr/shared'
import { config } from '../config'


function getManager(): WorkspaceManager {
  return new WorkspaceManager(config.storage.dataDir)
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

function printWorkspaceDetail(workspace: Workspace, isActive: boolean): void {
  const activeTag = isActive ? chalk.green(' ✓ active') : ''

  console.log(`\n  ${chalk.bold(workspace.name)}${activeTag}`)

  if (workspace.description) {
    console.log(`  ${chalk.dim(workspace.description)}`)
  }

  console.log()
  console.log(`  ${chalk.dim('Database')}  ${workspace.database}`)
  console.log(`  ${chalk.dim('Created')}   ${formatDate(workspace.createdAt)}`)
  console.log(`  ${chalk.dim('Updated')}   ${formatDate(workspace.updatedAt)}`)

  if (workspace.paths.length === 0) {
    console.log(`\n  ${chalk.dim('No paths registered. Run: seek workspace add <name> <path>')}`)
  } else {
    console.log(`\n  ${chalk.dim('Paths')} (${workspace.paths.length}):`)
    for (const p of workspace.paths) {
      console.log(`    ${chalk.cyan('→')} ${p}`)
    }
  }
}

const createCommand = new Command('create')
  .description('Create a new workspace')
  .argument('<name>', 'Workspace name (lowercase, letters, numbers, _ and - only)')
  .option('-d, --description <text>', 'Optional description')
  .action((name: string, options) => {
    try {
      const manager = getManager()
      const workspace = manager.create(name, options.description as string | undefined)

      console.log(`\n${chalk.green('✓')} Workspace ${chalk.bold(name)} created\n`)
      console.log(`  ${chalk.dim('Database')}  ${workspace.database}`)
      console.log(`\n  Add paths to index:`)
      console.log(`    ${chalk.cyan(`seek workspace add ${name} /path/to/project`)}\n`)
    } catch (err) {
      console.error(`\n${chalk.red('✗')} ${err instanceof Error ? err.message : String(err)}\n`)
      process.exit(1)
    }
  })

const listCommand = new Command('list')
  .description('List all workspaces')
  .action(() => {
    try {
      const manager = getManager()
      const workspaces = manager.list()
      const activeName = manager.getActiveWorkspaceName()

      if (workspaces.length === 0) {
        console.log(`\n${chalk.dim('No workspaces found. Run: seek workspace create <name>')}\n`)
        return
      }

      console.log(`\n${chalk.bold('Workspaces')}\n`)

      for (const workspace of workspaces) {
        const isActive = workspace.name === activeName
        const activeTag = isActive ? chalk.green(' ✓') : ''
        const pathCount = workspace.paths.length
        const pathLabel = pathCount === 1 ? '1 path' : `${pathCount} paths`

        console.log(
          `  ${chalk.bold(workspace.name)}${activeTag}` +
          `  ${chalk.dim(pathLabel)}` +
          (workspace.description ? `  ${chalk.dim('—')} ${chalk.dim(workspace.description)}` : '')
        )
      }

      console.log()
    } catch (err) {
      console.error(`\n${chalk.red('✗')} ${err instanceof Error ? err.message : String(err)}\n`)
      process.exit(1)
    }
  })

const infoCommand = new Command('info')
  .description('Show detailed information about a workspace')
  .argument('<name>', 'Workspace name')
  .action((name: string) => {
    try {
      const manager = getManager()
      const workspace = manager.get(name)

      if (!workspace) {
        console.error(`\n${chalk.red('✗')} Workspace "${name}" not found.\n`)
        process.exit(1)
        return
      }

      const activeName = manager.getActiveWorkspaceName()
      printWorkspaceDetail(workspace, workspace.name === activeName)
      console.log()
    } catch (err) {
      console.error(`\n${chalk.red('✗')} ${err instanceof Error ? err.message : String(err)}\n`)
      process.exit(1)
    }
  })

const useCommand = new Command('use')
  .description('Set the active workspace (used when --workspace is not specified)')
  .argument('<name>', 'Workspace name')
  .action((name: string) => {
    try {
      const manager = getManager()
      manager.setActive(name)

      console.log(`\n${chalk.green('✓')} Active workspace set to ${chalk.bold(name)}\n`)
      console.log(`  All commands will now use this workspace by default.`)
      console.log(`  Override with: ${chalk.cyan('seek <command> --workspace <other-name>')}\n`)
    } catch (err) {
      console.error(`\n${chalk.red('✗')} ${err instanceof Error ? err.message : String(err)}\n`)
      process.exit(1)
    }
  })

const deleteCommand = new Command('delete')
  .description('Delete a workspace (does not delete the indexed data)')
  .argument('<name>', 'Workspace name')
  .option('--confirm', 'Skip confirmation prompt')
  .action((name: string, options) => {
    try {
      const manager = getManager()
      const workspace = manager.get(name)

      if (!workspace) {
        console.error(`\n${chalk.red('✗')} Workspace "${name}" not found.\n`)
        process.exit(1)
        return
      }

      if (!options.confirm) {
        console.log(`\n${chalk.yellow('!')} This will remove the workspace definition.`)
        console.log(`  Database file is NOT deleted: ${workspace.database}`)
        console.log(`  Re-run with ${chalk.cyan('--confirm')} to proceed.\n`)
        return
      }

      manager.delete(name)
      console.log(`\n${chalk.green('✓')} Workspace ${chalk.bold(name)} deleted\n`)
    } catch (err) {
      console.error(`\n${chalk.red('✗')} ${err instanceof Error ? err.message : String(err)}\n`)
      process.exit(1)
    }
  })

const addCommand = new Command('add')
  .description('Add a source path to a workspace')
  .argument('<name>', 'Workspace name')
  .argument('<path>', 'Directory path to add')
  .action((name: string, sourcePath: string) => {
    try {
      const manager = getManager()
      const workspace = manager.addPath(name, sourcePath)

      console.log(`\n${chalk.green('✓')} Path added to workspace ${chalk.bold(name)}\n`)
      console.log(`  ${chalk.dim('Paths')} (${workspace.paths.length}):`)

      for (const p of workspace.paths) {
        console.log(`    ${chalk.cyan('→')} ${p}`)
      }

      console.log(`\n  Index this workspace:`)
      console.log(`    ${chalk.cyan(`seek index --workspace ${name}`)}\n`)
    } catch (err) {
      console.error(`\n${chalk.red('✗')} ${err instanceof Error ? err.message : String(err)}\n`)
      process.exit(1)
    }
  })

const removeCommand = new Command('remove')
  .description('Remove a source path from a workspace')
  .argument('<name>', 'Workspace name')
  .argument('<path>', 'Directory path to remove')
  .action((name: string, sourcePath: string) => {
    try {
      const manager = getManager()
      const workspace = manager.removePath(name, sourcePath)

      console.log(`\n${chalk.green('✓')} Path removed from workspace ${chalk.bold(name)}\n`)

      if (workspace.paths.length === 0) {
        console.log(`  ${chalk.dim('No paths remaining in this workspace.')}\n`)
      } else {
        console.log(`  ${chalk.dim('Remaining paths')} (${workspace.paths.length}):`)
        for (const p of workspace.paths) {
          console.log(`    ${chalk.cyan('→')} ${p}`)
        }
        console.log()
      }
    } catch (err) {
      console.error(`\n${chalk.red('✗')} ${err instanceof Error ? err.message : String(err)}\n`)
      process.exit(1)
    }
  })


export const workspaceCommand = new Command('workspace')
  .description('Manage workspaces for multi-project and monorepo indexing')
  .addCommand(createCommand)
  .addCommand(listCommand)
  .addCommand(infoCommand)
  .addCommand(useCommand)
  .addCommand(deleteCommand)
  .addCommand(addCommand)
  .addCommand(removeCommand)