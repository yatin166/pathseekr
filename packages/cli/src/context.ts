import type { PathseekrConfig } from '@pathseekr/shared'
import { ContextManager } from '@pathseekr/core'

export function resolveDbPath(
  contextName: string | undefined,
  config: PathseekrConfig
): string {
  const manager = new ContextManager(config.storage.dataDir)

  if (contextName) {
    const context = manager.get(contextName)

    if (!context) {
      throw new Error(
        `Context "${contextName}" not found.\n` +
        `  Run: seek context list`
      )
    }

    return context.database
  }

  const active = manager.getActive()

  if (active) {
    return active.database
  }

  throw new Error(
    'No context selected.\n\n' +
    '  Create a context:     seek context create <name>\n' +
    '  Set active context:   seek context use <name>\n' +
    '  Or specify explicitly:  seek <command> --context <name>'
  )
}

export function contextLabel(
  contextName: string | undefined,
  config: PathseekrConfig
): string {
  const manager = new ContextManager(config.storage.dataDir)

  if (contextName) {
    const context = manager.get(contextName)
    return context ? `context: ${context.name}` : `context: ${contextName}`
  }

  const active = manager.getActive()

  if (active) {
    return `context: ${active.name} (active)`
  }

  return 'no context'
}
