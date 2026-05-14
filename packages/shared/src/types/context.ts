export interface Contexte {
  readonly name: string
  readonly description?: string
  readonly paths: string[]
  readonly database: string
  readonly createdAt: string
  readonly updatedAt: string
}

export interface ContexteStore {
  readonly activeContexte?: string
  readonly contextes: Record<string, Contexte>
}