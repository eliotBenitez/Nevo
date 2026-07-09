import { onMounted, onUnmounted, watch } from 'vue'
import { useNoteStore } from '../stores/note'
import { useWorkspaceStore } from '../stores/workspace'
import { storeToRefs } from 'pinia'
import { matchHotkeyCommand } from '../utils/hotkeys'

const AUTOSAVE_DELAY_MS = 2_000

export function useNotePersistence() {
  const noteStore = useNoteStore()
  const workspaceStore = useWorkspaceStore()
  const { settings } = storeToRefs(workspaceStore)
  let saveTimer: ReturnType<typeof setTimeout> | null = null
  let idleSavePending = false

  function scheduleSave() {
    if (settings.value.editor.autosavePolicy === 'window-idle') {
      idleSavePending = true
      return
    }
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      saveTimer = null
      void noteStore.saveNote()
    }, AUTOSAVE_DELAY_MS)
  }

  async function flushSave() {
    if (saveTimer) {
      clearTimeout(saveTimer)
      saveTimer = null
    }
    await noteStore.saveNote()
    idleSavePending = false
  }

  function onWindowIdle() {
    if (idleSavePending && noteStore.isDirty) {
      void noteStore.saveNote()
      idleSavePending = false
    }
  }

  function onKeydown(e: KeyboardEvent) {
    if (matchHotkeyCommand(settings.value.hotkeys.bindings, e) === 'workspace.save-note') {
      e.preventDefault()
      if (saveTimer) { clearTimeout(saveTimer); saveTimer = null }
      void noteStore.saveNote()
      idleSavePending = false
    }
  }

  function onBeforeUnload() {
    void flushSave()
  }

  function onVisibilityChange() {
    if (document.visibilityState === 'hidden') onWindowIdle()
  }

  onMounted(() => {
    document.addEventListener('keydown', onKeydown)
    window.addEventListener('beforeunload', onBeforeUnload)
    window.addEventListener('blur', onWindowIdle)
    document.addEventListener('visibilitychange', onVisibilityChange)
  })
  onUnmounted(() => {
    document.removeEventListener('keydown', onKeydown)
    window.removeEventListener('beforeunload', onBeforeUnload)
    window.removeEventListener('blur', onWindowIdle)
    document.removeEventListener('visibilitychange', onVisibilityChange)
    void flushSave()
  })

  watch(() => noteStore.isDirty, (dirty) => {
    if (dirty) {
      scheduleSave()
      return
    }
    if (saveTimer) {
      clearTimeout(saveTimer)
      saveTimer = null
    }
    idleSavePending = false
  })

  // `isDirty` only transitions false -> true once, so it won't fire again for
  // edits made while a save is already in flight (isDirty stays true the whole
  // time, including the drift check after the in-flight save completes).
  // `dirtyRevision` bumps on every such edit, so watching it re-schedules the
  // autosave instead of silently dropping it.
  watch(() => noteStore.dirtyRevision, () => {
    if (noteStore.isDirty) scheduleSave()
  })

  return { flushSave }
}
