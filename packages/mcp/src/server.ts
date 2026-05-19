import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'
import type { ToolRegistry } from './registry/tool-registry'

export class PathseekrMcpServer {
  private readonly server: Server

  constructor(private readonly registry: ToolRegistry) {
    this.server = new Server(
      { name: 'pathseekr', version: '0.1.0' },
      { capabilities: { tools: {} } }
    )

    this.registerHandlers()
  }

  async start(): Promise<void> {
    const transport = new StdioServerTransport()
    await this.server.connect(transport)
  }

  private registerHandlers(): void {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: this.registry.listDefinitions(),
    }))

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params
      const tool = this.registry.get(name)

      if (!tool) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Unknown tool: ${name}`,
            },
          ],
          isError: true,
        }
      }

      const text = await tool.execute((args ?? {}) as Record<string, unknown>)

      return {
        content: [
          {
            type: 'text' as const,
            text,
          },
        ],
      }
    })
  }
}