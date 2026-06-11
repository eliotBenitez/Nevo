import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { storeToRefs } from 'pinia'
import { useWorkspaceStore } from '../../stores/workspace'
import { getHotkeyConflictMap, resolveBindingChord } from '../../utils/workspace-settings'
import { normalizeHotkeyChord } from '../../utils/hotkey-chords'
import { LOCAL_SHORTCUT_COMMAND_IDS } from '../../utils/hotkeys'
import type { HotkeyBinding, HotkeyScope } from '../../types/workspace'

const HOTKEY_LABEL_KEYS: Record<string, string> = {
  'core.undo': 'settings.hotkeys.commands.undo',
  'core.redo': 'settings.hotkeys.commands.redo',
  'core.bold': 'settings.hotkeys.commands.bold',
  'core.italic': 'settings.hotkeys.commands.italic',
  'core.strikethrough': 'settings.hotkeys.commands.strikethrough',
  'core.underline': 'settings.hotkeys.commands.underline',
  'core.kbd': 'settings.hotkeys.commands.kbd',
  'core.tag': 'settings.hotkeys.commands.tag',
  'core.heading.1': 'settings.hotkeys.commands.heading1',
  'core.heading.2': 'settings.hotkeys.commands.heading2',
  'core.heading.3': 'settings.hotkeys.commands.heading3',
  'core.heading.4': 'settings.hotkeys.commands.heading4',
  'core.heading.5': 'settings.hotkeys.commands.heading5',
  'core.heading.6': 'settings.hotkeys.commands.heading6',
  'core.orderedList': 'settings.hotkeys.commands.orderedList',
  'core.bulletList': 'settings.hotkeys.commands.bulletList',
  'core.blockquote': 'settings.hotkeys.commands.blockquote',
  'core.math.inline.insert': 'settings.hotkeys.commands.inlineMath',
  'workspace.new-note': 'settings.hotkeys.commands.newNote',
  'workspace.new-folder': 'settings.hotkeys.commands.newFolder',
  'workspace.save-note': 'settings.hotkeys.commands.saveNote',
  'workspace.search': 'settings.hotkeys.commands.searchTitles',
  'workspace.toggle-sidebar': 'settings.hotkeys.commands.toggleSidebar',
  'workspace.toggle-right-panel': 'settings.hotkeys.commands.toggleRightPanel',
  'workspace.open-graph': 'settings.hotkeys.commands.openGraph',
  'workspace.open-history': 'settings.hotkeys.commands.openHistory',
  'workspace.open-trash': 'settings.hotkeys.commands.openTrash',
  'app.open-settings': 'settings.hotkeys.commands.openSettings',
}

export function useSettingsHotkeys() {
  const { t } = useI18n()
  const workspaceStore = useWorkspaceStore()
  const { settings } = storeToRefs(workspaceStore)

  const capturingBindingId = ref<string | null>(null)
  const hotkeyQuery = ref('')

  const hotkeyConflicts = computed(() => getHotkeyConflictMap(settings.value.hotkeys.bindings))

  function isEditableHotkey(binding: HotkeyBinding): boolean {
    return LOCAL_SHORTCUT_COMMAND_IDS.has(binding.commandId)
  }

  function hotkeyLabel(binding: HotkeyBinding): string {
    const key = HOTKEY_LABEL_KEYS[binding.commandId]
    return key ? t(key) : binding.label
  }

  function hotkeyScopeLabel(scope: HotkeyScope): string {
    return t(`settings.hotkeys.scope.${scope}`)
  }

  function displayChordSegments(chord: string): string[] {
    return chord.split('+').map((segment) => segment === 'Space' ? t('settings.hotkeys.keys.space') : segment)
  }

  function displayChord(chord: string): string {
    return displayChordSegments(chord).join(' + ')
  }

  const filteredHotkeys = computed(() => {
    const query = hotkeyQuery.value.trim().toLowerCase()
    if (!query) return settings.value.hotkeys.bindings
    return settings.value.hotkeys.bindings.filter((binding) => {
      const resolved = displayChord(resolveBindingChord(binding)).toLowerCase()
      return (
        hotkeyLabel(binding).toLowerCase().includes(query)
        || binding.commandId.toLowerCase().includes(query)
        || hotkeyScopeLabel(binding.scope).includes(query)
        || resolved.includes(query)
      )
    })
  })

  function formatChordFromEvent(event: KeyboardEvent): string | null {
    const parts: string[] = []
    if (event.ctrlKey) parts.push('Ctrl')
    if (event.metaKey) parts.push('Meta')
    if (event.altKey) parts.push('Alt')
    if (event.shiftKey) parts.push('Shift')
    const key = event.key.length === 1 ? event.key.toUpperCase() : event.key
    if (['Meta', 'Control', 'Shift', 'Alt'].includes(key)) return null
    parts.push(key === ' ' ? 'Space' : key)
    return normalizeHotkeyChord(parts.join('+'))
  }

  async function onHotkeyCapture(event: KeyboardEvent, commandId: string) {
    event.preventDefault()
    event.stopPropagation()
    if (!LOCAL_SHORTCUT_COMMAND_IDS.has(commandId)) {
      capturingBindingId.value = null
      return
    }
    if (event.key === 'Escape') { capturingBindingId.value = null; return }
    if (event.key === 'Backspace' || event.key === 'Delete') {
      await workspaceStore.updateSettings((draft) => {
        const binding = draft.hotkeys.bindings.find(item => item.commandId === commandId)
        if (binding) binding.customChord = null
      })
      capturingBindingId.value = null
      return
    }
    const chord = formatChordFromEvent(event)
    if (!chord) return
    await workspaceStore.updateSettings((draft) => {
      const binding = draft.hotkeys.bindings.find(item => item.commandId === commandId)
      if (binding) binding.customChord = chord
    })
    capturingBindingId.value = null
  }

  async function resetHotkey(commandId: string) {
    if (!LOCAL_SHORTCUT_COMMAND_IDS.has(commandId)) return
    await workspaceStore.updateSettings((draft) => {
      const binding = draft.hotkeys.bindings.find(item => item.commandId === commandId)
      if (binding) binding.customChord = null
    })
  }

  async function resetAllHotkeys() {
    await workspaceStore.updateSettings((draft) => {
      for (const binding of draft.hotkeys.bindings) {
        if (LOCAL_SHORTCUT_COMMAND_IDS.has(binding.commandId)) binding.customChord = null
      }
    })
  }

  return {
    capturingBindingId,
    hotkeyQuery,
    hotkeyConflicts,
    filteredHotkeys,
    isEditableHotkey,
    hotkeyLabel,
    hotkeyScopeLabel,
    displayChordSegments,
    displayChord,
    onHotkeyCapture,
    resetHotkey,
    resetAllHotkeys,
  }
}
