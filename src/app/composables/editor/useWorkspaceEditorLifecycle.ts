import { nextTick, onBeforeUnmount, onMounted, toRaw, watch, type Ref } from 'vue'
import type { EditorCore } from './useEditorCore'
import type { SaveStatus } from '../../../stores/note'
import type { NoteDocument } from '../../../types/note'
import type { WorkspaceSettings } from '../../../types/workspace'

interface WorkspaceEditorLifecycleSetup {
  setupEditorForNote: (
    note: NoteDocument,
    editorRoot: HTMLDivElement,
    settings: WorkspaceSettings,
  ) => Promise<void>
  destroyEditorView: () => void
  flushDatabaseCleanup: () => void
}

interface WorkspaceEditorLifecycleOptions {
  core: EditorCore
  editorSetup: WorkspaceEditorLifecycleSetup
  editorRoot: Ref<HTMLDivElement | null>
  isTouch: Ref<boolean>
  scrollbarVisible: Ref<boolean>
  locale: Ref<string>
  localGraphOpen: Ref<boolean>
  getNote: () => NoteDocument | null
  getSettings: () => WorkspaceSettings
  getSaveStatus: () => SaveStatus
  getPendingBlockTargetKey: () => string | null
  getPendingDrawUpdateKey: () => string | null
  getTreeSize: () => number
  getCollabSessionNoteId: () => string | null
  isPluginRuntimeReady: () => boolean
  isPluginRuntimePaused: () => boolean
  mountBlockHandle: () => void
  unmountBlockHandle: () => void
  closeBlockTypeMenu: () => void
  mountNotePreload: (root: HTMLDivElement) => void
  unmountNotePreload: () => void
  closeEditorUi: () => void
  closeSlashEmojiPicker: () => void
  isSlashOverlayOpen: () => boolean
  updateEditorStatsNow: () => void
  resetStatsTracking: () => void
  clearStatsTimers: () => void
  refreshScrollbarMetrics: () => Promise<void>
  applyPendingBlockTarget: () => Promise<void>
  resetPendingBlockTarget: () => void
  applyPendingDrawUpdate: () => void
  afterSuccessfulSave: () => void
  flushPendingContent: () => void
  leaveCollabSession: () => Promise<void>
  loadNoteGraph: (noteId: string) => void
  clearGraph: () => void
  onDocumentMouseDown: (event: MouseEvent) => void
  resizeTitle: () => void
  startPluginRuntimeGuard: () => void
  disposePluginRuntime: () => Promise<void>
}

export function useWorkspaceEditorLifecycle(options: WorkspaceEditorLifecycleOptions) {
  async function reinitializeEditor(mountBlockHandle = false) {
    const note = options.getNote()
    if (!note) {
      options.unmountNotePreload()
      await options.refreshScrollbarMetrics()
      return
    }

    await nextTick()
    const root = options.editorRoot.value
    if (!root) return
    await options.editorSetup.setupEditorForNote(note, root, options.getSettings())
    options.mountNotePreload(root)
    options.updateEditorStatsNow()
    if (mountBlockHandle && !options.isTouch.value) options.mountBlockHandle()
    await options.applyPendingBlockTarget()
    options.applyPendingDrawUpdate()
    await options.refreshScrollbarMetrics()
  }

  watch(
    options.getSaveStatus,
    (status) => {
      if (status !== 'saved') return
      options.editorSetup.flushDatabaseCleanup()
      options.afterSuccessfulSave()
    },
  )

  watch(options.getTreeSize, () => {
    options.core.refreshBrokenLinks()
  })

  watch(
    () => [options.getSettings().editor.spellCheck, options.locale.value] as const,
    ([spellCheck]) => {
      const view = options.core.editorView
      if (!view) return
      const attrs = view.props.attributes
      const resolved = typeof attrs === 'function' ? attrs(view.state) : (attrs || {})
      view.setProps({
        ...view.props,
        attributes: {
          ...resolved,
          spellcheck: spellCheck ? 'true' : 'false',
          lang: document.documentElement.lang || 'ru',
        },
      })
    },
    { immediate: true },
  )

  watch(
    () => options.getSettings().editor.caretAnimation,
    (mode) => {
      const dom = options.core.editorView?.dom as HTMLElement | undefined
      if (!dom) return
      dom.classList.remove('caret--steady', 'caret--blink')
      if (mode === 'steady') dom.classList.add('caret--steady')
      else if (mode === 'blink') dom.classList.add('caret--blink')
    },
  )

  watch(
    () => {
      const note = options.getNote()
      return note ? { id: note.id, content: note.content } : null
    },
    async (noteState) => {
      if (options.isPluginRuntimePaused() || !options.isPluginRuntimeReady()) return
      options.unmountBlockHandle()
      if (!noteState) {
        options.unmountNotePreload()
        options.editorSetup.destroyEditorView()
        return
      }
      if (options.core.editorView && noteState.id === options.core.lastLoadedNoteId) {
        const rawContent = toRaw(noteState.content)
        if (rawContent === options.core.lastSerializedContentRef
          || JSON.stringify(rawContent) === options.core.lastSerializedContent) {
          options.core.lastSerializedContentRef = rawContent
          if (!options.isTouch.value) options.mountBlockHandle()
          return
        }
      }
      options.closeEditorUi()
      await reinitializeEditor(true)
    },
    { immediate: true },
  )

  watch(options.isTouch, (touch) => {
    if (touch) {
      options.closeBlockTypeMenu()
      options.unmountBlockHandle()
      options.scrollbarVisible.value = false
    } else if (options.getNote()) {
      options.mountBlockHandle()
    }
  })

  watch(options.isSlashOverlayOpen, (open) => {
    if (!open) options.closeSlashEmojiPicker()
  })

  watch(
    options.getPendingBlockTargetKey,
    async (pendingTargetKey) => {
      if (pendingTargetKey === null) options.resetPendingBlockTarget()
      await options.applyPendingBlockTarget()
      await options.refreshScrollbarMetrics()
    },
  )

  watch(options.getPendingDrawUpdateKey, options.applyPendingDrawUpdate)

  watch(
    () => options.getNote()?.id,
    (noteId, prevId) => {
      if (noteId !== prevId && options.getCollabSessionNoteId()) {
        void options.leaveCollabSession()
      }
      if (noteId) options.loadNoteGraph(noteId)
      else options.clearGraph()
    },
    { immediate: true },
  )

  watch(
    () => {
      const settings = options.getSettings()
      return [
        settings.appearance.editorFontFamily,
        settings.appearance.editorFontSize,
        settings.appearance.editorLineWidth,
        options.localGraphOpen.value,
      ]
    },
    options.refreshScrollbarMetrics,
  )

  watch(
    () => options.getSettings().editor.editorStatsVisibility,
    options.resetStatsTracking,
    { immediate: true },
  )

  watch(() => options.getNote()?.title, () => {
    nextTick(options.resizeTitle)
  })
  watch(() => options.getNote()?.id, () => {
    nextTick(options.resizeTitle)
  })

  onMounted(() => {
    document.addEventListener('mousedown', options.onDocumentMouseDown)
    options.startPluginRuntimeGuard()
    nextTick(options.resizeTitle)
  })

  onBeforeUnmount(async () => {
    document.removeEventListener('mousedown', options.onDocumentMouseDown)
    options.clearStatsTimers()
    options.flushPendingContent()
    options.unmountBlockHandle()
    options.unmountNotePreload()
    options.editorSetup.destroyEditorView()
    await options.leaveCollabSession()
    await options.disposePluginRuntime()
  })

  return { reinitializeEditor }
}
