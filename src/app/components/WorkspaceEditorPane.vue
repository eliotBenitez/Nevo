<script setup lang="ts">
import { computed, defineAsyncComponent, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { SaveStatus } from '../../stores/note'
import type { NoteDocument } from '../../types/note'
import type { CanvasSnapshotV1 } from '../../core/canvas'
import type { NoteViewMode } from '../../features/canvas/canvasPreferences'
import type { PluginManifest, WorkspaceSettings } from '../../types/workspace'
import type { NevoSandboxUiContributionSnapshot } from '../../types/editor-plugin'
import NvNoteIcon from '../../ui/primitives/NvNoteIcon.vue'
import { createEditorCore } from '../composables/editor/useEditorCore'
import { useGraphStore } from '../../stores/graph'
import { useTreeStore } from '../../stores/tree'
import { useWorkspaceStore } from '../../stores/workspace'
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
import { useEmbedUrlPopover } from '../composables/editor/useEmbedUrlPopover'
import { useNoteEmbedPicker } from '../composables/editor/useNoteEmbedPicker'
import { useCalloutIconPicker } from '../composables/editor/useCalloutIconPicker'
import { useEditorDocStats } from '../composables/editor/useEditorDocStats'
import { useImageUpload } from '../composables/editor/useImageUpload'
import { useFileUpload } from '../composables/editor/useFileUpload'
import { useMediaUpload } from '../composables/editor/useMediaUpload'
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
import { createWorkspaceEditorOverlayHandlers } from '../composables/editor/createWorkspaceEditorOverlayHandlers'
import NvPopupMenu from '../../ui/primitives/NvPopupMenu.vue'
import DocAppearance from './editor/DocAppearance.vue'
import AiAskModal from './editor/AiAskModal.vue'
import NoteEmbedPicker from './editor/NoteEmbedPicker.vue'
import EditorOverlayContainer from './editor/EditorOverlayContainer.vue'
import MobileEditorTabBar from './editor/MobileEditorTabBar.vue'
import type { WorkspaceBlockNavigationTarget } from '../../types/search'
import LocalGraphPanel from '../../features/graph/LocalGraphPanel.vue'
import { ChevronRight, EllipsisVertical } from 'lucide-vue-next'
import type { TreeNode } from '../../types/note'
import NoteBreadcrumb from './NoteBreadcrumb.vue'
import { useCollabStore } from '../../stores/collab'
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
const collabStore = useCollabStore()

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
const assetActions = useEditorAssetActions({
  getWorkspacePath: () => props.workspacePath,
  getBackend: () => workspaceStore.backend,
  getCover: () => props.note?.cover,
  emitCover: (cover) => emit('update:cover', cover),
  clickCoverInput: () => coverImageInputRef.value?.click(),
})
const {
  cloudAssetRefreshToken,
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

// Overlays
const overlays = useEditorOverlays(core, {
  getSlashMenuEl: () => overlayContainerRef.value?.slashMenuEl ?? null,
  getToolbarEl: () => overlayContainerRef.value?.toolbarEl ?? null,
  getTableMenuEl: () => overlayContainerRef.value?.tableMenuEl ?? null,
  getLinkPickerEl: () => overlayContainerRef.value?.linkPickerEl ?? null,
})
const { slashOverlay, toolbarOverlay, tableMenuOverlay, linkPopover, highlightPicker, textColorPicker, mathPopover, formulaPopover, mermaidPopover, queryPopover, markmapPopover, vegaPopover, pluginNodePopover, linkPickerOverlay, activeMarkNames } = overlays

const { imageCtxMenu, imageMenuItems, openImageContextMenu } = useImageContextMenu(() => props.workspacePath)

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
const mediaUpload = useMediaUpload(core, () => props.workspacePath, overlays.updateOverlays, () => workspaceStore.backend)
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
  onTransactionDoc,
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
  pickAndInsertFile: fileUpload.pickAndInsertFile,
  requestFileInput: () => fileInputRef.value?.click(),
  openFileAsset,
  requestMediaPicker: mediaUpload.requestMediaPicker,
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
  const { from, to } = view.state.selection
  view.dispatch(view.state.tr.insertText('/', from, to).scrollIntoView())
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
} = useWorkspaceEditorPresentation({
  getNote: () => props.note,
  getSettings: () => props.settings,
  getContainerKind: () => props.containerKind,
  getContainerItems: () => props.containerItems,
  getScrollbarDragging: () => scrollbarDragging.value,
  workspaceAssetRefreshToken: cloudAssetRefreshToken,
  resolveWorkspaceAssetSrc,
  titleInputRef,
  localGraphOpen,
  translate: (key) => t(key),
  emitTitle: (title) => emit('update:title', title),
  requestExport: (format) => emit('request-export', format),
  requestMarkdownImport: () => emit('request-import-md'),
})

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
  getCollabSessionNoteId: () => collabStore.sessionNoteId,
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
  leaveCollabSession: collabStore.leaveSession,
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

defineExpose({ editorRoot, flushPendingContent, flushYjsPersistence: editorSetup.flushYjsPersistenceNow, updateDrawBlock, dispatchPluginUiEvent })
</script>

<template>
  <main
    class="editor-pane"
    :class="{
      'editor-pane--with-graph': localGraphOpen && note,
      'editor-pane--focus-soft': props.settings.editor.focusMode === 'soft',
      'editor-pane--canvas': props.viewMode === 'canvas' && note,
      'editor-pane--mobile-tab-bar': showMobileEditorTabBar,
    }"
  >
    <section v-if="showContainerOverview" class="container-overview">
      <header class="container-overview__header">
        <p class="container-overview__eyebrow">
          {{ props.containerKind === 'folder' ? t('workspace.emptyFolderTitle', { folder: props.containerTitle }) : t('workspace.localWorkspace') }}
        </p>
        <h2 class="container-overview__title">{{ props.containerTitle }}</h2>
      </header>

      <div class="container-overview__list">
        <button
          v-for="item in props.containerItems"
          :key="item.meta.id"
          type="button"
          class="container-overview__item"
          :class="`container-overview__item--${item.kind}`"
          @click="item.kind === 'folder' ? emit('open-folder', item.meta.id) : emit('open-note', item.meta.id)"
        >
          <span class="container-overview__item-icon" aria-hidden="true">
            <NvNoteIcon v-if="item.kind === 'folder'" :value="item.meta.icon || '📁'" :size="18" />
            <NvNoteIcon v-else :value="item.meta.icon || '📄'" :size="18" />
          </span>
          <span class="container-overview__item-copy">
            <span class="container-overview__item-title">{{ item.kind === 'folder' ? item.meta.title : item.meta.title }}</span>
            <span class="container-overview__item-kind">
              {{ item.kind === 'folder' ? t('workspace.createFolder') : t('workspace.createNote') }}
            </span>
          </span>
          <ChevronRight :size="14" class="container-overview__item-arrow" aria-hidden="true" />
        </button>
      </div>
    </section>

    <div v-else-if="!note" class="editor-empty">
      <h2>{{ isFolderEmptyState ? t('workspace.emptyFolderTitle', { folder: props.containerTitle }) : t('workspace.emptyTitle') }}</h2>
      <p>{{ isFolderEmptyState ? t('workspace.emptyFolderSubtitle') : t('workspace.emptySubtitle') }}</p>
      <button class="nv-btn nv-btn--primary" @click="emit('create-note')">{{ t('workspace.createNote') }}</button>
    </div>

    <div v-else class="editor-doc">
      <NoteBreadcrumb :note="note">
        <template #actions>
          <div class="note-view-switcher" role="group" :aria-label="t('workspace.canvas.viewSwitcher')">
            <button
              type="button"
              :class="{ 'note-view-switcher__button--active': props.viewMode === 'document' }"
              @click="emit('change-view', 'document')"
            >
              {{ t('workspace.canvas.document') }}
            </button>
            <button
              type="button"
              :class="{ 'note-view-switcher__button--active': props.viewMode === 'canvas' }"
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
                class="breadcrumb-action-btn"
                :class="{ 'breadcrumb-action-btn--active': breadcrumbMenuOpen }"
                :aria-label="t('onboarding.open.moreOptions')"
                :title="t('onboarding.open.moreOptions')"
              >
                <EllipsisVertical :size="14" />
              </button>
            </template>
          </NvPopupMenu>
        </template>
      </NoteBreadcrumb>

      <div class="editor-doc-body">
        <div
          ref="editorWrapEl"
          class="doc-body-wrap"
          @mouseenter="onEditorMouseEnter"
          @mouseleave="onEditorMouseLeave"
        >
          <section
            ref="editorScrollEl"
            class="doc-body"
            :class="editorBodyClasses"
            @scroll="handleEditorScroll"
          >
            <!-- Keyed per note: the canvas binds to one note's Y.Doc and editor
                 view, so reusing the instance across a note switch would leave
                 it driving the previous note's document. -->
            <EdgelessCanvasView
              v-if="props.viewMode === 'canvas' && props.note && props.workspaceId"
              :key="props.note.id"
              :note-id="props.note.id"
              :workspace-id="props.workspaceId"
              :title="props.note.title"
              :mirror="props.note.canvas"
              :asset-refresh-token="cloudAssetRefreshToken"
              :resolve-asset-src="resolveWorkspaceAssetSrc"
              :get-workspace-backend="() => workspaceStore.backend"
              :get-editor-view="() => core.editorView"
              :get-y-doc="() => core.ydoc"
              :get-awareness="() => core.awareness"
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
            <div class="doc-content" :style="editorContentStyle">
              <div class="doc-title-row">
                <button
                  type="button"
                  class="doc-title-emoji"
                  :aria-label="noteIconButtonLabel"
                  @click="docAppearanceRef?.openIconPicker()"
                >
                  <NvNoteIcon :value="noteIcon" :size="36" />
                </button>
                <textarea
                  ref="titleInputRef"
                  class="doc-title"
                  rows="1"
                  :value="note.title"
                  :placeholder="t('workspace.titlePlaceholder')"
                  @input="onTitleInput"
                />
              </div>
              <div
                ref="editorRoot"
                class="doc-editor"
                :class="{ 'colored-headings': props.settings.appearance.accentColoredHeadings }"
                :aria-label="t('workspace.contentPlaceholder')"
                @dragover="imageUpload.onEditorDragOver"
                @drop="imageUpload.onEditorDrop"
              />
            </div>
          </section>

          <div v-if="editorWordCount" class="editor-stats-corner" aria-hidden="true">
            <span>{{ editorWordCount.words }} w</span>
            <span class="editor-stats-sep">·</span>
            <span>{{ editorWordCount.chars }} ch</span>
          </div>

          <div
            v-show="!isTouch && scrollbarScrollable"
            class="editor-scrollbar"
            :class="{
              'editor-scrollbar--visible': scrollbarVisible,
              'editor-scrollbar--dragging': scrollbarDragging,
            }"
            :style="[scrollbarInteractivityStyle, scrollbarPositionStyle]"
          >
            <div
              ref="scrollbarTrackEl"
              class="editor-scrollbar__track"
              aria-hidden="true"
              @mousedown="onScrollbarTrackMouseDown"
            >
              <div
                class="editor-scrollbar__thumb"
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
      class="image-file-input"
      type="file"
      accept="image/*"
      @change="imageUpload.onImageInputChange"
    />
    <input
      ref="coverImageInputRef"
      class="image-file-input"
      type="file"
      accept="image/*"
      @change="onCoverImageInputChange"
    />
    <input
      ref="fileInputRef"
      class="image-file-input"
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
.note-view-switcher {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  min-height: 32px;
  padding: 3px;
  border: 1px solid var(--border-subtle);
  border-radius: 10px;
  background: var(--surface-subtle);
}

.note-view-switcher button {
  min-height: 26px;
  padding: 0 9px;
  border: 0;
  border-radius: 7px;
  color: var(--text-tertiary);
  font: inherit;
  font-size: 12px;
  background: transparent;
}

.note-view-switcher button:hover {
  color: var(--text-primary);
}

.note-view-switcher button:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}

.note-view-switcher__button--active {
  color: var(--text-primary) !important;
  background: var(--surface-elevated) !important;
  box-shadow: var(--shadow-sm);
}

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

  .note-view-switcher button {
    min-width: 42px;
    min-height: 34px;
    padding: 0 8px;
  }
}
</style>
