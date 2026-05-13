export interface Workspace {
  readonly name: string
  readonly description?: string
  readonly paths: string[]
  readonly database: string
  readonly createdAt: string
  readonly updatedAt: string
}

export interface WorkspaceStore {
  readonly activeWorkspace?: string
  readonly workspaces: Record<string, Workspace>
}