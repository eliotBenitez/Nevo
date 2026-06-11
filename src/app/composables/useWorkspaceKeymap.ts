import { onBeforeUnmount, onMounted } from 'vue'
import type { Ref } from 'vue'
import type { WorkspaceSettings } from '../../types/workspace'
import { matchHotkeyCommand, onHotkeyCommand } from '../../utils/hotkeys'

interface KeymapHandlers {
  createNote: () => Promise<void>
  createFolder: () => Promise<void>
  saveNote: () => Promise<void>
  runSearch: () => void
  toggleSidebar: () => void
  toggleRightPanel: () => void
  openGraph: () => void
  openHistory: () => void
  openTrash: () => void
  openSettings: () => void
}

export function useWorkspaceKeymap(settings: Ref<WorkspaceSettings>, handlers: KeymapHandlers) {
  async function handleCommand(commandId: string) {
    switch (commandId) {
      case 'workspace.new-note': return handlers.createNote()
      case 'workspace.new-folder': return handlers.createFolder()
      case 'workspace.save-note': return handlers.saveNote()
      case 'workspace.search': handlers.runSearch(); break
      case 'workspace.toggle-sidebar': handlers.toggleSidebar(); break
      case 'workspace.toggle-right-panel': handlers.toggleRightPanel(); break
      case 'workspace.open-graph': handlers.openGraph(); break
      case 'workspace.open-history': handlers.openHistory(); break
      case 'workspace.open-trash': handlers.openTrash(); break
      case 'app.open-settings': handlers.openSettings(); break
    }
  }

  let stopHotkeyListener: (() => void) | null = null
  let keydownListener: ((e: KeyboardEvent) => void) | null = null

  onMounted(() => {
    stopHotkeyListener = onHotkeyCommand((commandId) => { void handleCommand(commandId) })

    keydownListener = (event: KeyboardEvent) => {
      const commandId = matchHotkeyCommand(settings.value.hotkeys.bindings, event)
      if (!commandId) return
      event.preventDefault()
      event.stopPropagation()
      void handleCommand(commandId)
    }

    window.addEventListener('keydown', keydownListener, true)
  })

  onBeforeUnmount(() => {
    stopHotkeyListener?.()
    stopHotkeyListener = null
    if (keydownListener) {
      window.removeEventListener('keydown', keydownListener, true)
      keydownListener = null
    }
  })
}
