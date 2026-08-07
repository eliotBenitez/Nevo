import { watch, onUnmounted } from 'vue'
import { storeToRefs } from 'pinia'
import { useWorkspaceStore } from '../../stores/workspace'
import { applyMcpMode, stopMcpBridge } from '../../tauri/mcp'
import type { McpMode } from '../../types/workspace'
import { appLogger } from '../../utils/logger'

function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

/**
 * Keeps the loopback MCP bridge in sync with the active workspace and its
 * configured access mode.
 *
 * The bridge reads workspace files directly, so it only runs for local
 * workspaces — a cloud workspace has no filesystem path to serve. Switching
 * workspaces or setting the mode to `off` tears the listener down, which also
 * removes the endpoint file an agent would otherwise keep using.
 */
export function useMcpBridge(): void {
  const workspaceStore = useWorkspaceStore()
  const { activePath, settings } = storeToRefs(workspaceStore)

  async function sync(path: string | null, mode: McpMode): Promise<void> {
    if (!isTauriRuntime()) return
    try {
      if (path && mode !== 'off') {
        await applyMcpMode(path, mode)
      } else {
        await stopMcpBridge()
      }
    } catch (error) {
      await appLogger.error({
        source: 'frontend.mcp',
        event: 'apply_mcp_mode',
        message: 'Failed to apply MCP bridge mode',
        workspacePath: path ?? undefined,
        error,
      })
    }
  }

  watch(
    [activePath, () => settings.value.mcp.mode],
    ([path, mode]) => { void sync(path, mode) },
    { immediate: true },
  )

  onUnmounted(() => {
    if (!isTauriRuntime()) return
    void stopMcpBridge().catch(() => {})
  })
}
