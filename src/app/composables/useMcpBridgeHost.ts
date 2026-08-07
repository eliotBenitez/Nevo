import { onMounted, onUnmounted } from 'vue'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import { useI18n } from 'vue-i18n'
import { respondToMcpRequest } from '../../tauri/mcp'
import { useConfirmDialog } from '../../ui/composables/useConfirmDialog'
import { applyEditorEdit, readEditorSnapshot } from './editor/mcpEditorOperations'
import { appLogger } from '../../utils/logger'
import { useWorkspaceStore } from '../../stores/workspace'

interface McpBridgeRequest {
  requestId: string
  kind: string
  payload: Record<string, unknown>
}

interface McpWorkspaceChangedEvent {
  method: string
  workspacePath: string
}

function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * Serves the requests the MCP bridge cannot answer from Rust: reading and
 * editing the live editor state, and asking the user to approve a write while
 * the bridge is in `ask` mode.
 */
export function useMcpBridgeHost(): void {
  const { t } = useI18n()
  const { confirm } = useConfirmDialog()
  const workspaceStore = useWorkspaceStore()
  let unlistenRequests: UnlistenFn | null = null
  let unlistenWorkspaceChanges: UnlistenFn | null = null
  let manifestRefreshQueue = Promise.resolve()

  async function route(request: McpBridgeRequest): Promise<unknown> {
    switch (request.kind) {
      case 'editor.snapshot':
        return readEditorSnapshot(request.payload.noteId as string | null)
      case 'editor.applyEdit':
        return applyEditorEdit({
          noteId: request.payload.noteId as string,
          revision: request.payload.revision as number,
          operations: request.payload.operations as unknown[],
        })
      case 'confirm': {
        const approved = await confirm({
          title: t('mcp.confirm.title'),
          message: t('mcp.confirm.message', { method: String(request.payload.method ?? '') }),
          confirmLabel: t('mcp.confirm.allow'),
          cancelLabel: t('mcp.confirm.deny'),
          variant: 'danger',
        })
        return { approved }
      }
      default:
        throw new Error(`Unsupported MCP bridge request: ${request.kind}`)
    }
  }

  async function handle(request: McpBridgeRequest): Promise<void> {
    try {
      const result = await route(request)
      await respondToMcpRequest(request.requestId, result ?? null, null)
    } catch (error) {
      // Always reply, even on failure: the bridge holds the agent's HTTP
      // request open until it hears back or times out.
      await respondToMcpRequest(request.requestId, null, errorMessage(error)).catch(() => {})
      await appLogger.warn({
        source: 'frontend.mcp',
        event: request.kind,
        message: 'MCP bridge request failed',
        error,
      })
    }
  }

  onMounted(async () => {
    if (!isTauriRuntime()) return
    unlistenRequests = await listen<McpBridgeRequest>('mcp-bridge-request', ({ payload }) => {
      void handle(payload)
    })
    unlistenWorkspaceChanges = await listen<McpWorkspaceChangedEvent>('mcp-workspace-changed', ({ payload }) => {
      if (payload.workspacePath !== workspaceStore.activePath) return
      // Structural MCP calls are serialized by most clients, but Tauri events
      // are independent. Queue refreshes so an older manifest read can never
      // overwrite the result of a newer create/move/delete.
      manifestRefreshQueue = manifestRefreshQueue
        .then(() => workspaceStore.refreshManifest())
        .catch(async error => {
          await appLogger.warn({
            source: 'frontend.mcp',
            event: 'refresh_manifest',
            message: 'Could not refresh the note tree after an MCP change',
            error,
          })
        })
    })
  })

  onUnmounted(() => {
    unlistenRequests?.()
    unlistenWorkspaceChanges?.()
    unlistenRequests = null
    unlistenWorkspaceChanges = null
  })
}
