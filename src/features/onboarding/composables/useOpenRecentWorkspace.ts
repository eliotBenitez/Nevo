import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useWorkspaceStore } from '../../../stores/workspace'
import { isWorkspaceSchemaTooNewError } from '../../../utils/workspaceSchemaError'

/**
 * Opens a recent workspace by path and surfaces the schema-too-new error the
 * same way `OpenWorkspaceView` does. Extracted so the Welcome screen's Recent
 * list can open a workspace directly without duplicating that error handling.
 */
export function useOpenRecentWorkspace(onOpened: () => void) {
  const { t } = useI18n()
  const workspaceStore = useWorkspaceStore()
  const openingId = ref<string | null>(null)

  async function alertDialog(message: string): Promise<void> {
    const isTauriRuntime = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
    if (!isTauriRuntime) {
      window.alert(message)
      return
    }
    try {
      const { message: showMessage } = await import('@tauri-apps/plugin-dialog')
      await showMessage(message)
    } catch {
      // The dialog plugin is unavailable; avoid calling Tauri's async window.alert shim.
    }
  }

  async function openRecent(id: string, path: string) {
    if (openingId.value) return
    openingId.value = id
    try {
      await workspaceStore.openWorkspace(path)
      onOpened()
    } catch (error) {
      if (isWorkspaceSchemaTooNewError(error)) {
        await alertDialog(t('workspace.errors.schemaTooNew'))
        return
      }
      throw error
    } finally {
      openingId.value = null
    }
  }

  return { openingId, openRecent }
}
