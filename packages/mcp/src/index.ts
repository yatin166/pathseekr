#!/usr/bin/env node

import 'reflect-metadata'
import { config } from './config'
import { ToolRegistry } from './registry/tool-registry'
import { MarkdownResultFormatter } from './formatters/result-formatter'
import { GetProjectMapTool } from './tools/get-project-map.tool'
import { SearchCodebaseTool } from './tools/search-codebase.tool'
import { FindSymbolTool } from './tools/find-symbol.tool'
import { GetFileContextTool } from './tools/get-file-context.tool'
import { PathseekrMcpServer } from './server'

function bootstrap(): PathseekrMcpServer {
  const formatter = new MarkdownResultFormatter()

  const registry = new ToolRegistry()
    .register(new GetProjectMapTool(config, formatter))
    .register(new SearchCodebaseTool(config, formatter))
    .register(new FindSymbolTool(config, formatter))
    .register(new GetFileContextTool(config, formatter))

  return new PathseekrMcpServer(registry)
}

bootstrap()
  .start()
  .catch((err) => {
    process.stderr.write(
      `Pathseekr MCP server error: ${err instanceof Error ? err.message : String(err)}\n`
    )
    process.exit(1)
  })