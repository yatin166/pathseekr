import fs from 'fs'
import path from 'path'
import os from 'os'
import type { Workspace, WorkspaceStore } from '@pathseekr/shared'

const WORKSPACES_FILE = 'workspaces.json'
const WORKSPACES_DIR = 'workspaces'
const WORKSPACE_NAME_PATTERN = /^[a-z0-9_-]+$/

/**
 * Manages workspace definitions stored in ~/.pathseekr/workspaces.json.
 *
 * A workspace is a named collection of source paths that share a single
 * database. This allows developers to index only the projects they care
 * about, and to maintain separate indexes for different teams or contexts.
 *
 * WorkspaceManager is a plain class, not an injectable service, because
 * it operates at a layer below the DI container — its output (the resolved
 * database path) is what the container uses to construct DatabaseConnection.
 */
export class WorkspaceManager {

  private readonly storeFile: string
  private readonly workspacesDir: string

  constructor(dataDir: string) {
    const resolved = this.resolveDir(dataDir)
    this.storeFile = path.join(resolved, WORKSPACES_FILE)
    this.workspacesDir = path.join(resolved, WORKSPACES_DIR)
  }

  create(name: string, description?: string): Workspace {
    this.validateName(name)

    const store = this.readStore()

    if (store.workspaces[name]) {
      throw new Error(`Workspace "${name}" already exists. Use a different name or delete the existing one first.`)
    }

    const now = new Date().toISOString()
    const workspace: Workspace = {
      name,
      paths: [],
      database: path.join(this.workspacesDir, `${name}.db`),
      createdAt: now,
      updatedAt: now,
      ...(description !== undefined && { description }),
    }

    this.writeStore({
      ...store,
      workspaces: { ...store.workspaces, [name]: workspace },
    })

    return workspace
  }

  delete(name: string): void {
    const store = this.readStore()

    if (!store.workspaces[name]) {
      throw new Error(`Workspace "${name}" not found.`)
    }

    const { [name]: _removed, ...remaining } = store.workspaces

    this.writeStore({
      activeWorkspace: store.activeWorkspace === name
        ? undefined
        : store.activeWorkspace,
      workspaces: remaining,
    })
  }

  addPath(name: string, sourcePath: string): Workspace {
    const store = this.readStore()
    const workspace = this.requireWorkspace(store, name)
    const resolved = path.resolve(sourcePath)

    if (workspace.paths.includes(resolved)) {
      throw new Error(`Path "${resolved}" is already registered in workspace "${name}".`)
    }

    if (!fs.existsSync(resolved)) {
      throw new Error(`Path "${resolved}" does not exist.`)
    }

    const updated = this.updateWorkspace(workspace, {
      paths: [...workspace.paths, resolved],
    })

    this.writeStore({
      ...store,
      workspaces: { ...store.workspaces, [name]: updated },
    })

    return updated
  }

  removePath(name: string, sourcePath: string): Workspace {
    const store = this.readStore()
    const workspace = this.requireWorkspace(store, name)
    const resolved = path.resolve(sourcePath)

    if (!workspace.paths.includes(resolved)) {
      throw new Error(`Path "${resolved}" is not registered in workspace "${name}".`)
    }

    const updated = this.updateWorkspace(workspace, {
      paths: workspace.paths.filter((p) => p !== resolved),
    })

    this.writeStore({
      ...store,
      workspaces: { ...store.workspaces, [name]: updated },
    })

    return updated
  }

  setActive(name: string): void {
    const store = this.readStore()

    if (!store.workspaces[name]) {
      throw new Error(`Workspace "${name}" not found.`)
    }

    this.writeStore({ ...store, activeWorkspace: name })
  }

  clearActive(): void {
    const store = this.readStore()
    const { activeWorkspace: _removed, ...rest } = store
    this.writeStore({ ...rest, workspaces: store.workspaces })
  }

  get(name: string): Workspace | null {
    const store = this.readStore()
    return store.workspaces[name] ?? null
  }

  list(): Workspace[] {
    const store = this.readStore()
    return Object.values(store.workspaces).sort((a, b) =>
      a.name.localeCompare(b.name)
    )
  }

  getActive(): Workspace | null {
    const store = this.readStore()

    if (!store.activeWorkspace) {
      return null
    }

    return store.workspaces[store.activeWorkspace] ?? null
  }

  getActiveWorkspaceName(): string | undefined {
    return this.readStore().activeWorkspace
  }

  private readStore(): WorkspaceStore {
    this.ensureDirectories()

    if (!fs.existsSync(this.storeFile)) {
      return { workspaces: {} }
    }

    try {
      const content = fs.readFileSync(this.storeFile, 'utf-8')
      return JSON.parse(content) as WorkspaceStore
    } catch {
      return { workspaces: {} }
    }
  }

  private writeStore(store: WorkspaceStore): void {
    this.ensureDirectories()
    fs.writeFileSync(
      this.storeFile,
      JSON.stringify(store, null, 2),
      'utf-8'
    )
  }

  private ensureDirectories(): void {
    fs.mkdirSync(path.dirname(this.storeFile), { recursive: true })
    fs.mkdirSync(this.workspacesDir, { recursive: true })
  }

  private requireWorkspace(store: WorkspaceStore, name: string): Workspace {
    const workspace = store.workspaces[name]

    if (!workspace) {
      throw new Error(`Workspace "${name}" not found. Run: seek workspace list`)
    }

    return workspace
  }

  private updateWorkspace(
    workspace: Workspace,
    updates: Partial<Omit<Workspace, 'name' | 'database' | 'createdAt'>>
  ): Workspace {
    return {
      ...workspace,
      ...updates,
      updatedAt: new Date().toISOString(),
    }
  }

  private validateName(name: string): void {
    if (!name || name.trim() === '') {
      throw new Error('Workspace name cannot be empty.')
    }

    if (!WORKSPACE_NAME_PATTERN.test(name)) {
      throw new Error(
        `Workspace name "${name}" is invalid. ` +
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