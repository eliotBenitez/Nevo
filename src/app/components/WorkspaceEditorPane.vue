<script setup lang="ts">
import { computed, markRaw, nextTick, onBeforeUnmount, onMounted, ref, toRaw, watch, type CSSProperties } from 'vue'
import type { EditorView } from 'prosemirror-view'
import { TextSelection } from 'prosemirror-state'
import { useI18n } from 'vue-i18n'
import { convertFileSrc } from '@tauri-apps/api/core'
import { openPath } from '@tauri-apps/plugin-opener'
import { noteCommands, workspaceCommands } from '../../tauri/commands'
import { mediaHttpUrl } from '../../tauri/mediaServer'
import { appLogger } from '../../utils/logger'
import type { SaveStatus } from '../../stores/note'
import type { NoteDocument } from '../../types/note'
import type { TemplateDocument, TemplateFieldValues } from '../../types/template'
import type { PluginManifest, WorkspaceSettings } from '../../types/workspace'
import type { NevoToolbarAction } from '../../types/editor-plugin'
import NvNoteIcon from '../../ui/primitives/NvNoteIcon.vue'
import { resolveEditorFontFamilyCss, EDITOR_LINE_WIDTHS } from '../../utils/workspace-settings'
import { createEditorCore, useEditorCore } from '../composables/editor/useEditorCore'
import { getLinkPickerState, parseWikiQuery } from '../../editor-core'
import { useGraphStore } from '../../stores/graph'
import { useTreeStore } from '../../stores/tree'
import { useWorkspaceStore } from '../../stores/workspace'
import { CloudBackend, CLOUD_ASSET_SCHEME } from '../../core/workspace-backend'
import { useEditorOverlays } from '../composables/editor/useEditorOverlays'
import { useMathEditor } from '../composables/editor/useMathEditor'
import { useFormulaEditor } from '../composables/editor/useFormulaEditor'
import { useMermaidEditor } from '../composables/editor/useMermaidEditor'
import { usePluginNodePopover } from '../composables/editor/usePluginNodePopover'
import { useMarkmapEditor } from '../composables/editor/useMarkmapEditor'
import { useVegaEditor } from '../composables/editor/useVegaEditor'
import { useLinkEditor } from '../composables/editor/useLinkEditor'
import { useImageContextMenu } from '../composables/editor/useImageContextMenu'
import { useEmbedUrlPopover } from '../composables/editor/useEmbedUrlPopover'
import { useNoteEmbedPicker } from '../composables/editor/useNoteEmbedPicker'
import { useCalloutIconPicker } from '../composables/editor/useCalloutIconPicker'
import { useEditorDocStats } from '../composables/editor/useEditorDocStats'
import { normalizeIcon, resolveCoverSource, resolveCoverStyle } from '../composables/editor/editorCoverStyle'
import { blockNode } from '../../utils/noteExport/htmlSerializer'
import { useImageUpload } from '../composables/editor/useImageUpload'
import { useFileUpload } from '../composables/editor/useFileUpload'
import { useMediaUpload } from '../composables/editor/useMediaUpload'
import { useBlockHandle } from '../composables/editor/useBlockHandle'
import { useDeviceLayout } from '../../composables/useDeviceLayout'
import { useEditorScrollbar } from '../composables/editor/useEditorScrollbar'
import { useNotePreload } from '../composables/editor/useNotePreload'
import NvPopupMenu from '../../ui/primitives/NvPopupMenu.vue'
import type { NvMenuItemDef } from '../../ui/primitives/menu-types'
import DocAppearance from './editor/DocAppearance.vue'
import EditorOverlayContainer from './editor/EditorOverlayContainer.vue'
import type { OverlayHandlers } from './editor/EditorOverlayContainer.vue'
import { focusBlockSearchTarget } from './editor/blockNavigation'
import type { WorkspaceBlockNavigationTarget } from '../../types/search'
import LocalGraphPanel from '../../features/graph/LocalGraphPanel.vue'
import TemplatePickerModal from './templates/TemplatePickerModal.vue'
import { resolveTemplateContent } from '../../utils/templates'
import { ChevronRight, Download, EllipsisVertical, Network, Upload } from 'lucide-vue-next'
import type { TreeNode } from '../../types/note'
import NoteBreadcrumb from './NoteBreadcrumb.vue'
import { useCollabStore } from '../../stores/collab'

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
}

const props = withDefaults(defineProps<Props>(), {
  workspaceName: '',
  pendingBlockTarget: undefined,
  pendingDrawUpdate: undefined,
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
  'request-export': [format: 'markdown' | 'html' | 'typst' | 'pdf']
  'request-import-md': []
  'open-draw': [noteId: string, drawId: string]
}>()

function emitOpenDraw(drawId: string) {
  if (drawId && props.note?.id) emit('open-draw', props.note.id, drawId)
}

const { t, locale } = useI18n()

interface OverlayContainerInstance {
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
const noteEmbedPickerRef = ref<HTMLDivElement | null>(null)

const localGraphOpen = ref(false)
const breadcrumbMenuOpen = ref(false)
const collabStore = useCollabStore()

let hasInitializedPluginHost = false
let lastAppliedPendingBlockTargetKey: string | null = null
let pendingBlockTargetApplicationKey: string | null = null

// Core mutable state (non-reactive intentionally)
const core = createEditorCore()
const graphStore = useGraphStore()
const treeStore = useTreeStore()
const workspaceStore = useWorkspaceStore()
const cloudAssetRefreshToken = ref(0)
const pendingCloudAssetPrefetches = new Set<string>()

/** Cloud asset src → object URL, resolved sync from the CloudBackend cache.
 *  Covers invalidate when prefetch fills the cache; image node-views retry independently. */
function resolveCloudAsset(src: string): string {
  const cloud = workspaceStore.backend
  if (!(cloud instanceof CloudBackend)) return ''
  const cached = cloud.assetUrl(src)
  if (cached) return cached
  if (!pendingCloudAssetPrefetches.has(src)) {
    pendingCloudAssetPrefetches.add(src)
    void cloud.prefetchAsset(src).then(() => {
      if (cloud.assetUrl(src)) cloudAssetRefreshToken.value += 1
    }).finally(() => {
      pendingCloudAssetPrefetches.delete(src)
    })
  }
  return ''
}

function resolveWorkspaceAssetSrc(src: string): string | null {
  if (src.startsWith(CLOUD_ASSET_SCHEME)) return resolveCloudAsset(src) || null
  const wp = props.workspacePath
  if (!wp) return null
  return convertFileSrc(`${wp}/${src}`)
}
const blockHandleComposable = useBlockHandle(core, {
  getHandleBoundaryEl: () => editorScrollEl.value ?? editorWrapEl.value ?? editorRoot.value,
  getTypeMenuBoundaryEl: () => editorScrollEl.value ?? editorWrapEl.value ?? editorRoot.value,
  getTypeMenuEl: () => overlayContainerRef.value?.blockTypeMenuEl ?? null,
})
const { blockHandle } = blockHandleComposable
const { isTouch, supportsHover } = useDeviceLayout()

// Overlays
const overlays = useEditorOverlays(core, {
  getSlashMenuEl: () => overlayContainerRef.value?.slashMenuEl ?? null,
  getToolbarEl: () => overlayContainerRef.value?.toolbarEl ?? null,
  getTableMenuEl: () => overlayContainerRef.value?.tableMenuEl ?? null,
  getLinkPickerEl: () => overlayContainerRef.value?.linkPickerEl ?? null,
})
const { slashOverlay, toolbarOverlay, tableMenuOverlay, linkPopover, highlightPicker, textColorPicker, mathPopover, formulaPopover, mermaidPopover, markmapPopover, vegaPopover, pluginNodePopover, linkPickerOverlay, activeMarkNames } = overlays

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
  { getNoteEmbedPickerEl: () => noteEmbedPickerRef.value },
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
const notePreload = useNotePreload()

const insertTemplatePickerOpen = ref(false)

// AI Ask modal state
const aiAskOpen = ref(false)
const aiAskValue = ref('')
let aiAskResolver: ((v: string) => void) | null = null

function confirmAiAsk() {
  aiAskResolver?.(aiAskValue.value)
  aiAskOpen.value = false
  aiAskResolver = null
}

function cancelAiAsk() {
  aiAskOpen.value = false
  aiAskResolver = null
}

function onAiAskKeyDown(event: KeyboardEvent) {
  if (event.key === 'Enter') {
    event.preventDefault()
    confirmAiAsk()
  } else if (event.key === 'Escape') {
    event.preventDefault()
    cancelAiAsk()
  }
}

const TYPEWRITER_POSITION_RATIO: Record<string, number> = { upper: 0.30, center: 0.50, lower: 0.68 }

let pendingAssetCleanup = false
const pendingCoverAssetCleanup = new Set<string>()

function flushPendingContent() {
  editorSetup.flushPendingContentUpdate()
}

function onAfterTransaction(view: EditorView) {
  if (props.settings.editor.typewriterScrolling) {
    const { selection } = view.state
    if (selection instanceof TextSelection && selection.$cursor) {
      const scrollEl = editorScrollEl.value
      if (scrollEl) {
        const coords = view.coordsAtPos(selection.$cursor.pos)
        const rect = scrollEl.getBoundingClientRect()
        const ratio = TYPEWRITER_POSITION_RATIO[props.settings.editor.typewriterPosition] ?? 0.68
        const delta = coords.top - (rect.top + rect.height * ratio)
        if (Math.abs(delta) > 32) scrollEl.scrollBy({ top: delta, behavior: 'smooth' })
      }
    }
  }
  onTransactionDoc(view.state.doc)
}

// Editor setup with callbacks
const editorSetup = useEditorCore(core, {
  onOverlaysUpdate: overlays.updateOverlays,
  onCloseOverlays: () => {
    overlays.closeOverlays()
    closeSlashEmojiPicker()
    closeEmbedUrlPopover()
  },
  onContentUpdate: (content) => {
    if (core.lastLoadedNoteId === props.note?.id) emit('update:content', content)
  },
  onDocDirty: () => {
    if (core.lastLoadedNoteId === props.note?.id) emit('content-dirty')
  },
  onAfterTransaction,
  onDocChanged: scheduleGraphUpdate,
  onAssetSrcsRemoved: () => { pendingAssetCleanup = true },
  onInternalLinkOpen: (noteId, anchor) => {
    if (!treeStore.noteById.get(noteId)) return
    emit('open-note', noteId, anchor)
  },
  internalLinkExists: (noteId) => treeStore.noteById.has(noteId),
  resolveWikiLink: (title) => treeStore.resolveNoteIdByTitle(title),
  resolveAssetSrc: (src) => {
    if (/^(https?|data|blob):/.test(src)) return src
    if (src.startsWith(CLOUD_ASSET_SCHEME)) return resolveCloudAsset(src)
    const wp = props.workspacePath
    if (!wp) return src
    return convertFileSrc(`${wp}/${src}`)
  },
  resolveMediaSrc: (src) => {
    if (/^(https?|data|blob):/.test(src)) return src
    if (src.startsWith(CLOUD_ASSET_SCHEME)) return resolveCloudAsset(src) || null
    const wp = props.workspacePath
    if (!wp) return null
    return mediaHttpUrl(`${wp}/${src}`)
  },
  onImagePickerRequest: (pos) => {
    if (backendSupportsPathImport()) {
      void imageUpload.pickAndInsertImage(pos)
    } else {
      core.pendingImageTargetPos = pos
      imageInputRef.value?.click()
    }
  },
  onImageContextMenuRequest: (ctx) => {
    openImageContextMenu(ctx)
  },
  onFilePickerRequest: (pos) => {
    if (backendSupportsPathImport()) {
      void fileUpload.pickAndInsertFile(pos)
    } else {
      core.pendingFileTargetPos = pos
      fileInputRef.value?.click()
    }
  },
  onFileOpenRequest: (src) => {
    void openFileAsset(src)
  },
  onMediaPickerRequest: (pos, kind) => {
    mediaUpload.requestMediaPicker(pos, kind)
  },
  onNoteEmbedPickRequest: (pos, anchorRect) => {
    openNoteEmbedPicker(pos, anchorRect)
  },
  onEmbedUrlRequest: (pos, anchorRect) => {
    openEmbedUrlPopover(pos, anchorRect)
  },
  onNoteEmbedContentLoad: async ({ noteId, setHtml, setLoading }) => {
    setLoading(true)
    try {
      const workspacePath = props.workspacePath
      if (!workspacePath) throw new Error('No workspace')
      const doc = await noteCommands.loadNote(workspacePath, noteId)
      const ctx = { assetSrcs: [] as string[], assetsSubfolderName: '__EMBED__' }
      const rawHtml = await blockNode(doc.content, ctx)
      // Resolve local asset paths to Tauri asset:// URLs so images render inline
      const html = ctx.assetSrcs.length === 0 ? rawHtml : rawHtml.replace(
        /\bsrc="__EMBED__\/([^"]+)"/g,
        (_, filename: string) => {
          const original = ctx.assetSrcs.find(s => s.endsWith(filename)) ?? filename
          return `src="${convertFileSrc(`${workspacePath}/${original}`)}"`
        },
      )
      setHtml(html || '')
    } catch {
      setHtml('<p class="nv-embed-error">Failed to load preview</p>')
    } finally {
      setLoading(false)
    }
  },
  onNoteEmbedOpen: (noteId) => {
    if (!treeStore.noteById.get(noteId)) return
    emit('open-note', noteId)
  },
  onMathEditRequest: (pos, rect) => mathEditor.openMathPopoverForNode(pos, rect),
  onFormulaEditRequest: (cellPos, _formula, rect) => formulaEditor.openFormulaPopoverForCell(cellPos, rect),
  onMermaidEditRequest: (pos, rect) => mermaidEditor.openMermaidPopoverForNode(pos, rect),
  onPluginNodeEditRequest: (pos, nodeName, rect) => pluginNodeEditor.openForNode(pos, nodeName, rect),
  onMarkmapEditRequest: (pos, rect) => markmapEditor.openMarkmapPopoverForNode(pos, rect),
  onVegaEditRequest: (pos, rect) => vegaEditor.openVegaPopoverForNode(pos, rect),
  onDrawOpen: (drawId) => emitOpenDraw(drawId),
  onLinkPickerEnter: () => overlayContainerRef.value?.linkPickerComp?.selectActive() ?? false,
  onMathInlineInsert: () => mathEditor.insertInlineMathAndEdit(),
  onMathBlockInsert: () => mathEditor.insertBlockMathAndEdit(),
  onSlashMathItemRan: () => mathEditor.openSelectedMathPopover(),
  onSlashEmojiPickRequest: () => openSlashEmojiPicker(),
  onCalloutIconPickRequest: (pos, rect, icon) => {
    openCalloutIconPicker(pos, rect, icon)
  },
  onTemplateInsertRequest: () => {
    insertTemplatePickerOpen.value = true
  },
  onAiAskRequest: (submit) => {
    aiAskResolver = submit
    aiAskValue.value = ''
    aiAskOpen.value = true
  },
})

// Highlight/text color pickers (imported from editorColors.ts)

function applyHighlight(color: string) {
  if (!core.coreCommands) return
  editorSetup.executeStateCommand(core.coreCommands.toggleHighlight(color))
  highlightPicker.open = false
}

function removeHighlight() {
  if (!core.coreCommands) return
  editorSetup.executeStateCommand(core.coreCommands.removeHighlight)
  highlightPicker.open = false
}

function applyTextColor(color: string) {
  if (!core.coreCommands) return
  editorSetup.executeStateCommand(core.coreCommands.toggleTextColor(color))
  textColorPicker.open = false
}

function removeTextColor() {
  if (!core.coreCommands) return
  editorSetup.executeStateCommand(core.coreCommands.removeTextColor)
  textColorPicker.open = false
}

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

function openHighlightPicker() {
  if (!toolbarOverlay.visible) return
  textColorPicker.open = false
  highlightPicker.open = !highlightPicker.open
  highlightPicker.position = { top: toolbarOverlay.position.top + 36, left: toolbarOverlay.position.left }
}

function openTextColorPicker() {
  if (!toolbarOverlay.visible) return
  highlightPicker.open = false
  textColorPicker.open = !textColorPicker.open
  textColorPicker.position = { top: toolbarOverlay.position.top + 36, left: toolbarOverlay.position.left }
}

// Table commands
function applyTableCellAlignment(alignment: string | null) {
  if (!core.coreCommands) return
  editorSetup.executeStateCommand(core.coreCommands.setTableCellAlignment(alignment as 'left' | 'center' | 'right' | 'justify' | null))
}

function applyTableCellBackground(color: string | null) {
  if (!core.coreCommands) return
  editorSetup.executeStateCommand(core.coreCommands.setTableCellBackground(color))
}

function applyTableCellAttr(name: string, value: string | null) {
  if (!core.coreCommands) return
  editorSetup.executeStateCommand(core.coreCommands.setTableCellAttr(name, value))
}

function openTableCellFormula() {
  const cellPos = tableMenuOverlay.context?.activeCell?.pos
  if (typeof cellPos !== 'number') return
  formulaEditor.openFormulaPopoverForCell(cellPos)
}

// Plugin toolbar
function runPluginAction(action: NevoToolbarAction) {
  editorSetup.runPluginToolbarAction(action)
}

// Local backends import assets via a filesystem path (Rust reads the file
// off-thread). Cloud backends and image drag-and-drop fall back to bytes-over-IPC.
function backendSupportsPathImport(): boolean {
  return workspaceStore.backend?.handle.kind === 'local'
}

async function openFileAsset(src: string) {
  const workspacePath = props.workspacePath
  if (!workspacePath || !src.startsWith('.nevo/assets/')) return
  try {
    const fullPath = `${workspacePath}/${src}`
    try {
      // First attempt using standard Tauri opener plugin
      await openPath(fullPath)
    } catch {
      // If blocked by security scope (common in Tauri v2), fall back to custom Rust command
      await noteCommands.openFilePath(fullPath)
    }
  } catch (error) {
    await appLogger.warn({
      source: 'frontend.editor',
      event: 'open_file_asset',
      message: 'Failed to open file attachment',
      workspacePath,
      payload: { src },
      error,
    })
  }
}

function localCoverAssetSrc(cover: string | null | undefined): string | null {
  if (!cover) return null
  const src = cover.startsWith('image:') ? cover.slice(6) : cover
  return src.startsWith('.nevo/assets/') ? src : null
}

function queueReplacedCoverAsset(nextCover: string | null) {
  const previousAssetSrc = localCoverAssetSrc(props.note?.cover)
  if (!previousAssetSrc) return
  if (localCoverAssetSrc(nextCover) === previousAssetSrc) return
  pendingCoverAssetCleanup.add(previousAssetSrc)
}

function updateCover(nextCover: string | null) {
  queueReplacedCoverAsset(nextCover)
  emit('update:cover', nextCover)
}

async function cleanupPendingCoverAssets() {
  if (pendingCoverAssetCleanup.size === 0) return
  const backend = workspaceStore.backend
  if (!backend) return

  const assetSrcs = Array.from(pendingCoverAssetCleanup)
  pendingCoverAssetCleanup.clear()
  for (const assetSrc of assetSrcs) {
    try {
      await backend.deleteUnreferencedAsset(assetSrc)
    } catch (error) {
      pendingCoverAssetCleanup.add(assetSrc)
      await appLogger.error({
        source: 'frontend.editor',
        event: 'delete_cover_asset',
        message: 'Failed to delete removed cover asset',
        workspacePath: props.workspacePath,
        error,
        payload: { assetSrc },
      })
    }
  }
}

// Local cover picker: native dialog → path → importAssetByPath (no UI freeze).
async function pickCoverImage() {
  const workspacePath = props.workspacePath
  const backend = workspaceStore.backend
  if (!workspacePath || !backend) return

  let selectedPath: string
  try {
    const { open } = await import('@tauri-apps/plugin-dialog')
    const result = await open({
      multiple: false,
      filters: [{ name: 'Image', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'avif', 'bmp'] }],
    })
    if (!result || typeof result !== 'string') return
    selectedPath = result
  } catch {
    return
  }

  const fileName = selectedPath.split(/[\\/]/).pop() ?? 'cover'
  try {
    const imported = await backend.importAssetByPath(selectedPath, fileName)
    updateCover(`image:${imported.src}`)
  } catch (error) {
    await appLogger.error({
      source: 'frontend.editor',
      event: 'import_cover_image',
      message: 'Failed to import cover image',
      workspacePath,
      error,
      payload: { fileName },
    })
  }
}

function onRequestCoverImage() {
  if (backendSupportsPathImport()) {
    void pickCoverImage()
  } else {
    coverImageInputRef.value?.click()
  }
}

// Cover image upload (cloud fallback — bytes over IPC)
async function onCoverImageInputChange(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  try {
    const backend = workspaceStore.backend
    if (!backend) return
    const bytes = Array.from(new Uint8Array(await file.arrayBuffer()))
    const imported = await backend.importImageAsset(file.name, bytes)
    updateCover(`image:${imported.src}`)
  } catch (error) {
    await appLogger.error({
      source: 'frontend.editor',
      event: 'import_cover_image',
      message: 'Failed to import cover image',
      workspacePath: props.workspacePath,
      error,
      payload: { fileName: file.name },
    })
  } finally {
    input.value = ''
  }
}

// Link picker selection
function selectLinkNote(note: { id: string; title: string }) {
  const view = core.editorView
  if (!view) return

  const pickerState = getLinkPickerState(view.state)
  if (!pickerState.open || !pickerState.range) return

  const markType = view.state.schema.marks.internal_link
  if (!markType) return

  const { from, to } = pickerState.range
  const parsed = parseWikiQuery(pickerState.query)
  const mark = markType.create({
    noteId: note.id,
    title: note.title,
    anchor: parsed.anchor,
    alias: parsed.alias,
  })
  const displayText = parsed.alias || note.title

  const tr = view.state.tr
    .delete(from, to)
    .insertText(displayText, from)
    .addMark(from, from + displayText.length, mark)
    .removeStoredMark(markType)
  view.dispatch(tr.scrollIntoView())
  view.focus()
}

// Link picker: create a brand-new note and link to it (placed next to the
// active note). Emits 'create-note' on failure so the caller can recover.
async function selectLinkCreateNote(payload: { noteTitle: string; anchor: string | null; alias: string | null }) {
  const view = core.editorView
  if (!view) return

  const pickerState = getLinkPickerState(view.state)
  if (!pickerState.open || !pickerState.range) return

  const markType = view.state.schema.marks.internal_link
  if (!markType) return

  const folderId = props.note?.folderId ?? null
  const note = await treeStore.createNote(folderId, payload.noteTitle)
  if (!note) return

  const { from, to } = pickerState.range
  const mark = markType.create({
    noteId: note.id,
    title: payload.noteTitle,
    anchor: payload.anchor,
    alias: payload.alias,
  })
  const displayText = payload.alias || payload.noteTitle

  const tr = view.state.tr
    .delete(from, to)
    .insertText(displayText, from)
    .addMark(from, from + displayText.length, mark)
    .removeStoredMark(markType)
  view.dispatch(tr.scrollIntoView())
  view.focus()
}

function insertResolvedTemplate(payload: { template: TemplateDocument; fieldValues: TemplateFieldValues }) {
  const resolved = resolveTemplateContent(payload.template.content, {
    note: props.note ?? undefined,
    workspaceName: props.workspaceName,
    fields: payload.fieldValues,
  })
  editorSetup.insertContentAtSelection(resolved.content)
  insertTemplatePickerOpen.value = false
}

// Outside click handler
function onDocumentMouseDown(event: MouseEvent) {
  const target = event.target as Node | null
  if (!target) return
  const c = overlayContainerRef.value
  if (blockHandle.typeMenuOpen) {
    const insideHandle = c?.blockHandleEl?.contains(target) ?? false
    const insideMenu = c?.blockTypeMenuEl?.contains(target) ?? false
    if (!insideHandle && !insideMenu) blockHandleComposable.closeTypeMenu()
  }
  if (linkPopover.open) {
    const insidePopover = c?.linkPopoverEl?.contains(target) ?? false
    const insideToolbar = c?.toolbarEl?.contains(target) ?? false
    if (!insidePopover && !insideToolbar) linkEditor.closeLinkPopover()
  }
  if (mathPopover.open) {
    const insidePopover = c?.mathPopoverEl?.contains(target) ?? false
    if (!insidePopover) mathEditor.closeMathPopover()
  }
  if (formulaPopover.open) {
    const insidePopover = c?.formulaPopoverEl?.contains(target) ?? false
    if (!insidePopover) formulaEditor.closeFormulaPopover()
  }
  if (mermaidPopover.open) {
    const insidePopover = c?.mermaidPopoverEl?.contains(target) ?? false
    if (!insidePopover) mermaidEditor.closeMermaidPopover()
  }
  if (markmapPopover.open) {
    const insidePopover = c?.markmapPopoverEl?.contains(target) ?? false
    if (!insidePopover) markmapEditor.closeMarkmapPopover()
  }
  if (vegaPopover.open) {
    const insidePopover = c?.vegaPopoverEl?.contains(target) ?? false
    if (!insidePopover) vegaEditor.closeVegaPopover()
  }
  if (pluginNodePopover.open) {
    const insidePopover = c?.pluginNodePopoverEl?.contains(target) ?? false
    if (!insidePopover) pluginNodeEditor.close()
  }
  if (embedUrlPopover.open) {
    const insidePopover = c?.embedUrlPopoverEl?.contains(target) ?? false
    const insideSlashMenu = c?.slashMenuEl?.contains(target) ?? false
    const ignoreOpeningClick = isEmbedOpeningClickIgnored()
    if (!insidePopover && !insideSlashMenu && !ignoreOpeningClick) closeEmbedUrlPopover()
  }
  if (calloutIconPicker.open) {
    const insidePicker = c?.calloutIconPickerEl?.contains(target) ?? false
    if (!insidePicker) closeCalloutIconPicker()
  }
  if (slashEmojiPickerOpen.value) {
    const insideSlashMenu = c?.slashMenuEl?.contains(target) ?? false
    if (!insideSlashMenu) closeSlashEmojiPicker()
  }
  if (noteEmbedPicker.open) {
    const pickerEl = noteEmbedPickerRef.value
    if (!pickerEl?.contains(target)) closeNoteEmbedPicker()
  }
}

async function applyPendingBlockTargetIfReady() {
  if (!props.pendingBlockTarget || !props.note) return
  if (props.pendingBlockTarget.noteId !== props.note.id) return

  const targetKey = [
    props.pendingBlockTarget.noteId,
    props.pendingBlockTarget.blockIndex,
    props.pendingBlockTarget.query,
    props.pendingBlockTarget.snippet,
  ].join(':')

  if (targetKey === lastAppliedPendingBlockTargetKey || targetKey === pendingBlockTargetApplicationKey) return

  pendingBlockTargetApplicationKey = targetKey

  await nextTick()

  try {
    if (!props.pendingBlockTarget || !props.note) return
    if (props.pendingBlockTarget.noteId !== props.note.id) return

    const currentTargetKey = [
      props.pendingBlockTarget.noteId,
      props.pendingBlockTarget.blockIndex,
      props.pendingBlockTarget.query,
      props.pendingBlockTarget.snippet,
    ].join(':')

    if (currentTargetKey !== targetKey) return

    const applied = focusBlockSearchTarget(editorRoot.value, props.pendingBlockTarget)
    if (!applied) return

    lastAppliedPendingBlockTargetKey = targetKey
    emit('consumed-pending-target')
  } finally {
    if (pendingBlockTargetApplicationKey === targetKey) {
      pendingBlockTargetApplicationKey = null
    }
  }
}

// Scrollbar
const {
  scrollbarVisible, scrollbarScrollable, scrollbarDragging, thumbHeight, thumbOffset, editorScrollTop,
  refreshScrollbarMetrics,
  onEditorMouseEnter, onEditorMouseLeave, onEditorScroll: originalOnEditorScroll,
  onScrollbarTrackMouseDown, onScrollbarThumbMouseDown,
} = useEditorScrollbar({ editorScrollEl, scrollbarTrackEl, editorWrapEl, supportsHover })

const handleEditorScroll = () => {
  originalOnEditorScroll()
  overlays.updateOverlays()
  mathEditor.repositionMathPopover()
  mermaidEditor.repositionMermaidPopover()
  markmapEditor.repositionMarkmapPopover()
  vegaEditor.repositionVegaPopover()
  pluginNodeEditor.reposition()
}

// Overlay handlers wired from composables and local functions
const overlayHandlers: OverlayHandlers = {
  runSlashItem: editorSetup.runSlashItemFromOverlay,
  executeCommandById: editorSetup.executeCommandById,
  openLinkPopover: linkEditor.openLinkPopover,
  openHighlightPicker,
  openTextColorPicker,
  requestImage: () => {
    if (backendSupportsPathImport()) {
      void imageUpload.pickAndInsertImage()
    } else {
      imageUpload.requestImagePicker()
      imageInputRef.value?.click()
    }
  },
  runPluginAction,
  applyHighlight,
  removeHighlight,
  applyTextColor,
  removeTextColor,
  applyTableCellAlignment,
  applyTableCellBackground,
  applyTableCellAttr,
  updateLinkHref: (v) => { linkPopover.href = v },
  applyLink: linkEditor.applyLinkFromPopover,
  removeLink: linkEditor.removeLinkFromPopover,
  onLinkInputKeyDown: linkEditor.onLinkInputKeyDown,
  updateLatex: (v) => { mathPopover.latex = v },
  applyMath: mathEditor.applyMathFromPopover,
  removeMath: mathEditor.removeMathFromPopover,
  onMathInputKeyDown: mathEditor.onMathInputKeyDown,
  openTableCellFormula,
  updateFormula: (v) => { formulaPopover.formula = v },
  applyFormula: formulaEditor.applyFormulaFromPopover,
  removeFormula: formulaEditor.removeFormulaFromPopover,
  onFormulaInputKeyDown: formulaEditor.onFormulaInputKeyDown,
  updateCode: (v) => { mermaidPopover.code = v },
  applyMermaid: mermaidEditor.applyMermaidFromPopover,
  removeMermaid: mermaidEditor.removeMermaidFromPopover,
  onMermaidInputKeyDown: mermaidEditor.onMermaidInputKeyDown,
  updateMarkmapMarkdown: (v) => { markmapPopover.markdown = v },
  applyMarkmap: markmapEditor.applyMarkmapFromPopover,
  removeMarkmap: markmapEditor.removeMarkmapFromPopover,
  onMarkmapInputKeyDown: markmapEditor.onMarkmapInputKeyDown,
  updateSpec: (v) => { vegaPopover.spec = v },
  applyVega: vegaEditor.applyVegaFromPopover,
  removeVega: vegaEditor.removeVegaFromPopover,
  onVegaInputKeyDown: vegaEditor.onVegaInputKeyDown,
  updatePluginNodeValue: ({ key, value }) => pluginNodeEditor.setValue(key, value),
  applyPluginNode: pluginNodeEditor.apply,
  removePluginNode: pluginNodeEditor.remove,
  onPluginNodeKeyDown: pluginNodeEditor.onKeyDown,
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
  onBlockDragStart: blockHandleComposable.onDragStart,
  onBlockDragEnd: blockHandleComposable.onDragEnd,
  onTypeIconClick: () => blockHandleComposable.onTypeIconClick(),
  onHandleMouseEnter: blockHandleComposable.onHandleMouseEnter,
  onHandleMouseLeave: blockHandleComposable.onHandleMouseLeave,
  turnInto: blockHandleComposable.turnInto,
  duplicateBlock: blockHandleComposable.duplicateBlock,
  insertBlockAbove: blockHandleComposable.insertBlockAbove,
  insertBlockBelow: blockHandleComposable.insertBlockBelow,
  deleteBlock: blockHandleComposable.deleteBlock,
  copyBlockRef: blockHandleComposable.copyBlockRef,
  closeTypeMenu: blockHandleComposable.closeTypeMenu,
  onMenuMouseEnter: blockHandleComposable.onMenuMouseEnter,
  onMenuMouseLeave: blockHandleComposable.onMenuMouseLeave,
  hideToolbarManually: overlays.hideToolbarManually,
}

// After a successful save, clean up asset files that are no longer referenced
watch(
  () => props.saveStatus,
  (status) => {
    if (status === 'saved' && pendingAssetCleanup) {
      pendingAssetCleanup = false
      const wp = props.workspacePath
      if (wp) workspaceCommands.cleanupOrphanedAssets(wp).catch(() => {})
    }
    if (status === 'saved') {
      void cleanupPendingCoverAssets()
    }
  },
)

// Watches
// Re-evaluate broken-link decorations whenever the workspace tree changes,
// since note existence (not the doc) determines whether a link is broken.
watch(
  () => treeStore.noteById.size,
  () => { core.refreshBrokenLinks() },
)

watch(
  () => ({
    workspacePath: props.workspacePath,
    pluginSignature: props.pluginManifests
      .map((manifest) => [
        manifest.id,
        manifest.version,
        manifest.enabled,
        manifest.entryPoint,
        manifest.priority ?? 0,
        (manifest.editorCapabilities ?? []).join(','),
      ].join(':'))
      .join('|'),
    slashCommands: props.settings.editor.slashCommands,
    markdownShortcuts: props.settings.editor.markdownShortcuts,
    tabKeyBehavior: props.settings.editor.tabKeyBehavior,
    pasteBehavior: props.settings.editor.pasteBehavior,
    aiEnabled: props.settings.ai.enabled,
    aiSlash: props.settings.ai.slashCommands,
  }),
  async () => {
    await editorSetup.initPluginHost(props.workspacePath, props.pluginManifests)
    editorSetup.destroyEditorView()
    closeSlashEmojiPicker()
    closeCalloutIconPicker()
    closeEmbedUrlPopover()
    closeNoteEmbedPicker()
    if (props.note) {
      await nextTick()
      if (editorRoot.value) {
        await editorSetup.setupEditorForNote(props.note, editorRoot.value, props.settings)
        notePreload.mount(editorRoot.value)
        updateEditorStatsNow()
        await applyPendingBlockTargetIfReady()
        applyPendingDrawUpdateIfReady()
        await refreshScrollbarMetrics()
      }
    } else {
      notePreload.unmount()
      await refreshScrollbarMetrics()
    }
    hasInitializedPluginHost = true
  },
  { immediate: true },
)

watch(
  () => [props.settings.editor.spellCheck, locale.value] as const,
  ([spellCheck]) => {
    if (core.editorView) {
      const attrs = core.editorView.props.attributes
      const resolved = typeof attrs === 'function' ? attrs(core.editorView.state) : (attrs || {})
      core.editorView.setProps({
        ...core.editorView.props,
        attributes: {
          ...resolved,
          spellcheck: spellCheck ? 'true' : 'false',
          lang: document.documentElement.lang || 'ru',
        },
      })
    }
  },
  { immediate: true },
)

watch(
  () => props.settings.editor.caretAnimation,
  (mode) => {
    const dom = core.editorView?.dom as HTMLElement | undefined
    if (!dom) return
    dom.classList.remove('caret--steady', 'caret--blink')
    if (mode === 'steady') dom.classList.add('caret--steady')
    else if (mode === 'blink') dom.classList.add('caret--blink')
  },
)

watch(
  () => {
    if (!props.note) return null
    return { id: props.note.id, content: props.note.content }
  },
  async (noteState) => {
    if (!hasInitializedPluginHost) return
    blockHandleComposable.unmount()
    if (!noteState) { notePreload.unmount(); editorSetup.destroyEditorView(); return }
    if (core.editorView && noteState.id === core.lastLoadedNoteId) {
      // Content identity is preserved across the editor→store→props round-trip
      // (setContent mutates in place, flushPendingContentUpdate stores the same
      // reference it serialized). The reference check is the fast path and avoids
      // an O(document) JSON.stringify on every debounced flush for large notes.
      const rawContent = toRaw(noteState.content)
      // Fallback for a value-identical sync-back delivered as a *new* object
      // (e.g. an external/collab update): compare the serialized form so a no-op
      // update doesn't tear down editor state or dismiss open overlays. This runs
      // only when the cheap ref check misses for the same note — not the hot path.
      if (rawContent === core.lastSerializedContentRef
        || JSON.stringify(rawContent) === core.lastSerializedContent) {
        core.lastSerializedContentRef = rawContent
        if (!isTouch.value) blockHandleComposable.mount()
        return
      }
    }
    closeSlashEmojiPicker()
    closeCalloutIconPicker()
    closeEmbedUrlPopover()
    closeNoteEmbedPicker()
    await nextTick()
    if (editorRoot.value) {
      await editorSetup.setupEditorForNote(props.note as NoteDocument, editorRoot.value, props.settings)
      notePreload.mount(editorRoot.value)
      updateEditorStatsNow()
      if (!isTouch.value) blockHandleComposable.mount()
      await applyPendingBlockTargetIfReady()
      applyPendingDrawUpdateIfReady()
      await refreshScrollbarMetrics()
    }
  },
  { immediate: true },
)

watch(isTouch, (touch) => {
  if (touch) {
    blockHandleComposable.closeTypeMenu()
    blockHandleComposable.unmount()
    scrollbarVisible.value = false
  } else if (props.note) {
    blockHandleComposable.mount()
  }
})

watch(
  () => slashOverlay.open,
  (open) => {
    if (!open) closeSlashEmojiPicker()
  },
)

watch(
  () => props.pendingBlockTarget ? `${props.pendingBlockTarget.noteId}:${props.pendingBlockTarget.blockIndex}` : null,
  async (pendingTargetKey) => {
    if (pendingTargetKey === null) {
      lastAppliedPendingBlockTargetKey = null
    }
    await applyPendingBlockTargetIfReady()
    await refreshScrollbarMetrics()
  },
)

watch(
  () => props.pendingDrawUpdate ? `${props.pendingDrawUpdate.drawId}:${props.pendingDrawUpdate.src}` : null,
  () => { applyPendingDrawUpdateIfReady() },
)

watch(
  () => props.note?.id,
  (noteId, prevId) => {
    if (noteId !== prevId && collabStore.sessionNoteId) {
      void collabStore.leaveSession()
    }
    if (noteId) graphStore.loadNoteGraph(noteId)
    else graphStore.clear()
  },
  { immediate: true },
)

watch(
  () => [
    props.settings.appearance.editorFontFamily,
    props.settings.appearance.editorFontSize,
    props.settings.appearance.editorLineWidth,
    localGraphOpen.value,
  ],
  async () => {
    await refreshScrollbarMetrics()
  },
)

watch(
  () => props.settings.editor.editorStatsVisibility,
  () => {
    resetStatsTracking()
  },
  { immediate: true },
)

onMounted(() => {
  document.addEventListener('mousedown', onDocumentMouseDown)
})

onBeforeUnmount(async () => {
  document.removeEventListener('mousedown', onDocumentMouseDown)
  clearStatsTimers()
  flushPendingContent()
  blockHandleComposable.unmount()
  notePreload.unmount()
  editorSetup.destroyEditorView()
  await collabStore.leaveSession()
  if (core.pluginHost) {
    await core.pluginHost.deactivateAll()
    await core.pluginHost.dispose()
  }
})

// Computed styles

const showContainerOverview = computed(() => !props.note && props.containerKind !== null && props.containerItems.length > 0)
const isFolderEmptyState = computed(() => props.containerKind === 'folder')

const noteIcon = computed(() => normalizeIcon(props.note?.icon ?? '📄'))
const noteCoverStyle = computed(() => {
  // Touch the refresh token so the cover style recomputes when cloud assets reload.
  void cloudAssetRefreshToken.value
  const resolvedCover = resolveCoverSource(props.note?.cover, resolveWorkspaceAssetSrc)
  return resolveCoverStyle(resolvedCover ?? undefined)
})
const noteIconButtonLabel = computed(() => {
  const title = props.note?.title.trim() || t('workspace.titlePlaceholder')
  return `Change icon for ${title}`
})
const editorBodyClasses = computed(() => ({
  'doc-body--smooth': props.settings.editor.smoothScrolling,
  'doc-body--active-emphasis': props.settings.editor.activeBlockEmphasis,
}))
const editorContentStyle = computed(() => ({
  '--workspace-editor-font-family': resolveEditorFontFamilyCss(props.settings.appearance.editorFontFamily),
  '--workspace-editor-font-size': `${props.settings.appearance.editorFontSize}px`,
  '--workspace-editor-line-width': EDITOR_LINE_WIDTHS[props.settings.appearance.editorLineWidth],
}))
const breadcrumbMenuItems = computed<NvMenuItemDef[]>(() => [
  {
    label: t('export.buttonTitle'),
    icon: markRaw(Download),
    items: [
      {
        label: t('export.formatMarkdown'),
        action: () => emit('request-export', 'markdown'),
      },
      {
        label: t('export.formatHtml'),
        action: () => emit('request-export', 'html'),
      },
      {
        label: t('export.formatTypst'),
        action: () => emit('request-export', 'typst'),
      },
      {
        label: t('export.formatPdf'),
        action: () => emit('request-export', 'pdf'),
      },
    ],
  },
  {
    label: t('workspace.context.importIntoNote'),
    icon: markRaw(Upload),
    action: () => emit('request-import-md'),
  },
  {
    label: t('graph.title'),
    icon: markRaw(Network),
    action: () => { localGraphOpen.value = !localGraphOpen.value },
  },
])

const scrollbarStyle = computed<CSSProperties>(() => ({
  height: `${thumbHeight.value}px`,
  transform: `translateY(${thumbOffset.value}px)`,
}))
const scrollbarInteractivityStyle = computed<CSSProperties>(() => ({
  pointerEvents: scrollbarVisible.value || scrollbarDragging.value ? 'auto' : 'none',
}))

// Pushes scrollbar below the cover image when it's visible in the viewport.
// Cover occupies doc-body padding-top (20px) + cover height (200px) = 220px from scroll origin.
const COVER_BOTTOM_IN_DOC = 220
const scrollbarPositionStyle = computed<CSSProperties>(() => {
  if (!props.note?.cover) return {}
  const coverBottomInViewport = COVER_BOTTOM_IN_DOC - editorScrollTop.value
  if (coverBottomInViewport <= 8) return {}
  return { top: `${coverBottomInViewport}px` }
})

// Sync a draw_block node (svgPreview/src/title) from the canvas back into
// the editor document after the drawing was saved. Dispatches a transaction
// that finds the node by its drawId and updates its attributes — used by
// WorkspaceShell.onUpdateDraw after the canvas persisted the asset.
function updateDrawBlock(payload: { drawId: string; svgPreview: string; src: string; title?: string }): boolean {
  const view = core.editorView
  if (!view) return false
  const nodeType = view.state.schema.nodes.draw_block
  if (!nodeType) return false
  let targetPos = -1
  view.state.doc.descendants((node, pos) => {
    if (targetPos === -1 && node.type === nodeType && node.attrs.drawId === payload.drawId) {
      targetPos = pos
      return false
    }
    return false
  })
  if (targetPos === -1) return false
  const node = view.state.doc.nodeAt(targetPos)
  if (!node) return false
  const attrs: Record<string, unknown> = {
    ...node.attrs,
    svgPreview: payload.svgPreview,
    src: payload.src,
  }
  if (typeof payload.title === 'string') attrs.title = payload.title
  view.dispatch(view.state.tr.setNodeMarkup(targetPos, undefined, attrs))
  return true
}

// Apply a draw_block update stashed while the canvas was open (the editor pane
// was unmounted then). Runs after the editor view is ready on remount; the
// dispatched transaction is mirrored into the Y.Doc by y-prosemirror, so the
// preview both renders and persists.
function applyPendingDrawUpdateIfReady() {
  const pending = props.pendingDrawUpdate
  if (!pending || !core.editorView) return
  if (updateDrawBlock(pending)) emit('consumed-draw-update')
}

defineExpose({ editorRoot, flushPendingContent, updateDrawBlock })
</script>

<template>
  <main
    class="editor-pane"
    :class="{
      'editor-pane--with-graph': localGraphOpen && note,
      'editor-pane--focus-soft': props.settings.editor.focusMode === 'soft',
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
                <input
                  class="doc-title"
                  :value="note.title"
                  :placeholder="t('workspace.titlePlaceholder')"
                  @input="emit('update:title', ($event.target as HTMLInputElement).value)"
                />
              </div>
              <div
                ref="editorRoot"
                class="doc-editor"
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


    <!-- AI Ask modal -->
    <Teleport to="body">
      <div
        v-if="aiAskOpen"
        class="ai-ask-backdrop"
        @mousedown.self="cancelAiAsk"
      >
        <div class="ai-ask-modal" role="dialog" :aria-label="t('editor.aiAsk.title')">
          <p class="ai-ask-modal__title">{{ t('editor.aiAsk.title') }}</p>
          <input
            v-model="aiAskValue"
            class="ai-ask-modal__input"
            type="text"
            :placeholder="t('editor.aiAsk.placeholder')"
            autofocus
            @keydown="onAiAskKeyDown"
          />
          <div class="ai-ask-modal__actions">
            <button type="button" class="nv-btn nv-btn--ghost" @click="cancelAiAsk">
              {{ t('editor.aiAsk.cancel') }}
            </button>
            <button type="button" class="nv-btn nv-btn--primary" @click="confirmAiAsk">
              {{ t('editor.aiAsk.confirm') }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <NvPopupMenu
      v-model:open="imageCtxMenu.open"
      :position="imageCtxMenu.pos"
      :items="imageMenuItems"
      width="192px"
    />

    <div
      v-if="noteEmbedPicker.open"
      ref="noteEmbedPickerRef"
      class="note-embed-picker"
      :style="{ top: `${noteEmbedPicker.position.top}px`, left: `${noteEmbedPicker.position.left}px` }"
    >
      <input
        v-model="noteEmbedPicker.query"
        class="note-embed-picker__search"
        type="text"
        :placeholder="$t('noteEmbed.searchPlaceholder')"
        autofocus
      />
      <ul class="note-embed-picker__list">
        <li
          v-for="embedNote in noteEmbedFilteredNotes"
          :key="embedNote.id"
          class="note-embed-picker__item"
          @mousedown.prevent="selectNoteForEmbed(embedNote.id, embedNote.title, embedNote.icon)"
        >
          <NvNoteIcon :value="embedNote.icon || '📄'" :size="16" class="note-embed-picker__icon" />
          <span class="note-embed-picker__title">{{ embedNote.title || $t('noteEmbed.untitled') }}</span>
        </li>
        <li v-if="!noteEmbedFilteredNotes.length" class="note-embed-picker__empty">{{ $t('noteEmbed.noNotesFound') }}</li>
      </ul>
    </div>
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
.ai-ask-backdrop {
  position: fixed;
  inset: 0;
  z-index: 9000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.35);
}

.ai-ask-modal {
  background: var(--nv-surface-1, #fff);
  border: 1px solid var(--nv-border, rgba(0, 0, 0, 0.12));
  border-radius: var(--nv-radius-lg, 10px);
  padding: 20px;
  width: 360px;
  max-width: calc(100vw - 32px);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.18);
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.ai-ask-modal__title {
  font-size: 14px;
  font-weight: 600;
  margin: 0;
  color: var(--nv-text-1, inherit);
}

.ai-ask-modal__input {
  width: 100%;
  box-sizing: border-box;
  padding: 8px 10px;
  border: 1px solid var(--nv-border, rgba(0, 0, 0, 0.15));
  border-radius: var(--nv-radius-md, 6px);
  background: var(--nv-surface-2, #f5f5f5);
  color: var(--nv-text-1, inherit);
  font-size: 14px;
  outline: none;
}

.ai-ask-modal__input:focus {
  border-color: var(--nv-accent, #6c63ff);
}

.ai-ask-modal__actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
