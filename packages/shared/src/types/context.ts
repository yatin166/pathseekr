export interface Context {
  readonly name: string
  readonly description?: string
  readonly paths: string[]
  readonly database: string
  readonly createdAt: string
  readonly updatedAt: string
}

export interface ContextStore {
  readonly activeContext?: string
  readonly contexts: Record<string, Context>
}