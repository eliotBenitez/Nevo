import { computed, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'
import { useThemeStore } from '../../../stores/theme'
import { useWorkspaceStore } from '../../../stores/workspace'
import { resolveBindingChord } from '../../../utils/workspace-settings'
import { buildWorkspaceSettingsSearchItems } from '../../search/settings'
import type { ChatSource } from '../../../core/ai-chat/prompt'
import type { SettingsSectionId } from '../../../types/workspace'
import type { TitleBarSearchResult, WorkspaceBlockNavigationTarget } from '../../../types/search'

export type DrawUpdatePayload = { drawId: string; svgPreview: string; src: string; title?: string }

export interface UseWorkspaceSearchTargetsOptions {
  openNote: (noteId: string) => void
  openFolder: (folderId: string) => void
  openSettings: (section?: SettingsSectionId) => void
  setPendingReveal: (title: string) => void
  /** Applies a draw update to the mounted editor pane; returns false when no pane is mounted. */
  applyDrawUpdate: (payload: DrawUpdatePayload) => boolean
}

// The search overlay, the one-shot navigation targets handed to the editor pane
// after a search/AI-source click (block target, draw update), and the settings
// search index.
export function useWorkspaceSearchTargets(options: UseWorkspaceSearchTargetsOptions) {
  const { openNote, openFolder, openSettings, setPendingReveal, applyDrawUpdate } = options
  const { t } = useI18n()
  const themeStore = useThemeStore()
  const { manifest, settings, appConfig, plugins } = storeToRefs(useWorkspaceStore())

  const searchOverlayOpen = ref(false)
  const searchSeed = ref('')
  const pendingBlockTarget = ref<WorkspaceBlockNavigationTarget | null>(null)
  const pendingDrawUpdate = ref<DrawUpdatePayload | null>(null)

  const settingsSearchItems = computed(() => buildWorkspaceSettingsSearchItems({ t, manifest: manifest.value, settings: settings.value, appConfig: appConfig.value, plugins: plugins.value, pluginValidation: {}, locale: appConfig.value.locale, themeMode: themeStore.theme }))
  const workspaceSearchShortcut = computed(() => { const b = settings.value.hotkeys.bindings.find(x => x.commandId === 'workspace.search'); return b ? resolveBindingChord(b) : 'Ctrl+P' })

  async function runWorkspaceSearch(seed = '') { searchSeed.value = seed; searchOverlayOpen.value = true }
  function toggleSearch() { if (searchOverlayOpen.value) { searchOverlayOpen.value = false } else { void runWorkspaceSearch() } }

  // Sync preview/src back into the draw_block node after the canvas saved.
  //
  // When the note editor is mounted, it holds the live ProseMirror doc, so the
  // update MUST go through a transaction (updateDrawBlock) rather than patching
  // `note.content` directly — a direct patch would be invisible to the editor
  // and get clobbered the next time it serializes its own doc. When the editor
  // pane is unmounted (the canvas is open full-screen instead), `note.content`
  // itself is the source of truth and useDrawNoteSync patches it directly; this
  // pendingDrawUpdate path only covers the pane's own remount.
  //
  // Stash the update and let the pane apply it when it remounts — same
  // approach as pendingBlockTarget.
  function onUpdateDraw(payload: DrawUpdatePayload) {
    if (!applyDrawUpdate(payload)) pendingDrawUpdate.value = payload
  }
  function consumePendingDrawUpdate() { pendingDrawUpdate.value = null }
  function consumePendingBlockTarget() { pendingBlockTarget.value = null }

  function handleTitleBarSearchSelect(result: TitleBarSearchResult) {
    if (result.type === 'note') { openNote(result.id); return }
    if (result.type === 'folder') { openFolder(result.id); return }
    if (result.type === 'setting') {
      setPendingReveal(result.title)
      openSettings(result.section)
      return
    }
    pendingBlockTarget.value = { noteId: result.noteId, blockIndex: result.blockIndex, query: result.blockText, snippet: result.snippet }
    openNote(result.noteId)
  }
  function openAiChatSource(source: ChatSource) {
    if (source.blockIndex !== null) pendingBlockTarget.value = { noteId: source.noteId, blockIndex: source.blockIndex, query: source.text, snippet: source.text.slice(0, 160) }
    openNote(source.noteId)
  }

  return {
    searchOverlayOpen,
    searchSeed,
    pendingBlockTarget,
    pendingDrawUpdate,
    settingsSearchItems,
    workspaceSearchShortcut,
    runWorkspaceSearch,
    toggleSearch,
    onUpdateDraw,
    consumePendingDrawUpdate,
    consumePendingBlockTarget,
    handleTitleBarSearchSelect,
    openAiChatSource,
  }
}
