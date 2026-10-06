<script setup lang="ts">
import { computed, defineAsyncComponent, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
// This shell also renders the folder-empty state and owns the hidden upload
// inputs, so the editor bundle must be loaded before EditorSurface mounts.
import '../../styles/editor.css'
import type { SaveStatus } from '../../stores/note'
import type { NoteDocument } from '../../types/note'
import type { CanvasSnapshotV1 } from '../../core/canvas'
import type { NoteViewMode } from '../../features/canvas/canvasPreferences'
import type { PluginManifest, WorkspaceSettings } from '../../types/workspace'
import type { NevoSandboxUiContributionSnapshot } from '../../types/editor-plugin'
import NvNoteIcon from '../../ui/primitives/NvNoteIcon.vue'
import { focusEditorFirstBlock } from '../../editor-core'
import { createEditorCore } from '../composables/editor/useEditorCore'
import { useGraphStore } from '../../stores/graph'
import { useTreeStore } from '../../stores/tree'
import { useWorkspaceStore } from '../../stores/workspace'
import { useFirstUseHint } from '../../features/onboarding/hints/useFirstUseHint'
import { useEditorOverlays } from '../composables/editor/useEditorOverlays'
import { useMathEditor } from '../composables/editor/useMathEditor'
import { useFormulaEditor } from '../composables/editor/useFormulaEditor'
import { useMermaidEditor } from '../composables/editor/useMermaidEditor'
import { useQueryEditor } from '../composables/editor/useQueryEditor'
import { usePluginNodePopover } from '../composables/editor/usePluginNodePopover'
import { useMarkmapEditor } from '../composables/editor/useMarkmapEditor'
import { useVegaEditor } from '../composables/editor/useVegaEditor'
import { useLinkEditor } from '../composables/editor/useLinkEditor'
import { useImageContextMenu } from '../composables/editor/useImageContextMenu'
import { useEditorContextMenu } from '../composables/editor/useEditorContextMenu'
import { useEmbedUrlPopover } from '../composables/editor/useEmbedUrlPopover'
import { useNoteEmbedPicker } from '../composables/editor/useNoteEmbedPicker'
import { useCalloutIconPicker } from '../composables/editor/useCalloutIconPicker'
import { useEditorDocStats } from '../composables/editor/useEditorDocStats'
import { useImageUpload } from '../composables/editor/useImageUpload'
import { useFileUpload } from '../composables/editor/useFileUpload'
import { useMediaUpload } from '../composables/editor/useMediaUpload'
import { useVoiceRecording } from '../composables/editor/useVoiceRecording'
import { isVoiceRecordingSupported } from '../../tauri/voiceRecording'
import { useBlockHandle } from '../composables/editor/useBlockHandle'
import { useDeviceLayout } from '../../composables/useDeviceLayout'
import { useEditorScrollbar } from '../composables/editor/useEditorScrollbar'
import { useNotePreload } from '../composables/editor/useNotePreload'
import { useEditorAssetActions } from '../composables/editor/useEditorAssetActions'
import { useEditorDocumentActions } from '../composables/editor/useEditorDocumentActions'
import { useEditorPluginRuntime } from '../composables/editor/useEditorPluginRuntime'
import { useWorkspaceEditorLifecycle } from '../composables/editor/useWorkspaceEditorLifecycle'
import {
  useEditorOverlayInteractions,
  type EditorOverlayElements,
} from '../composables/editor/useEditorOverlayInteractions'
import { useWorkspaceEditorPresentation } from '../composables/editor/useWorkspaceEditorPresentation'
import { useEditorToolbarActions } from '../composables/editor/useEditorToolbarActions'
import { useWorkspaceEditorCore } from '../composables/editor/useWorkspaceEditorCore'
import { useFindInNote } from '../composables/editor/useFindInNote'
import { createWorkspaceEditorOverlayHandlers } from '../composables/editor/createWorkspaceEditorOverlayHandlers'
import { createMobileBlockMenuTransaction } from '../composables/editor/mobileBlockInsertion'
import NvPopupMenu from '../../ui/primitives/NvPopupMenu.vue'
import DocAppearance from './editor/DocAppearance.vue'
import AiAskModal from './editor/AiAskModal.vue'
import NoteEmbedPicker from './editor/NoteEmbedPicker.vue'
import EditorOverlayContainer from './editor/EditorOverlayContainer.vue'
import EditorFindBar from './editor/EditorFindBar.vue'
import MobileEditorTabBar from './editor/MobileEditorTabBar.vue'
import type { WorkspaceBlockNavigationTarget } from '../../types/search'
import LocalGraphPanel from '../../features/graph/LocalGraphPanel.vue'
import { ChevronRight, EllipsisVertical } from '@lucide/vue'
import type { TreeNode } from '../../types/note'
import NoteBreadcrumb from './NoteBreadcrumb.vue'
import EdgelessCanvasView from '../../features/canvas/EdgelessCanvasView.vue'

const TemplatePickerModal = defineAsyncComponent(() => import('./templates/TemplatePickerModal.vue'))

interface Props {
  note: NoteDocument | null
  workspacePath: string | null
  workspaceName?: string
  pluginManifests: PluginManifest[]
  settings: WorkspaceSettings
  saveStatus: SaveStatus
  containerTitle: string | null
  containerKind: 'root' | 'folder' | null
  containerItems: TreeNode[]
  pendingBlockTarget?: WorkspaceBlockNavigationTarget | null
  pendingDrawUpdate?: { drawId: string; svgPreview: string; src: string; title?: string } | null
  workspaceId?: string
  viewMode?: NoteViewMode
}

const props = withDefaults(defineProps<Props>(), {
  workspaceName: '',
  pendingBlockTarget: undefined,
  pendingDrawUpdate: undefined,
  workspaceId: '',
  viewMode: 'document',
})
const emit = defineEmits<{
  'update:title': [value: string]
  'update:icon': [value: string]
  'update:cover': [value: string | null]
  'update:content': [value: NoteDocument['content']]
  'content-dirty': []
  'create-note': []
  'consumed-pending-target': []
  'consumed-draw-update': []
  'open-note': [noteId: string, anchor?: string | null]
  'open-folder': [folderId: string]
  'request-export': [format: 'markdown' | 'html' | 'docx' | 'typst' | 'pdf']
  'request-import-md': []
  'open-draw': [noteId: string, drawId: string]
  'plugin-contributions': [snapshot: NevoSandboxUiContributionSnapshot]
  'change-view': [mode: NoteViewMode]
  'update:canvas': [snapshot: CanvasSnapshotV1]
}>()

function emitOpenDraw(drawId: string) {
  if (drawId && props.note?.id) emit('open-draw', props.note.id, drawId)
}

const { t, locale } = useI18n()

interface OverlayContainerInstance extends EditorOverlayElements {
  slashMenuEl: HTMLElement | null
  toolbarEl: HTMLElement | null
  tableMenuEl: HTMLElement | null
  linkPickerEl: HTMLElement | null
  linkPopoverEl: HTMLElement | null
  linkPopoverComp: { focusInput: () => void } | null
  mathPopoverEl: HTMLElement | null
  mathPopoverComp: { focusInput: () => void } | null
  formulaPopoverEl: HTMLElement | null
  formulaPopoverComp: { focusInput: () => void } | null
  mermaidPopoverEl: HTMLElement | null
  mermaidPopoverComp: { focusInput: () => void } | null
  markmapPopoverEl: HTMLElement | null
  markmapPopoverComp: { focusInput: () => void } | null
  vegaPopoverEl: HTMLElement | null
  vegaPopoverComp: { focusInput: () => void } | null
  pluginNodePopoverEl: HTMLElement | null
  pluginNodePopoverComp: { focusInput: () => void } | null
  embedUrlPopoverEl: HTMLElement | null
  embedUrlPopoverComp: { focusInput: () => void } | null
  linkPickerComp: { menuRef: HTMLDivElement | null; selectActive: () => boolean } | null
  calloutIconPickerEl: HTMLElement | null
  blockHandleEl: HTMLElement | null
  blockTypeMenuEl: HTMLElement | null
}

// DOM refs
const editorRoot = ref<HTMLDivElement | null>(null)
const editorScrollEl = ref<HTMLElement | null>(null)
const editorWrapEl = ref<HTMLDivElement | null>(null)
const scrollbarTrackEl = ref<HTMLDivElement | null>(null)
const docAppearanceRef = ref<{ openIconPicker: () => void } | null>(null)
const imageInputRef = ref<HTMLInputElement | null>(null)
const fileInputRef = ref<HTMLInputElement | null>(null)
const coverImageInputRef = ref<HTMLInputElement | null>(null)
const overlayContainerRef = ref<OverlayContainerInstance | null>(null)
const noteEmbedPickerRef = ref<{ el: HTMLDivElement | null } | null>(null)
const titleInputRef = ref<HTMLTextAreaElement | null>(null)

const localGraphOpen = ref(false)
const breadcrumbMenuOpen = ref(false)
// Local workspace asset URLs resolve synchronously (workspaceAssetUrl), so
// this never needs to increment; it only exists to satisfy the asset-src
// re-resolution hook shared with a future async-resolving backend.
const assetRefreshToken = ref(0)

// Core mutable state (non-reactive intentionally)
const core = createEditorCore()
const graphStore = useGraphStore()
const treeStore = useTreeStore()
const canvasNoteOptions = computed(() => Array.from(treeStore.noteById.values()).map(note => ({
  id: note.id,
  title: note.title,
  icon: note.icon,
})))
const workspaceStore = useWorkspaceStore()
useFirstUseHint('editorCanvas', { enabled: computed(() => !!props.note) })
const assetActions = useEditorAssetActions({
  getWorkspacePath: () => props.workspacePath,
  getBackend: () => workspaceStore.backend,
  getCover: () => props.note?.cover,
  emitCover: (cover) => emit('update:cover', cover),
  clickCoverInput: () => coverImageInputRef.value?.click(),
})
const {
  resolveWorkspaceAssetSrc,
  resolveEditorAssetSrc,
  resolveMediaAssetSrc,
  backendSupportsPathImport,
  openFileAsset,
  updateCover,
  onRequestCoverImage,
  onCoverImageInputChange,
} = assetActions
const blockHandleComposable = useBlockHandle(core, {
  getHandleBoundaryEl: () => editorScrollEl.value ?? editorWrapEl.value ?? editorRoot.value,
  getTypeMenuBoundaryEl: () => editorScrollEl.value ?? editorWrapEl.value ?? editorRoot.value,
  getTypeMenuEl: () => overlayContainerRef.value?.blockTypeMenuEl ?? null,
  getCurrentNoteId: () => props.note?.id ?? null,
})
const { blockHandle } = blockHandleComposable
const { isPhone, isTouch, supportsHover } = useDeviceLayout()
const showMobileEditorTabBar = computed(() =>
  isPhone.value
  && props.viewMode === 'document'
  && Boolean(props.note),
)

const findInNote = useFindInNote({
  getView: () => core.editorView,
  getScrollEl: () => editorScrollEl.value,
  isAvailable: () => Boolean(props.note) && props.viewMode === 'document' && Boolean(core.editorView),
})

watch(() => [props.note?.id, props.viewMode], () => findInNote.reset())

// Overlays
const overlays = useEditorOverlays(core, {
  getSlashMenuEl: () => overlayContainerRef.value?.slashMenuEl ?? null,
  getToolbarEl: () => overlayContainerRef.value?.toolbarEl ?? null,
  getTableMenuEl: () => overlayContainerRef.value?.tableMenuEl ?? null,
  getLinkPickerEl: () => overlayContainerRef.value?.linkPickerEl ?? null,
})
const { slashOverlay, toolbarOverlay, tableMenuOverlay, linkPopover, highlightPicker, textColorPicker, mathPopover, formulaPopover, mermaidPopover, queryPopover, markmapPopover, vegaPopover, pluginNodePopover, linkPickerOverlay, activeMarkNames } = overlays

const { imageCtxMenu, imageMenuItems, openImageContextMenu } = useImageContextMenu(() => props.workspacePath)
const { ctxMenu: editorCtxMenu, menuItems: editorMenuItems, openContextMenu: openEditorContextMenu } = useEditorContextMenu(core, () => props.note?.id ?? null)

const {
  embedUrlPopover,
  openEmbedUrlPopover,
  closeEmbedUrlPopover,
  confirmEmbedUrl,
  cancelEmbedUrl,
  onEmbedUrlInputKeyDown,
  isOpeningClickIgnored: isEmbedOpeningClickIgnored,
} = useEmbedUrlPopover(
  core,
  {
    getEmbedUrlPopoverEl: () => overlayContainerRef.value?.embedUrlPopoverEl ?? null,
    focusInput: () => overlayContainerRef.value?.embedUrlPopoverComp?.focusInput(),
  },
  overlays.clampOverlayPosition,
  () => props.workspacePath,
)

const {
  calloutIconPicker,
  openCalloutIconPicker,
  closeCalloutIconPicker,
  selectCalloutIcon,
} = useCalloutIconPicker(
  core,
  { getCalloutIconPickerEl: () => overlayContainerRef.value?.calloutIconPickerEl ?? null },
  overlays.clampOverlayPosition,
)

const {
  noteEmbedPicker,
  noteEmbedFilteredNotes,
  openNoteEmbedPicker,
  closeNoteEmbedPicker,
  selectNoteForEmbed,
} = useNoteEmbedPicker(
  core,
  { getNoteEmbedPickerEl: () => noteEmbedPickerRef.value?.el ?? null },
  overlays.clampOverlayPosition,
)

const {
  editorWordCount,
  updateEditorStatsNow,
  scheduleGraphUpdate,
  onTransactionDoc,
  resetStatsTracking,
  clearTimers: clearStatsTimers,
} = useEditorDocStats(core, () => props.settings, () => props.note?.id)

const slashEmojiPickerOpen = ref(false)

// Feature composables
const mathEditor = useMathEditor(
  core,
  mathPopover,
  {
    getMathPopoverEl: () => overlayContainerRef.value?.mathPopoverEl ?? null,
    onFocusInput: () => overlayContainerRef.value?.mathPopoverComp?.focusInput(),
  },
  overlays.updateOverlays,
  overlays.clampOverlayPosition,
)

const formulaEditor = useFormulaEditor(
  core,
  formulaPopover,
  {
    getFormulaPopoverEl: () => overlayContainerRef.value?.formulaPopoverEl ?? null,
    onFocusInput: () => overlayContainerRef.value?.formulaPopoverComp?.focusInput(),
  },
  overlays.updateOverlays,
  overlays.clampOverlayPosition,
)

const mermaidEditor = useMermaidEditor(
  core,
  mermaidPopover,
  {
    getMermaidPopoverEl: () => overlayContainerRef.value?.mermaidPopoverEl ?? null,
    onFocusInput: () => overlayContainerRef.value?.mermaidPopoverComp?.focusInput(),
  },
  overlays.updateOverlays,
  overlays.clampOverlayPosition,
)

const queryEditor = useQueryEditor(
  core,
  queryPopover,
  {
    getQueryPopoverEl: () => overlayContainerRef.value?.queryPopoverEl ?? null,
  },
  overlays.updateOverlays,
  overlays.clampOverlayPosition,
)

const markmapEditor = useMarkmapEditor(
  core,
  markmapPopover,
  {
    getMarkmapPopoverEl: () => overlayContainerRef.value?.markmapPopoverEl ?? null,
    onFocusInput: () => overlayContainerRef.value?.markmapPopoverComp?.focusInput(),
  },
  overlays.updateOverlays,
  overlays.clampOverlayPosition,
)

const vegaEditor = useVegaEditor(
  core,
  vegaPopover,
  {
    getVegaPopoverEl: () => overlayContainerRef.value?.vegaPopoverEl ?? null,
    onFocusInput: () => overlayContainerRef.value?.vegaPopoverComp?.focusInput(),
  },
  overlays.updateOverlays,
  overlays.clampOverlayPosition,
)

const pluginNodeEditor = usePluginNodePopover(
  core,
  pluginNodePopover,
  {
    getPopoverEl: () => overlayContainerRef.value?.pluginNodePopoverEl ?? null,
    onFocusInput: () => overlayContainerRef.value?.pluginNodePopoverComp?.focusInput(),
  },
  overlays.updateOverlays,
  overlays.clampOverlayPosition,
)

const linkEditor = useLinkEditor(
  core,
  linkPopover,
  toolbarOverlay,
  () => overlayContainerRef.value?.linkPopoverComp?.focusInput(),
  overlays.updateOverlays,
)

const imageUpload = useImageUpload(core, () => props.workspacePath, overlays.updateOverlays)
const fileUpload = useFileUpload(core, () => props.workspacePath, overlays.updateOverlays)
const mediaUpload = useMediaUpload(core, () => props.workspacePath, overlays.updateOverlays)
const voiceRecording = useVoiceRecording(core, () => props.workspacePath, overlays.updateOverlays)
const notePreload = useNotePreload()

const insertTemplatePickerOpen = ref(false)

function openNoteById(noteId: string) {
  if (!treeStore.noteById.get(noteId)) return
  emit('open-note', noteId)
}

// Best-effort "note saved" signal for block_embed's live re-resolve (see
// `CoreNodeViewOptions.onSubscribeNoteSaved`). Since only one note is open
// in this pane at a time, this only ever fires for whichever noteId matches
// props.note.id — i.e. it benefits a block_embed referencing a block earlier
// in the SAME note. Cross-note staleness is covered by the mount-time
// resolve that already runs whenever the editor is rebuilt on note switch.
const blockRefSavedListeners = new Map<string, Set<() => void>>()

watch(
  () => [props.saveStatus, props.note?.id] as const,
  ([status, noteId], previous) => {
    const previousStatus = previous?.[0]
    if (status === 'saved' && previousStatus !== 'saved' && noteId) {
      blockRefSavedListeners.get(noteId)?.forEach((callback) => callback())
    }
  },
)

function subscribeNoteSaved(noteId: string, callback: () => void): () => void {
  let listeners = blockRefSavedListeners.get(noteId)
  if (!listeners) {
    listeners = new Set()
    blockRefSavedListeners.set(noteId, listeners)
  }
  listeners.add(callback)
  return () => {
    listeners?.delete(callback)
    if (listeners?.size === 0) blockRefSavedListeners.delete(noteId)
  }
}

const {
  editorSetup,
  aiAskOpen,
  aiAskValue,
  confirmAiAsk,
  cancelAiAsk,
} = useWorkspaceEditorCore({
  core,
  editorScrollEl,
  getSettings: () => props.settings,
  getNoteId: () => props.note?.id ?? null,
  getWorkspacePath: () => props.workspacePath,
  updateOverlays: overlays.updateOverlays,
  closeOverlays: overlays.closeOverlays,
  closeSlashEmojiPicker,
  closeEmbedUrlPopover,
  emitContentUpdate: (content) => emit('update:content', content),
  emitContentDirty: () => emit('content-dirty'),
  onTransactionDoc: (doc) => {
    onTransactionDoc(doc)
    findInNote.onEditorTransaction()
  },
  scheduleGraphUpdate,
  markRemovedEditorAssets: assetActions.markRemovedEditorAssets,
  openInternalLink: (noteId, anchor) => {
    if (!treeStore.noteById.get(noteId)) return
    emit('open-note', noteId, anchor)
  },
  internalLinkExists: (noteId) => treeStore.noteById.has(noteId),
  resolveWikiLink: (title) => treeStore.resolveNoteIdByTitle(title),
  resolveAssetSrc: resolveEditorAssetSrc,
  resolveMediaSrc: resolveMediaAssetSrc,
  backendSupportsPathImport,
  pickAndInsertImage: imageUpload.pickAndInsertImage,
  requestImageInput: () => imageInputRef.value?.click(),
  onImagePaste: imageUpload.onEditorPaste,
  openImageContextMenu,
  onContextMenuRequest: openEditorContextMenu,
  pickAndInsertFile: fileUpload.pickAndInsertFile,
  requestFileInput: () => fileInputRef.value?.click(),
  openFileAsset,
  requestMediaPicker: mediaUpload.requestMediaPicker,
  voiceRecording: isVoiceRecordingSupported() ? voiceRecording.bindings : undefined,
  openNoteEmbedPicker,
  openEmbedUrlPopover,
  openNoteEmbed: openNoteById,
  openBlockRefSource: openNoteById,
  subscribeNoteSaved,
  openMathEditor: mathEditor.openMathPopoverForNode,
  openFormulaEditor: (cellPos, _formula, rect) => formulaEditor.openFormulaPopoverForCell(cellPos, rect),
  openMermaidEditor: mermaidEditor.openMermaidPopoverForNode,
  openQueryEditor: queryEditor.openQueryPopoverForNode,
  openPluginNodeEditor: pluginNodeEditor.openForNode,
  openMarkmapEditor: markmapEditor.openMarkmapPopoverForNode,
  openVegaEditor: vegaEditor.openVegaPopoverForNode,
  openDraw: emitOpenDraw,
  selectActiveLinkPicker: () => overlayContainerRef.value?.linkPickerComp?.selectActive() ?? false,
  insertInlineMath: mathEditor.insertInlineMathAndEdit,
  insertBlockMath: mathEditor.insertBlockMathAndEdit,
  openSelectedMathEditor: mathEditor.openSelectedMathPopover,
  openSlashEmojiPicker,
  openCalloutIconPicker,
  openTemplatePicker: () => { insertTemplatePickerOpen.value = true },
})

function openMobileBlockMenu() {
  const view = core.editorView
  if (!view) return
  const tr = createMobileBlockMenuTransaction(view.state)
  if (!tr) return
  view.dispatch(tr)
  view.focus()
  overlays.updateOverlays()
}

function openMobileLinkPopover() {
  linkEditor.openLinkPopover({ top: 0, left: 12 })
}

const documentActions = useEditorDocumentActions({
  core,
  editorRoot,
  getNote: () => props.note,
  getWorkspaceName: () => props.workspaceName,
  getPendingBlockTarget: () => props.pendingBlockTarget,
  getPendingDrawUpdate: () => props.pendingDrawUpdate,
  createNote: (folderId, title) => treeStore.createNote(folderId, title),
  insertContentAtSelection: editorSetup.insertContentAtSelection,
  flushPendingContentUpdate: editorSetup.flushPendingContentUpdate,
  closeTemplatePicker: () => { insertTemplatePickerOpen.value = false },
  emitConsumedPendingTarget: () => emit('consumed-pending-target'),
  emitConsumedDrawUpdate: () => emit('consumed-draw-update'),
})
const {
  flushPendingContent,
  selectLinkNote,
  selectLinkCreateNote,
  insertResolvedTemplate,
  updateDrawBlock,
} = documentActions

const toolbarActions = useEditorToolbarActions({
  core,
  executeStateCommand: editorSetup.executeStateCommand,
  runPluginToolbarAction: editorSetup.runPluginToolbarAction,
  toolbarOverlay,
  highlightPicker,
  textColorPicker,
  getActiveTableCellPos: () => tableMenuOverlay.context?.activeCell?.pos ?? null,
  openFormulaForCell: (cellPos) => formulaEditor.openFormulaPopoverForCell(cellPos),
})

function openSlashEmojiPicker() {
  slashEmojiPickerOpen.value = true
}

function closeSlashEmojiPicker() {
  slashEmojiPickerOpen.value = false
}

function selectSlashEmoji(emoji: string) {
  if (editorSetup.insertEmojiFromSlashPicker(emoji)) {
    closeSlashEmojiPicker()
  }
}

// Scrollbar
const {
  scrollbarVisible, scrollbarScrollable, scrollbarDragging,
  scrollbarStyle, scrollbarInteractivityStyle, scrollbarPositionStyle,
  refreshScrollbarMetrics,
  onEditorMouseEnter, onEditorMouseLeave, onEditorScroll: originalOnEditorScroll,
  onScrollbarTrackMouseDown, onScrollbarThumbMouseDown,
} = useEditorScrollbar({ editorScrollEl, scrollbarTrackEl, editorWrapEl, supportsHover, getCover: () => props.note?.cover })

const {
  onDocumentMouseDown,
  handleEditorScroll,
} = useEditorOverlayInteractions({
  overlayElements: overlayContainerRef,
  noteEmbedPickerEl: () => noteEmbedPickerRef.value?.el ?? null,
  isBlockTypeMenuOpen: () => blockHandle.typeMenuOpen,
  isLinkPopoverOpen: () => linkPopover.open,
  isMathPopoverOpen: () => mathPopover.open,
  isFormulaPopoverOpen: () => formulaPopover.open,
  isMermaidPopoverOpen: () => mermaidPopover.open,
  isQueryPopoverOpen: () => queryPopover.open,
  isMarkmapPopoverOpen: () => markmapPopover.open,
  isVegaPopoverOpen: () => vegaPopover.open,
  isPluginNodePopoverOpen: () => pluginNodePopover.open,
  isEmbedUrlPopoverOpen: () => embedUrlPopover.open,
  isCalloutIconPickerOpen: () => calloutIconPicker.open,
  isSlashEmojiPickerOpen: () => slashEmojiPickerOpen.value,
  isNoteEmbedPickerOpen: () => noteEmbedPicker.open,
  closeBlockTypeMenu: blockHandleComposable.closeTypeMenu,
  closeLinkPopover: linkEditor.closeLinkPopover,
  closeMathPopover: mathEditor.closeMathPopover,
  closeFormulaPopover: formulaEditor.closeFormulaPopover,
  closeMermaidPopover: mermaidEditor.closeMermaidPopover,
  closeQueryPopover: queryEditor.closeQueryPopover,
  closeMarkmapPopover: markmapEditor.closeMarkmapPopover,
  closeVegaPopover: vegaEditor.closeVegaPopover,
  closePluginNodePopover: pluginNodeEditor.close,
  closeEmbedUrlPopover,
  closeCalloutIconPicker,
  closeSlashEmojiPicker,
  closeNoteEmbedPicker,
  isEmbedOpeningClickIgnored,
  onEditorScroll: originalOnEditorScroll,
  repositionOverlays: [
    {
      isActive: () => slashOverlay.open
        || toolbarOverlay.visible
        || tableMenuOverlay.visible
        || linkPickerOverlay.open,
      reposition: overlays.updateOverlays,
    },
    { isActive: () => mathPopover.open, reposition: mathEditor.repositionMathPopover },
    { isActive: () => mermaidPopover.open, reposition: mermaidEditor.repositionMermaidPopover },
    { isActive: () => queryPopover.open, reposition: queryEditor.repositionQueryPopover },
    { isActive: () => markmapPopover.open, reposition: markmapEditor.repositionMarkmapPopover },
    { isActive: () => vegaPopover.open, reposition: vegaEditor.repositionVegaPopover },
    { isActive: () => pluginNodePopover.open, reposition: pluginNodeEditor.reposition },
    { isActive: () => blockHandle.visible, reposition: blockHandleComposable.reposition },
  ],
})

const overlayHandlers = createWorkspaceEditorOverlayHandlers({
  editorSetup,
  toolbarActions,
  linkEditor,
  mathEditor,
  formulaEditor,
  mermaidEditor,
  queryEditor,
  markmapEditor,
  vegaEditor,
  pluginNodeEditor,
  blockHandle: blockHandleComposable,
  linkPopover,
  mathPopover,
  formulaPopover,
  mermaidPopover,
  queryPopover,
  markmapPopover,
  vegaPopover,
  backendSupportsPathImport,
  pickAndInsertImage: imageUpload.pickAndInsertImage,
  requestImagePicker: imageUpload.requestImagePicker,
  clickImageInput: () => imageInputRef.value?.click(),
  confirmEmbedUrl,
  cancelEmbedUrl,
  onEmbedUrlInputKeyDown,
  selectLinkNote,
  selectLinkCreateNote,
  selectSlashEmoji,
  openSlashEmojiPicker,
  closeSlashEmojiPicker,
  selectCalloutIcon,
  closeCalloutIconPicker,
  hideToolbarManually: overlays.hideToolbarManually,
})

function requestMobileImage() {
  overlayHandlers.requestImage()
}

const {
  showContainerOverview,
  isFolderEmptyState,
  noteIcon,
  noteCoverStyle,
  noteIconButtonLabel,
  editorBodyClasses,
  editorContentStyle,
  breadcrumbMenuItems,
  resizeTitle,
  onTitleInput,
  onTitleKeyDown,
} = useWorkspaceEditorPresentation({
  getNote: () => props.note,
  getSettings: () => props.settings,
  getContainerKind: () => props.containerKind,
  getContainerItems: () => props.containerItems,
  getScrollbarDragging: () => scrollbarDragging.value,
  workspaceAssetRefreshToken: assetRefreshToken,
  resolveWorkspaceAssetSrc,
  titleInputRef,
  localGraphOpen,
  translate: (key) => t(key),
  emitTitle: (title) => emit('update:title', title),
  requestExport: (format) => emit('request-export', format),
  requestMarkdownImport: () => emit('request-import-md'),
  openFindInNote: () => { openFindInNote() },
  onTitleEnter: () => {
    if (core.editorView) {
      focusEditorFirstBlock(core.editorView)
    }
  },
})

function openFindInNote(withReplace?: boolean): boolean {
  return findInNote.openFind({ withReplace })
}

function closeEditorUi() {
  closeSlashEmojiPicker()
  closeCalloutIconPicker()
  closeEmbedUrlPopover()
  closeNoteEmbedPicker()
}

let pluginRuntime: ReturnType<typeof useEditorPluginRuntime> | null = null
const editorLifecycle = useWorkspaceEditorLifecycle({
  core,
  editorSetup,
  editorRoot,
  isTouch,
  scrollbarVisible,
  locale,
  localGraphOpen,
  getNote: () => props.note,
  getSettings: () => props.settings,
  getSaveStatus: () => props.saveStatus,
  getPendingBlockTargetKey: () => props.pendingBlockTarget
    ? `${props.pendingBlockTarget.noteId}:${props.pendingBlockTarget.blockIndex}`
    : null,
  getPendingDrawUpdateKey: () => props.pendingDrawUpdate
    ? `${props.pendingDrawUpdate.drawId}:${props.pendingDrawUpdate.src}`
    : null,
  getTreeSize: () => treeStore.noteById.size,
  isPluginRuntimeReady: () => pluginRuntime?.initialized.value ?? false,
  isPluginRuntimePaused: () => pluginRuntime?.paused.value ?? false,
  mountBlockHandle: blockHandleComposable.mount,
  unmountBlockHandle: blockHandleComposable.unmount,
  closeBlockTypeMenu: blockHandleComposable.closeTypeMenu,
  mountNotePreload: notePreload.mount,
  unmountNotePreload: notePreload.unmount,
  closeEditorUi,
  closeSlashEmojiPicker,
  isSlashOverlayOpen: () => slashOverlay.open,
  updateEditorStatsNow,
  resetStatsTracking,
  clearStatsTimers,
  refreshScrollbarMetrics,
  applyPendingBlockTarget: documentActions.applyPendingBlockTargetIfReady,
  resetPendingBlockTarget: documentActions.resetPendingBlockTarget,
  applyPendingDrawUpdate: documentActions.applyPendingDrawUpdateIfReady,
  afterSuccessfulSave: assetActions.afterSuccessfulSave,
  flushPendingContent,
  loadNoteGraph: graphStore.loadNoteGraph,
  clearGraph: graphStore.clear,
  onDocumentMouseDown,
  resizeTitle,
  startPluginRuntimeGuard: () => pluginRuntime?.startMarketplaceGuard(),
  disposePluginRuntime: () => pluginRuntime?.dispose() ?? Promise.resolve(),
})

pluginRuntime = useEditorPluginRuntime({
  core,
  editorSetup,
  getWorkspacePath: () => props.workspacePath,
  getPluginManifests: () => props.pluginManifests,
  getSettings: () => props.settings,
  flushPendingContent,
  unmountNotePreload: notePreload.unmount,
  unmountBlockHandle: blockHandleComposable.unmount,
  closeEditorUi,
  reinitializeEditor: () => editorLifecycle.reinitializeEditor(),
  emitContributions: (snapshot) => emit('plugin-contributions', snapshot),
})
const { dispatchPluginUiEvent } = pluginRuntime

defineExpose({ editorRoot, flushPendingContent, updateDrawBlock, dispatchPluginUiEvent, openFindInNote })
</script>

<template>
  <main
    class="editor-pane tw:relative tw:z-1 tw:flex tw:min-h-0 tw:min-w-0 tw:flex-1 tw:flex-col tw:overflow-hidden"
    :class="{
      'editor-pane--with-graph': localGraphOpen && note,
      'editor-pane--focus-soft': props.settings.editor.focusMode === 'soft',
      'editor-pane--canvas': props.viewMode === 'canvas' && note,
      'editor-pane--mobile-tab-bar': showMobileEditorTabBar,
    }"
  >
    <section v-if="showContainerOverview" class="container-overview tw:min-h-0 tw:flex-1 tw:overflow-y-auto tw:px-6 tw:pt-8 tw:pb-10 tw:max-[900px]:px-4 tw:max-[900px]:pt-6 tw:max-[900px]:pb-7">
      <header class="container-overview__header tw:mx-auto tw:mb-6 tw:w-[min(100%,960px)] tw:px-2">
        <p class="container-overview__eyebrow tw:mt-0 tw:mb-2 tw:font-nv-mono tw:text-xs tw:tracking-[0.08em] tw:text-content-muted tw:uppercase">
          {{ props.containerKind === 'folder' ? t('workspace.emptyFolderTitle', { folder: props.containerTitle }) : t('workspace.localWorkspace') }}
        </p>
        <h2 class="container-overview__title tw:m-0 tw:[font-family:var(--font-serif)] tw:text-[clamp(30px,4vw,44px)] tw:leading-[1.08] tw:font-normal tw:text-content-primary">{{ props.containerTitle }}</h2>
      </header>

      <div class="container-overview__list tw:mx-auto tw:flex tw:w-[min(100%,960px)] tw:flex-col tw:gap-2.5">
        <button
          v-for="item in props.containerItems"
          :key="item.meta.id"
          type="button"
          class="container-overview__item tw:flex tw:w-full tw:cursor-pointer tw:items-center tw:gap-3.5 tw:rounded-[calc(18px*var(--radius-scale,1))] tw:border tw:border-solid tw:border-transparent tw:bg-surface-subtle tw:px-[18px] tw:py-4 tw:text-left tw:text-content-primary tw:transition-[transform,border-color,background] tw:duration-120 tw:hover:-translate-y-px tw:hover:bg-[color-mix(in_oklab,var(--hover)_78%,transparent)] tw:max-[900px]:rounded-[calc(16px*var(--radius-scale,1))] tw:max-[900px]:px-4 tw:max-[900px]:py-3.5"
          :class="`container-overview__item--${item.kind}`"
          @click="item.kind === 'folder' ? emit('open-folder', item.meta.id) : emit('open-note', item.meta.id)"
        >
          <span class="container-overview__item-icon tw:inline-flex tw:h-[38px] tw:w-[38px] tw:shrink-0 tw:items-center tw:justify-center tw:gap-1 tw:rounded-[calc(12px*var(--radius-scale,1))] tw:bg-[color-mix(in_oklab,var(--accent-soft)_68%,transparent)] tw:text-content-secondary" aria-hidden="true">
            <NvNoteIcon v-if="item.kind === 'folder'" :value="item.meta.icon || '📁'" :size="18" />
            <NvNoteIcon v-else :value="item.meta.icon || '📄'" :size="18" />
          </span>
          <span class="container-overview__item-copy tw:flex tw:min-w-0 tw:flex-1 tw:flex-col tw:gap-0.5">
            <span class="container-overview__item-title tw:min-w-0 tw:truncate tw:text-[15px] tw:font-semibold">{{ item.kind === 'folder' ? item.meta.title : item.meta.title }}</span>
            <span class="container-overview__item-kind tw:text-xs tw:text-content-muted">
              {{ item.kind === 'folder' ? t('workspace.createFolder') : t('workspace.createNote') }}
            </span>
          </span>
          <ChevronRight :size="14" class="container-overview__item-arrow tw:shrink-0 tw:text-content-muted" aria-hidden="true" />
        </button>
      </div>
    </section>

    <div v-else-if="!note" class="editor-empty tw:m-auto tw:max-w-[520px] tw:p-5 tw:text-center">
      <h2 class="tw:m-0 tw:[font-family:var(--font-serif)] tw:text-[38px] tw:font-normal tw:text-content-primary">{{ isFolderEmptyState ? t('workspace.emptyFolderTitle', { folder: props.containerTitle }) : t('workspace.emptyTitle') }}</h2>
      <p class="tw:mt-2.5 tw:mb-5 tw:text-sm tw:leading-[1.6] tw:text-content-muted">{{ isFolderEmptyState ? t('workspace.emptyFolderSubtitle') : t('workspace.emptySubtitle') }}</p>
      <button class="nv-btn nv-btn--primary" @click="emit('create-note')">{{ t('workspace.createNote') }}</button>
    </div>

    <div v-else class="editor-doc tw:flex tw:min-h-0 tw:flex-1 tw:flex-col tw:overflow-hidden tw:bg-(--workspace-editor-surface)">
      <NoteBreadcrumb :note="note">
        <template #actions>
          <div data-hint="editorCanvas" class="note-view-switcher tw:inline-flex tw:min-h-8 tw:items-center tw:gap-0.5 tw:rounded-[10px] tw:border tw:border-solid tw:border-(--border-subtle) tw:bg-surface-subtle tw:p-[3px]" role="group" :aria-label="t('workspace.canvas.viewSwitcher')">
            <button
              type="button"
              class="tw:min-h-[26px] tw:rounded-[7px] tw:border-0 tw:px-[9px] tw:font-nv-ui tw:text-xs tw:hover:text-content-primary tw:focus-visible:outline-2 tw:focus-visible:outline-offset-1 tw:focus-visible:outline-accent tw:max-[719px]:min-h-[34px] tw:max-[719px]:min-w-[42px] tw:max-[719px]:px-2"
              :class="props.viewMode === 'document' ? 'note-view-switcher__button--active tw:bg-(--surface-elevated) tw:text-content-primary tw:shadow-(--shadow-sm)' : 'tw:bg-transparent tw:text-(--text-tertiary)'"
              @click="emit('change-view', 'document')"
            >
              {{ t('workspace.canvas.document') }}
            </button>
            <button
              type="button"
              class="tw:min-h-[26px] tw:rounded-[7px] tw:border-0 tw:px-[9px] tw:font-nv-ui tw:text-xs tw:hover:text-content-primary tw:focus-visible:outline-2 tw:focus-visible:outline-offset-1 tw:focus-visible:outline-accent tw:max-[719px]:min-h-[34px] tw:max-[719px]:min-w-[42px] tw:max-[719px]:px-2"
              :class="props.viewMode === 'canvas' ? 'note-view-switcher__button--active tw:bg-(--surface-elevated) tw:text-content-primary tw:shadow-(--shadow-sm)' : 'tw:bg-transparent tw:text-(--text-tertiary)'"
              @click="emit('change-view', 'canvas')"
            >
              {{ t('workspace.canvas.canvas') }}
            </button>
          </div>
          <NvPopupMenu
            v-model:open="breadcrumbMenuOpen"
            :items="breadcrumbMenuItems"
            placement="bottom-end"
            width="224px"
          >
            <template #trigger>
              <button
                type="button"
                class="breadcrumb-action-btn tw:grid tw:size-7 tw:cursor-pointer tw:place-items-center tw:rounded-[calc(8px*var(--radius-scale,1))] tw:border-0 tw:transition-[background,color] tw:duration-120"
                :class="breadcrumbMenuOpen ? 'breadcrumb-action-btn--active tw:bg-[color-mix(in_oklab,var(--accent)_12%,transparent)] tw:text-accent' : 'tw:bg-transparent tw:text-content-muted tw:hover:bg-(--hover) tw:hover:text-content-secondary'"
                :aria-label="t('onboarding.open.moreOptions')"
                :title="t('onboarding.open.moreOptions')"
              >
                <EllipsisVertical :size="14" />
              </button>
            </template>
          </NvPopupMenu>
        </template>
      </NoteBreadcrumb>

      <div class="editor-doc-body tw:flex tw:min-h-0 tw:flex-1 tw:overflow-hidden">
        <div
          ref="editorWrapEl"
          class="doc-body-wrap tw:relative tw:flex tw:min-h-0 tw:min-w-0 tw:flex-1 tw:flex-col tw:overflow-hidden"
          @mouseenter="onEditorMouseEnter"
          @mouseleave="onEditorMouseLeave"
        >
          <EditorFindBar
            v-if="props.viewMode === 'document'"
            v-model:query="findInNote.query.value"
            v-model:replacement="findInNote.replacement.value"
            v-model:case-sensitive="findInNote.caseSensitive.value"
            v-model:whole-word="findInNote.wholeWord.value"
            v-model:regex="findInNote.regex.value"
            :open="findInNote.open.value"
            :replace-open="findInNote.replaceOpen.value"
            :match-count="findInNote.matchCount.value"
            :active-index="findInNote.activeIndex.value"
            :has-error="findInNote.hasError.value"
            :error-reason="findInNote.errorReason.value"
            :truncated="findInNote.truncated.value"
            :focus-token="findInNote.focusToken.value"
            @next="findInNote.next"
            @prev="findInNote.prev"
            @replace="findInNote.replaceOne"
            @replace-all="findInNote.replaceAll"
            @toggle-replace="findInNote.replaceOpen.value = !findInNote.replaceOpen.value"
            @close="findInNote.close()"
          />
          <section
            ref="editorScrollEl"
            class="doc-body tw:m-0 tw:flex tw:min-h-0 tw:min-w-0 tw:w-full tw:flex-1 tw:flex-col tw:gap-3.5 tw:overflow-x-hidden tw:overflow-y-auto tw:overscroll-contain tw:pt-3.5 tw:pb-12 tw:max-[900px]:pt-4 tw:max-[900px]:pb-8"
            :class="editorBodyClasses"
            @scroll="handleEditorScroll"
          >
            <!-- Keyed per note: the canvas binds to one note's editor view, so
                 reusing the instance across a note switch would leave it
                 driving the previous note's editor. -->
            <EdgelessCanvasView
              v-if="props.viewMode === 'canvas' && props.note && props.workspaceId"
              :key="props.note.id"
              :note-id="props.note.id"
              :workspace-id="props.workspaceId"
              :title="props.note.title"
              :mirror="props.note.canvas"
              :asset-refresh-token="assetRefreshToken"
              :resolve-asset-src="resolveWorkspaceAssetSrc"
              :get-workspace-backend="() => workspaceStore.backend"
              :get-editor-view="() => core.editorView"
              :notes="canvasNoteOptions"
              @update:mirror="emit('update:canvas', $event)"
              @open-note="emit('open-note', $event)"
            />
            <DocAppearance
              ref="docAppearanceRef"
              :note-icon="noteIcon"
              :note-cover-style="noteCoverStyle"
              :cover="note?.cover"
              @select-icon="(icon) => emit('update:icon', icon)"
              @apply-gradient="(gradient) => updateCover(`gradient:${gradient}`)"
              @apply-pastel="(color) => updateCover(`color:${color}`)"
              @remove-cover="updateCover(null)"
              @request-cover-image="onRequestCoverImage"
            />
            <div class="doc-content tw:mx-auto tw:flex tw:w-[min(100%,var(--workspace-editor-line-width,760px))] tw:flex-col tw:gap-3.5 tw:px-16 tw:[font-family:var(--workspace-editor-font-family,var(--font-ui))] tw:max-[900px]:px-5" :style="editorContentStyle">
              <div class="doc-title-row tw:flex tw:flex-col tw:items-start tw:gap-3">
                <button
                  type="button"
                  class="doc-title-emoji tw:inline-flex tw:h-[58px] tw:w-[58px] tw:cursor-pointer tw:items-center tw:justify-center tw:rounded-[calc(18px*var(--radius-scale,1))] tw:border tw:border-solid tw:border-(--workspace-control-border) tw:bg-(--workspace-sidebar-header-surface) tw:text-content-primary tw:focus-visible:outline-2 tw:focus-visible:outline-offset-2 tw:focus-visible:outline-accent tw:max-[900px]:h-10 tw:max-[900px]:w-10"
                  :aria-label="noteIconButtonLabel"
                  @click="docAppearanceRef?.openIconPicker()"
                >
                  <NvNoteIcon :value="noteIcon" :size="36" />
                </button>
                <textarea
                  ref="titleInputRef"
                  class="doc-title tw:min-w-0 tw:w-full tw:resize-none tw:overflow-hidden tw:border-0 tw:bg-transparent tw:px-0 tw:py-1 tw:font-nv-ui tw:text-[clamp(34px,3vw,44px)] tw:leading-[1.12] tw:font-[650] tw:tracking-[-0.035em] tw:text-content-primary tw:outline-none tw:placeholder:text-content-muted"
                  rows="1"
                  :value="note.title"
                  :placeholder="t('workspace.titlePlaceholder')"
                  @input="onTitleInput"
                  @keydown="onTitleKeyDown"
                />
              </div>
              <div
                ref="editorRoot"
                class="doc-editor tw:min-h-[280px] tw:w-full tw:flex-1"
                :class="{ 'colored-headings': props.settings.appearance.accentColoredHeadings }"
                :aria-label="t('workspace.contentPlaceholder')"
                @dragover="imageUpload.onEditorDragOver"
                @drop="imageUpload.onEditorDrop"
              />
            </div>
          </section>

          <div v-if="editorWordCount" class="editor-stats-corner tw:pointer-events-none tw:absolute tw:right-[18px] tw:bottom-3 tw:z-2 tw:flex tw:select-none tw:items-center tw:gap-1 tw:rounded-[calc(6px*var(--radius-scale,1))] tw:border tw:border-solid tw:border-transparent tw:bg-surface-subtle tw:px-2 tw:py-[3px] tw:font-nv-mono tw:text-[11px] tw:text-content-muted" aria-hidden="true">
            <span>{{ editorWordCount.words }} w</span>
            <span class="editor-stats-sep tw:opacity-50">·</span>
            <span>{{ editorWordCount.chars }} ch</span>
          </div>

          <div
            v-show="!isTouch && scrollbarScrollable"
            class="editor-scrollbar tw:absolute tw:top-2 tw:right-[3px] tw:bottom-3 tw:w-1.5 tw:opacity-0 tw:transition-opacity tw:duration-140 tw:max-[900px]:right-0.5 tw:motion-reduce:transition-none"
            :class="{
              'editor-scrollbar--visible': scrollbarVisible,
              'editor-scrollbar--dragging': scrollbarDragging,
            }"
            :style="[scrollbarInteractivityStyle, scrollbarPositionStyle]"
          >
            <div
              ref="scrollbarTrackEl"
              class="editor-scrollbar__track tw:relative tw:h-full tw:w-full tw:rounded-full tw:bg-[color-mix(in_oklab,var(--text-secondary)_5%,transparent)]"
              aria-hidden="true"
              @mousedown="onScrollbarTrackMouseDown"
            >
              <div
                class="editor-scrollbar__thumb tw:absolute tw:top-0 tw:left-0 tw:w-full tw:cursor-grab tw:rounded-full tw:border-0 tw:bg-[color-mix(in_oklab,var(--text-secondary)_35%,transparent)] tw:p-0 tw:transition-colors tw:duration-120 tw:hover:bg-[color-mix(in_oklab,var(--text-secondary)_55%,transparent)] tw:motion-reduce:transition-none"
                :style="scrollbarStyle"
                aria-hidden="true"
                @mousedown="onScrollbarThumbMouseDown"
              />
            </div>
          </div>
        </div>

        <LocalGraphPanel
          v-if="localGraphOpen"
          :note="note"
          @close="localGraphOpen = false"
          @open-note="emit('open-note', $event)"
        />
      </div>
    </div>

    <input
      ref="imageInputRef"
      class="image-file-input tw:hidden"
      type="file"
      accept="image/*"
      @change="imageUpload.onImageInputChange"
    />
    <input
      ref="coverImageInputRef"
      class="image-file-input tw:hidden"
      type="file"
      accept="image/*"
      @change="onCoverImageInputChange"
    />
    <input
      ref="fileInputRef"
      class="image-file-input tw:hidden"
      type="file"
      @change="fileUpload.onFileInputChange"
    />


    <AiAskModal
      v-model="aiAskValue"
      :open="aiAskOpen"
      @confirm="confirmAiAsk"
      @cancel="cancelAiAsk"
    />

    <NvPopupMenu
      v-model:open="editorCtxMenu.open"
      :position="editorCtxMenu.pos"
      :items="editorMenuItems"
      width="192px"
    />

    <NvPopupMenu
      v-model:open="imageCtxMenu.open"
      :position="imageCtxMenu.pos"
      :items="imageMenuItems"
      width="192px"
    />

    <NoteEmbedPicker
      ref="noteEmbedPickerRef"
      :state="noteEmbedPicker"
      :notes="noteEmbedFilteredNotes"
      @update:query="noteEmbedPicker.query = $event"
      @select="selectNoteForEmbed"
    />

    <MobileEditorTabBar
      v-if="showMobileEditorTabBar"
      @command="editorSetup.executeCommandById"
      @open-block-menu="openMobileBlockMenu"
      @open-link="openMobileLinkPopover"
      @request-image="requestMobileImage"
    />
  </main>

  <EditorOverlayContainer
    ref="overlayContainerRef"
    :slash-overlay="slashOverlay"
    :toolbar-overlay="toolbarOverlay"
    :table-menu-overlay="tableMenuOverlay"
    :link-popover="linkPopover"
    :highlight-picker="highlightPicker"
    :text-color-picker="textColorPicker"
    :math-popover="mathPopover"
    :formula-popover="formulaPopover"
    :mermaid-popover="mermaidPopover"
    :query-popover="queryPopover"
    :markmap-popover="markmapPopover"
    :vega-popover="vegaPopover"
    :plugin-node-popover="pluginNodePopover"
    :embed-url-popover="embedUrlPopover"
    :link-picker-overlay="linkPickerOverlay"
    :callout-icon-picker="calloutIconPicker"
    :block-handle="blockHandle"
    :active-mark-names="activeMarkNames"
    :is-touch="isTouch"
    :plugin-actions="core.toolbarPluginActions"
    :current-note-id="props.note?.id"
    :slash-emoji-picker-open="slashEmojiPickerOpen"
    :slash-menu-layout="props.settings.editor.slashMenuLayout"
    :handlers="overlayHandlers"
  />

  <TemplatePickerModal
    :open="insertTemplatePickerOpen"
    mode="insert"
    :workspace-path="props.workspacePath"
    :workspace-name="props.workspaceName"
    :note-title="props.note?.title"
    @close="insertTemplatePickerOpen = false"
    @use="insertResolvedTemplate"
  />
</template>

<style scoped>
@media (max-width: 719px) {
  .editor-pane--mobile-tab-bar .doc-body {
    padding-bottom:
      calc(
        124px
        + max(var(--safe-area-bottom), 0px)
        + var(--mobile-keyboard-inset, 0px)
      );
    scroll-padding-bottom:
      calc(
        124px
        + max(var(--safe-area-bottom), 0px)
        + var(--mobile-keyboard-inset, 0px)
      );
  }

  .editor-pane--mobile-tab-bar .editor-stats-corner {
    bottom:
      calc(
        96px
        + max(var(--safe-area-bottom), 0px)
        + var(--mobile-keyboard-inset, 0px)
      );
  }

}
</style>
