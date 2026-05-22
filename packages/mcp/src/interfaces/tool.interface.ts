export interface ITool {
  readonly name: string
  readonly description: string
  readonly inputSchema: Record<string, unknown>
  execute(args: Record<string, unknown>): Promise<string>
}