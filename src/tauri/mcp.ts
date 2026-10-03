import { invoke } from '@tauri-apps/api/core'
import type { McpMode } from '../types/workspace'

export interface McpBridgeInfo {
  port: number
  token: string
  workspacePath: string
}

/**
 * Brings the loopback MCP bridge in line with the workspace's configured mode.
 * Returns the bridge's connection info while it is listening, or null once the
 * mode is `off` and the listener has been torn down.
 */
export function applyMcpMode(workspacePath: string, mode: McpMode): Promise<McpBridgeInfo | null> {
  return invoke<McpBridgeInfo | null>('apply_mcp_mode', { workspacePath, mode })
}

export function getMcpBridgeInfo(): Promise<McpBridgeInfo | null> {
  return invoke<McpBridgeInfo | null>('get_mcp_bridge_info')
}

export type McpAgent = 'codex' | 'claudeCode'

export interface McpAgentStatus {
  kind: 'notConfigured' | 'connected' | 'needsReconnect' | 'conflict' | 'error'
  message: string | null
}

export interface McpAgentStatuses {
  codex: McpAgentStatus
  claudeCode: McpAgentStatus
}

export function getMcpAgentStatus(): Promise<McpAgentStatuses> {
  return invoke<McpAgentStatuses>('get_mcp_agent_status')
}

export function connectMcpAgent(agent: McpAgent, replaceConflict = false): Promise<McpAgentStatus> {
  return invoke<McpAgentStatus>('connect_mcp_agent', { agent, replaceConflict })
}

export function disconnectMcpAgent(agent: McpAgent): Promise<McpAgentStatus> {
  return invoke<McpAgentStatus>('disconnect_mcp_agent', { agent })
}

export function stopMcpBridge(): Promise<void> {
  return invoke<void>('stop_mcp_bridge')
}

/**
 * Answers an `mcp-bridge-request` event. Exactly one of `result`/`error` is
 * meaningful; the bridge keeps the agent's request open until this arrives.
 */
export function respondToMcpRequest(
  requestId: string,
  result: unknown,
  error: string | null,
): Promise<void> {
  return invoke<void>('mcp_respond', { requestId, result, error })
}
