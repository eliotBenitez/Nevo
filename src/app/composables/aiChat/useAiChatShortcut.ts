import { computed } from 'vue'
import { useWorkspaceStore } from '../../../stores/workspace'
import { resolveBindingChord } from '../../../utils/workspace-settings'

export const AI_CHAT_TOGGLE_COMMAND = 'ai.chat.toggle'

/** The user's actual binding for the chat toggle, formatted for display and for aria-keyshortcuts. */
export function useAiChatShortcut() {
  const workspace = useWorkspaceStore()
  const chord = computed(() => {
    const binding = workspace.settings.hotkeys.bindings.find(b => b.commandId === AI_CHAT_TOGGLE_COMMAND)
    return binding ? resolveBindingChord(binding) : ''
  })
  return {
    label: computed(() => chord.value.replace(/\+/g, ' ')),
    ariaShortcut: computed(() => chord.value.replace(/\bCtrl\b/g, 'Control')),
  }
}
