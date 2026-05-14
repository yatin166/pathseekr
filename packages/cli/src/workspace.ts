import type { PathseekrConfig } from '@pathseekr/shared'
import { WorkspaceManager } from '@pathseekr/core'

export function resolveDbPath(
  workspaceName: string | undefined,
  config: PathseekrConfig
): string {
  const manager = new WorkspaceManager(config.storage.dataDir)

  if (workspaceName) {
    const workspace = manager.get(workspaceName)

    if (!workspace) {
      throw new Error(
        `Workspace "${workspaceName}" not found.\n` +
        `  Run: seek workspace list`
      )
    }

    return workspace.database
  }

  const active = manager.getActive()

  if (active) {
    return active.database
  }

  throw new Error(
    'No workspace selected.\n\n' +
    '  Create a workspace:     seek workspace create <name>\n' +
    '  Set active workspace:   seek workspace use <name>\n' +
    '  Or specify explicitly:  seek <command> --workspace <name>'
  )
}

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

  return 'no workspace'
}
