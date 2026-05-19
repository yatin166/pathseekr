import type { ITool } from '../interfaces/tool.interface'

interface ToolDefinition {
  name: string
  description: string
  inputSchema: Record<string, unknown>
}

export class ToolRegistry {
  private readonly tools = new Map<string, ITool>()

  register(tool: ITool): this {
    this.tools.set(tool.name, tool)
    return this
  }

  get(name: string): ITool | undefined {
    return this.tools.get(name)
  }

  getAll(): ITool[] {
    return Array.from(this.tools.values())
  }

  listDefinitions(): ToolDefinition[] {
    return this.getAll().map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
    }))
  }
}