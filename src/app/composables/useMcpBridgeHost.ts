import { onMounted, onUnmounted } from 'vue'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import { useI18n } from 'vue-i18n'
import { respondToMcpRequest } from '../../tauri/mcp'
import { useConfirmDialog } from '../../ui/composables/useConfirmDialog'
import {
  applyEditorEdit,
  assertEditorFormatSupportsEdit,
  readEditorSnapshot,
  waitForActiveEditor,
  writeEditorMarkdown,
  type WriteMarkdownRequest,
} from './editor/mcpEditorOperations'
import { appLogger } from '../../utils/logger'
import { useWorkspaceStore } from '../../stores/workspace'
import { useNoteStore } from '../../stores/note'

interface McpBridgeRequest {
  requestId: string
  kind: string
  payload: Record<string, unknown>
}

export interface McpBridgeHostOptions {
  /** Opens a note through the shell's normal navigation, so tabs and the pending save flush behave as for a user click. */
  openNote: (noteId: string) => void
  /** Renames through the shell so an open note's pending title and the sidebar stay in sync. */
  renameNote: (noteId: string, title: string) => Promise<void>
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
export function useMcpBridgeHost(options: McpBridgeHostOptions): void {
  const { t } = useI18n()
  const { confirm } = useConfirmDialog()
  const workspaceStore = useWorkspaceStore()
  const noteStore = useNoteStore()
  let unlistenRequests: UnlistenFn | null = null
  let unlistenWorkspaceChanges: UnlistenFn | null = null
  let manifestRefreshQueue = Promise.resolve()

  async function route(request: McpBridgeRequest): Promise<unknown> {
    switch (request.kind) {
      case 'editor.snapshot':
        return readEditorSnapshot(request.payload.noteId as string | null)
      case 'editor.applyEdit': {
        assertEditorFormatSupportsEdit(noteStore.getActiveNoteFormat(request.payload.noteId as string))
        return applyEditorEdit({
          noteId: request.payload.noteId as string,
          revision: request.payload.revision as number,
          operations: request.payload.operations as unknown[],
        })
      }
      case 'editor.open': {
        const noteId = request.payload.noteId as string
        options.openNote(noteId)
        return waitForActiveEditor(noteId)
      }
      case 'editor.writeMarkdown': {
        const payload = request.payload as unknown as WriteMarkdownRequest
        assertEditorFormatSupportsEdit(noteStore.getActiveNoteFormat(payload.noteId))
        return writeEditorMarkdown(payload)
      }
      case 'notes.rename': {
        const { noteId, title } = request.payload as { noteId: string, title: string }
        await options.renameNote(noteId, title)
        return { noteId, title }
      }
      case 'history.restore': {
        const { noteId, snapshotId } = request.payload as { noteId: string, snapshotId: string }
        const result = await noteStore.restoreSnapshot(noteId, snapshotId)
        return { noteId, recoverySnapshotId: result.recoverySnapshotId, warnings: result.warnings }
      }
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
