import path from 'path'
import os from 'os'
import type { PathseekrConfig } from '@pathseekr/shared'
import { WorkspaceManager } from '@pathseekr/core'

/**
 * Resolves the database path for a given CLI invocation.
 *
 * Resolution order:
 *   1. Explicit --workspace <name> flag → workspace database
 *   2. Active workspace (set via `seek workspace use`) → workspace database
 *   3. No workspace → default ~/.pathseekr/pathseekr.db
 *
 * This function is the single point of resolution for all CLI commands,
 * ensuring consistent behaviour across index, search, status, and embed.
 */
export function resolveDbPath(
  workspaceName: string | undefined,
  config: PathseekrConfig
): string {
  const manager = new WorkspaceManager(config.storage.dataDir)

  if (workspaceName) {
    return resolveNamedWorkspace(manager, workspaceName)
  }

  return resolveActiveOrDefault(manager, config)
}

/**
 * Returns workspace info string shown at the top of command output.
 * Helps the user know which database they are operating against.
 */
export function workspaceLabel(
  workspaceName: string | undefined,
  config: PathseekrConfig
): string {
  const manager = new WorkspaceManager(config.storage.dataDir)

  if (workspaceName) {
    const workspace = manager.get(workspaceName)
    return workspace ? `workspace: ${workspace.name}` : `workspace: ${workspaceName}`
  }

  const active = manager.getActive()
  if (active) {
    return `workspace: ${active.name} (active)`
  }

  return 'default database'
}

function resolveNamedWorkspace(manager: WorkspaceManager, name: string): string {
  const workspace = manager.get(name)

  if (!workspace) {
    throw new Error(
      `Workspace "${name}" not found.\n` +
      `  Run: seek workspace list`
    )
  }

  return workspace.database
}

function resolveActiveOrDefault(
  manager: WorkspaceManager,
  config: PathseekrConfig
): string {
  const active = manager.getActive()

  if (active) {
    return active.database
  }

  return resolveDefaultDbPath(config)
}

function resolveDefaultDbPath(config: PathseekrConfig): string {
  const dataDir = config.storage.dataDir

  const resolvedDir = dataDir.startsWith('~')
    ? path.join(os.homedir(), dataDir.slice(1))
    : dataDir

  return path.join(resolvedDir, 'pathseekr.db')
}