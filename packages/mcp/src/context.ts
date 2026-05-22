import { ContextManager } from '@pathseekr/core'
import type { PathseekrConfig } from '@pathseekr/shared'
import path from 'path'

export function resolveDbPath(
  contextName: string | undefined,
  config: PathseekrConfig
): string {
  const manager = new ContextManager(config.storage.dataDir)

  if (contextName) {
    const context = manager.get(contextName)

    if (!context) {
      throw new Error(
        `Context "${contextName}" not found. ` +
        `Run: seek context list`
      )
    }

    return context.database
  }

  const active = manager.getActive()

  if (active) {
    return active.database
  }

  throw new Error(
    'No context selected. ' +
    'Create one with: seek context create <name>'
  )
}

export function resolveProjectMapPath(dbPath: string): string {
  const dir = path.dirname(dbPath)
  const baseName = path.basename(dbPath, '.db')
  return path.join(dir, `${baseName}-project-map.txt`)
}