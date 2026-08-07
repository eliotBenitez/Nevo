#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'

import { BridgeError } from './client.js'
import { BridgeUnavailableError } from './endpoint.js'
import { ALL_TOOLS, runTool } from './tools/notes.js'

const SERVER_NAME = 'nevo'
const SERVER_VERSION = '0.1.0'

export function createServer(): Server {
  const server = new Server(
    { name: SERVER_NAME, version: SERVER_VERSION },
    { capabilities: { tools: {} } },
  )

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: ALL_TOOLS.map(tool => ({
      name: tool.name,
      title: tool.title,
      description: tool.description,
      inputSchema: tool.inputSchema,
    })),
  }))

  server.setRequestHandler(CallToolRequestSchema, async request => {
    const args = (request.params.arguments ?? {}) as Record<string, unknown>
    try {
      const result = await runTool(request.params.name, args)
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
      }
    } catch (error) {
      // Report failures as tool errors rather than protocol errors: the agent
      // can then read the reason (bridge off, note missing, read-only) and
      // adjust, instead of seeing the whole call fail opaquely.
      return {
        isError: true,
        content: [{ type: 'text' as const, text: describeError(error) }],
      }
    }
  })

  return server
}

function describeError(error: unknown): string {
  if (error instanceof BridgeUnavailableError) return error.message
  if (error instanceof BridgeError) return `${error.message} (${error.code})`
  return error instanceof Error ? error.message : String(error)
}

async function main(): Promise<void> {
  const server = createServer()
  await server.connect(new StdioServerTransport())
}

// Only run when executed directly, so the module stays importable from tests.
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error: unknown) => {
    // stdout carries the MCP protocol stream; diagnostics must go to stderr.
    process.stderr.write(`nevo-mcp-server failed to start: ${describeError(error)}\n`)
    process.exit(1)
  })
}
