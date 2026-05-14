import fs from 'fs'
import path from 'path'
import os from 'os'
import type { Context, ContextStore } from '@pathseekr/shared'

const CONTEXTS_FILE = 'contexts.json'
const CONTEXTS_DIR = 'contexts'
const CONTEXT_NAME_PATTERN = /^[a-z0-9_-]+$/

/**
 * Manages context definitions stored in ~/.pathseekr/contexts.json.
 *
 * A context is a named collection of source paths that share a single
 * database. This allows developers to index only the projects they care
 * about, and to maintain separate indexes for different teams or contexts.
 *
 * ContextManager is a plain class, not an injectable service, because
 * it operates at a layer below the DI container — its output (the resolved
 * database path) is what the container uses to construct DatabaseConnection.
 */
export class ContextManager {

  private readonly storeFile: string
  private readonly contextsDir: string

  constructor(dataDir: string) {
    const resolved = this.resolveDir(dataDir)
    this.storeFile = path.join(resolved, CONTEXTS_FILE)
    this.contextsDir = path.join(resolved, CONTEXTS_DIR)
  }

  create(name: string, description?: string): Context {
    this.validateName(name)

    const store = this.readStore()

    if (store.contexts[name]) {
      throw new Error(`Context "${name}" already exists. Use a different name or delete the existing one first.`)
    }

    const now = new Date().toISOString()
    const context: Context = {
      name,
      paths: [],
      database: path.join(this.contextsDir, `${name}.db`),
      createdAt: now,
      updatedAt: now,
      ...(description !== undefined && { description }),
    }

    this.writeStore({
      ...store,
      contexts: { ...store.contexts, [name]: context },
    })

    return context
  }

  delete(name: string): void {
    const store = this.readStore()

    if (!store.contexts[name]) {
      throw new Error(`Context "${name}" not found.`)
    }

    const { [name]: _removed, ...remaining } = store.contexts

    this.writeStore({
      activeContext: store.activeContext === name
        ? undefined
        : store.activeContext,
      contexts: remaining,
    })
  }

  addPath(name: string, sourcePath: string): Context {
    const store = this.readStore()
    const context = this.requireContext(store, name)
    const resolved = path.resolve(sourcePath)

    if (context.paths.includes(resolved)) {
      throw new Error(`Path "${resolved}" is already registered in context "${name}".`)
    }

    if (!fs.existsSync(resolved)) {
      throw new Error(`Path "${resolved}" does not exist.`)
    }

    const updated = this.updateContext(context, {
      paths: [...context.paths, resolved],
    })

    this.writeStore({
      ...store,
      contexts: { ...store.contexts, [name]: updated },
    })

    return updated
  }

  removePath(name: string, sourcePath: string): Context {
    const store = this.readStore()
    const context = this.requireContext(store, name)
    const resolved = path.resolve(sourcePath)

    if (!context.paths.includes(resolved)) {
      throw new Error(`Path "${resolved}" is not registered in context "${name}".`)
    }

    const updated = this.updateContext(context, {
      paths: context.paths.filter((p) => p !== resolved),
    })

    this.writeStore({
      ...store,
      contexts: { ...store.contexts, [name]: updated },
    })

    return updated
  }

  setActive(name: string): void {
    const store = this.readStore()

    if (!store.contexts[name]) {
      throw new Error(`Context "${name}" not found.`)
    }

    this.writeStore({ ...store, activeContext: name })
  }

  clearActive(): void {
    const store = this.readStore()
    const { activeContext: _removed, ...rest } = store
    this.writeStore({ ...rest, contexts: store.contexts })
  }

  get(name: string): Context | null {
    const store = this.readStore()
    return store.contexts[name] ?? null
  }

  list(): Context[] {
    const store = this.readStore()
    return Object.values(store.contexts).sort((a, b) =>
      a.name.localeCompare(b.name)
    )
  }

  getActive(): Context | null {
    const store = this.readStore()

    if (!store.activeContext) {
      return null
    }

    return store.contexts[store.activeContext] ?? null
  }

  getActiveContextName(): string | undefined {
    return this.readStore().activeContext
  }

  private readStore(): ContextStore {
    this.ensureDirectories()

    if (!fs.existsSync(this.storeFile)) {
      return { contexts: {} }
    }

    try {
      const content = fs.readFileSync(this.storeFile, 'utf-8')
      return JSON.parse(content) as ContextStore
    } catch {
      return { contexts: {} }
    }
  }

  private writeStore(store: ContextStore): void {
    this.ensureDirectories()
    fs.writeFileSync(
      this.storeFile,
      JSON.stringify(store, null, 2),
      'utf-8'
    )
  }

  private ensureDirectories(): void {
    fs.mkdirSync(path.dirname(this.storeFile), { recursive: true })
    fs.mkdirSync(this.contextsDir, { recursive: true })
  }

  private requireContext(store: ContextStore, name: string): Context {
    const context = store.contexts[name]

    if (!context) {
      throw new Error(`Context "${name}" not found. Run: seek context list`)
    }

    return context
  }

  private updateContext(
    context: Context,
    updates: Partial<Omit<Context, 'name' | 'database' | 'createdAt'>>
  ): Context {
    return {
      ...context,
      ...updates,
      updatedAt: new Date().toISOString(),
    }
  }

  private validateName(name: string): void {
    if (!name || name.trim() === '') {
      throw new Error('Context name cannot be empty.')
    }

    if (!CONTEXT_NAME_PATTERN.test(name)) {
      throw new Error(
        `Context name "${name}" is invalid. ` +
        `Use only lowercase letters, numbers, underscores and hyphens.`
      )
    }
  }

  private resolveDir(dataDir: string): string {
    if (dataDir.startsWith('~')) {
      return path.join(os.homedir(), dataDir.slice(1))
    }

    return dataDir
  }
}