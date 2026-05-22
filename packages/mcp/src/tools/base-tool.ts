import type { PathseekrConfig } from '@pathseekr/shared'
import type { ITool } from '../interfaces/tool.interface'
import type { IResultFormatter } from '../interfaces/result-formatter.interface'
import { resolveDbPath } from '../context'

export abstract class BaseTool implements ITool {
  abstract readonly name: string
  abstract readonly description: string
  abstract readonly inputSchema: Record<string, unknown>

  constructor(
    protected readonly config: PathseekrConfig,
    protected readonly formatter: IResultFormatter
  ) {}

  abstract execute(args: Record<string, unknown>): Promise<string>

  protected resolveContext(contextName: string | undefined): { dbPath: string } | { error: string } {
    try {
      return { dbPath: resolveDbPath(contextName, this.config) }
    } catch (err) {
      return { error: this.formatError(err) }
    }
  }

  protected formatError(err: unknown): string {
    return err instanceof Error ? err.message : String(err)
  }

  protected getString(args: Record<string, unknown>, key: string): string | undefined {
    const value = args[key]
    return typeof value === 'string' ? value : undefined
  }

  protected getNumber(args: Record<string, unknown>, key: string): number | undefined {
    const value = args[key]
    return typeof value === 'number' ? value : undefined
  }
}