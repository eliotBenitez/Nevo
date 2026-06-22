<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, toRaw, watch, type CSSProperties } from 'vue'
import type { EditorView } from 'prosemirror-view'
import { TextSelection } from 'prosemirror-state'
import { useI18n } from 'vue-i18n'
import { convertFileSrc } from '@tauri-apps/api/core'
import { openPath } from '@tauri-apps/plugin-opener'
import { noteCommands } from '../../../tauri/commands'
import { mediaHttpUrl } from '../../../tauri/mediaServer'
import { appLogger } from '../../../utils/logger'
import { blockNode } from '../../../utils/noteExport/htmlSerializer'
import { createDefaultWorkspaceSettings, EDITOR_LINE_WIDTHS, resolveEditorFontFamilyCss } from '../../../utils/workspace-settings'
import { CloudBackend, CLOUD_ASSET_SCHEME } from '../../../core/workspace-backend'
import { useWorkspaceStore } from '../../../stores/workspace'
import { useTreeStore } from '../../../stores/tree'
import type { BlockNode } from '../../../types/note'
import type { PluginManifest, WorkspaceSettings } from '../../../types/workspace'
import type { NevoToolbarAction } from '../../../types/editor-plugin'
import { getLinkPickerState, parseWikiQuery } from '../../../editor-core'
import { createEditorCore, useEditorCore } from '../../composables/editor/useEditorCore'
import { useEditorOverlays } from '../../composables/editor/useEditorOverlays'
import { useMathEditor } from '../../composables/editor/useMathEditor'
import { useFormulaEditor } from '../../composables/editor/useFormulaEditor'
import { useMermaidEditor } from '../../composables/editor/useMermaidEditor'
import { usePluginNodePopover } from '../../composables/editor/usePluginNodePopover'
import { useMarkmapEditor } from '../../composables/editor/useMarkmapEditor'
import { useVegaEditor } from '../../composables/editor/useVegaEditor'
import { useLinkEditor } from '../../composables/editor/useLinkEditor'
import { useImageContextMenu } from '../../composables/editor/useImageContextMenu'
import { useEmbedUrlPopover } from '../../composables/editor/useEmbedUrlPopover'
import { useNoteEmbedPicker } from '../../composables/editor/useNoteEmbedPicker'
import { useCalloutIconPicker } from '../../composables/editor/useCalloutIconPicker'
import { useImageUpload } from '../../composables/editor/useImageUpload'
import { useFileUpload } from '../../composables/editor/useFileUpload'
import { useMediaUpload } from '../../composables/editor/useMediaUpload'
import { useBlockHandle } from '../../composables/editor/useBlockHandle'
import { useDeviceLayout } from '../../../composables/useDeviceLayout'
import NvPopupMenu from '../../../ui/primitives/NvPopupMenu.vue'
import NvNoteIcon from '../../../ui/primitives/NvNoteIcon.vue'
import EditorOverlayContainer, { type OverlayHandlers } from './EditorOverlayContainer.vue'

interface Props {
  content: BlockNode
  variant?: 'full' | 'compact'
  settings?: WorkspaceSettings
  workspacePath?: string | null
  pluginManifests?: PluginManifest[]
  documentId?: string
  currentNoteId?: string | null
  placeholder?: string
}

const props = withDefaults(defineProps<Props>(), {
  variant: 'full',
  settings: () => createDefaultWorkspaceSettings(),
  workspacePath: null,
  pluginManifests: () => [],
  documentId: 'editor-surface',
  currentNoteId: null,
  placeholder: '',
})

const emit = defineEmits<{
  'update:content': [value: BlockNode]
  'content-dirty': []
  'open-note': [noteId: string, anchor?: string | null]
  'asset-srcs-removed': [srcs: string[]]
}>()

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

const { locale } = useI18n()
const workspaceStore = useWorkspaceStore()
const treeStore = useTreeStore()
const surfaceRootEl = ref<HTMLDivElement | null>(null)
const editorRoot = ref<HTMLDivElement | null>(null)
const imageInputRef = ref<HTMLInputElement | null>(null)
const fileInputRef = ref<HTMLInputElement | null>(null)
const overlayContainerRef = ref<OverlayContainerInstance | null>(null)
const noteEmbedPickerRef = ref<HTMLDivElement | null>(null)
const isEmpty = ref(true)
const hasInitializedPluginHost = ref(false)
const slashEmojiPickerOpen = ref(false)

const core = createEditorCore()

const blockHandleComposable = useBlockHandle(core, {
  getHandleBoundaryEl: () => surfaceRootEl.value,
  getTypeMenuBoundaryEl: () => surfaceRootEl.value,
  getTypeMenuEl: () => overlayContainerRef.value?.blockTypeMenuEl ?? null,
})
const { blockHandle } = blockHandleComposable
const { isTouch } = useDeviceLayout()

const overlays = useEditorOverlays(core, {
  getSlashMenuEl: () => overlayContainerRef.value?.slashMenuEl ?? null,
  getToolbarEl: () => overlayContainerRef.value?.toolbarEl ?? null,
  getTableMenuEl: () => overlayContainerRef.value?.tableMenuEl ?? null,
  getLinkPickerEl: () => overlayContainerRef.value?.linkPickerEl ?? null,
})
const { slashOverlay, toolbarOverlay, tableMenuOverlay, linkPopover, highlightPicker, textColorPicker, mathPopover, formulaPopover, mermaidPopover, markmapPopover, vegaPopover, pluginNodePopover, linkPickerOverlay, activeMarkNames } = overlays

const { imageCtxMenu, imageMenuItems, openImageContextMenu } = useImageContextMenu(() => props.workspacePath)
const imageUpload = useImageUpload(core, () => props.workspacePath, overlays.updateOverlays)
const fileUpload = useFileUpload(core, () => props.workspacePath, overlays.updateOverlays)
const mediaUpload = useMediaUpload(core, () => props.workspacePath, overlays.updateOverlays)

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

function refreshIsEmpty() {
  const doc = core.editorView?.state.doc
  isEmpty.value = !doc || (doc.childCount === 1 && doc.firstChild?.type.name === 'paragraph' && doc.firstChild.content.size === 0)
}

function resolveCloudAsset(src: string): string {
  const cloud = workspaceStore.backend
  if (!(cloud instanceof CloudBackend)) return ''
  return cloud.assetUrl(src) ?? ''
}

function resolveAssetSrc(src: string): string {
  if (/^(https?|data|blob):/.test(src)) return src
  if (src.startsWith(CLOUD_ASSET_SCHEME)) return resolveCloudAsset(src) || src
  const wp = props.workspacePath
  if (!wp) return src
  return convertFileSrc(`${wp}/${src}`)
}

function resolveMediaSrc(src: string): string | null {
  if (/^(https?|data|blob):/.test(src)) return src
  if (src.startsWith(CLOUD_ASSET_SCHEME)) return resolveCloudAsset(src) || null
  const wp = props.workspacePath
  if (!wp) return null
  return mediaHttpUrl(`${wp}/${src}`)
}

function backendSupportsPathImport(): boolean {
  return workspaceStore.backend?.handle.kind === 'local'
}

async function openFileAsset(src: string) {
  const workspacePath = props.workspacePath
  if (!workspacePath || !src.startsWith('.nevo/assets/')) return
  try {
    const fullPath = `${workspacePath}/${src}`
    try {
      await openPath(fullPath)
    } catch {
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

function onAfterTransaction(view: EditorView) {
  refreshIsEmpty()
  if (props.variant !== 'full' || !props.settings.editor.typewriterScrolling) return
  const { selection } = view.state
  if (!(selection instanceof TextSelection) || !selection.$cursor) return
  const scrollEl = surfaceRootEl.value?.closest('.doc-body')
  if (!(scrollEl instanceof HTMLElement)) return
  const coords = view.coordsAtPos(selection.$cursor.pos)
  const rect = scrollEl.getBoundingClientRect()
  const ratio = { upper: 0.30, center: 0.50, lower: 0.68 }[props.settings.editor.typewriterPosition] ?? 0.68
  const delta = coords.top - (rect.top + rect.height * ratio)
  if (Math.abs(delta) > 32) scrollEl.scrollBy({ top: delta, behavior: 'smooth' })
}

const editorSetup = useEditorCore(core, {
  onOverlaysUpdate: () => {
    overlays.updateOverlays()
    refreshIsEmpty()
  },
  onCloseOverlays: () => {
    overlays.closeOverlays()
    closeSlashEmojiPicker()
    closeEmbedUrlPopover()
  },
  onContentUpdate: (content) => {
    if (core.lastLoadedNoteId === props.documentId) emit('update:content', content)
  },
  onDocDirty: () => emit('content-dirty'),
  onAfterTransaction,
  onAssetSrcsRemoved: (srcs) => emit('asset-srcs-removed', srcs),
  onInternalLinkOpen: (noteId, anchor) => emit('open-note', noteId, anchor),
  internalLinkExists: (noteId) => treeStore.noteById.has(noteId),
  resolveWikiLink: (title) => treeStore.resolveNoteIdByTitle(title),
  resolveAssetSrc,
  resolveMediaSrc,
  onImagePickerRequest: (pos) => {
    if (backendSupportsPathImport()) {
      void imageUpload.pickAndInsertImage(pos)
    } else {
      core.pendingImageTargetPos = pos
      imageInputRef.value?.click()
    }
  },
  onImagePaste: (event) => imageUpload.onEditorPaste(event),
  onImageContextMenuRequest: openImageContextMenu,
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
  onMediaPickerRequest: (pos, kind) => mediaUpload.requestMediaPicker(pos, kind),
  onNoteEmbedPickRequest: (pos, anchorRect) => openNoteEmbedPicker(pos, anchorRect),
  onEmbedUrlRequest: (pos, anchorRect) => openEmbedUrlPopover(pos, anchorRect),
  onNoteEmbedContentLoad: async ({ noteId, setHtml, setLoading }) => {
    setLoading(true)
    try {
      const workspacePath = props.workspacePath
      if (!workspacePath) throw new Error('No workspace')
      const doc = await noteCommands.loadNote(workspacePath, noteId)
      const ctx = { assetSrcs: [] as string[], assetsSubfolderName: '__EMBED__' }
      const rawHtml = await blockNode(doc.content, ctx)
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
  onNoteEmbedOpen: (noteId) => emit('open-note', noteId),
  onMathEditRequest: (pos, rect) => mathEditor.openMathPopoverForNode(pos, rect),
  onFormulaEditRequest: (cellPos, _formula, rect) => formulaEditor.openFormulaPopoverForCell(cellPos, rect),
  onMermaidEditRequest: (pos, rect) => mermaidEditor.openMermaidPopoverForNode(pos, rect),
  onPluginNodeEditRequest: (pos, nodeName, rect) => pluginNodeEditor.openForNode(pos, nodeName, rect),
  onMarkmapEditRequest: (pos, rect) => markmapEditor.openMarkmapPopoverForNode(pos, rect),
  onVegaEditRequest: (pos, rect) => vegaEditor.openVegaPopoverForNode(pos, rect),
  onLinkPickerEnter: () => overlayContainerRef.value?.linkPickerComp?.selectActive() ?? false,
  onMathInlineInsert: () => mathEditor.insertInlineMathAndEdit(),
  onMathBlockInsert: () => mathEditor.insertBlockMathAndEdit(),
  onSlashMathItemRan: () => mathEditor.openSelectedMathPopover(),
  onSlashEmojiPickRequest: () => openSlashEmojiPicker(),
  onCalloutIconPickRequest: (pos, rect, icon) => openCalloutIconPicker(pos, rect, icon),
})

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

function runPluginAction(action: NevoToolbarAction) {
  editorSetup.runPluginToolbarAction(action)
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

function selectLinkNote(note: { id: string; title: string }) {
  const view = core.editorView
  if (!view) return
  const pickerState = getLinkPickerState(view.state)
  if (!pickerState.open || !pickerState.range) return
  const markType = view.state.schema.marks.internal_link
  if (!markType) return
  const { from, to } = pickerState.range
  const parsed = parseWikiQuery(pickerState.query)
  const displayText = parsed.alias || note.title
  const mark = markType.create({
    noteId: note.id,
    title: note.title,
    anchor: parsed.anchor,
    alias: parsed.alias,
  })
  const tr = view.state.tr
    .delete(from, to)
    .insertText(displayText, from)
    .addMark(from, from + displayText.length, mark)
    .removeStoredMark(markType)
  view.dispatch(tr.scrollIntoView())
  view.focus()
}

// Link picker: create a brand-new note (in the workspace root for the
// surface/mini context, which has no "current folder") and link to it.
async function selectLinkCreateNote(payload: { noteTitle: string; anchor: string | null; alias: string | null }) {
  const view = core.editorView
  if (!view) return
  const pickerState = getLinkPickerState(view.state)
  if (!pickerState.open || !pickerState.range) return
  const markType = view.state.schema.marks.internal_link
  if (!markType) return

  const note = await treeStore.createNote(null, payload.noteTitle)
  if (!note) return

  const { from, to } = pickerState.range
  const displayText = payload.alias || payload.noteTitle
  const mark = markType.create({
    noteId: note.id,
    title: payload.noteTitle,
    anchor: payload.anchor,
    alias: payload.alias,
  })
  const tr = view.state.tr
    .delete(from, to)
    .insertText(displayText, from)
    .addMark(from, from + displayText.length, mark)
    .removeStoredMark(markType)
  view.dispatch(tr.scrollIntoView())
  view.focus()
}

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

function closeFloatingUiFromDocument(target: Node) {
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
  if (mathPopover.open && !(c?.mathPopoverEl?.contains(target) ?? false)) mathEditor.closeMathPopover()
  if (formulaPopover.open && !(c?.formulaPopoverEl?.contains(target) ?? false)) formulaEditor.closeFormulaPopover()
  if (mermaidPopover.open && !(c?.mermaidPopoverEl?.contains(target) ?? false)) mermaidEditor.closeMermaidPopover()
  if (markmapPopover.open && !(c?.markmapPopoverEl?.contains(target) ?? false)) markmapEditor.closeMarkmapPopover()
  if (vegaPopover.open && !(c?.vegaPopoverEl?.contains(target) ?? false)) vegaEditor.closeVegaPopover()
  if (pluginNodePopover.open && !(c?.pluginNodePopoverEl?.contains(target) ?? false)) pluginNodeEditor.close()
  if (embedUrlPopover.open) {
    const insidePopover = c?.embedUrlPopoverEl?.contains(target) ?? false
    const insideSlashMenu = c?.slashMenuEl?.contains(target) ?? false
    const ignoreOpeningClick = isEmbedOpeningClickIgnored()
    if (!insidePopover && !insideSlashMenu && !ignoreOpeningClick) closeEmbedUrlPopover()
  }
  if (calloutIconPicker.open && !(c?.calloutIconPickerEl?.contains(target) ?? false)) closeCalloutIconPicker()
  if (slashEmojiPickerOpen.value && !(c?.slashMenuEl?.contains(target) ?? false)) closeSlashEmojiPicker()
  if (noteEmbedPicker.open && !noteEmbedPickerRef.value?.contains(target)) closeNoteEmbedPicker()
}

function onDocumentMouseDown(event: MouseEvent) {
  const target = event.target as Node | null
  if (target) closeFloatingUiFromDocument(target)
}

async function setupSurfaceEditor() {
  await editorSetup.initPluginHost(props.workspacePath, props.pluginManifests)
  editorSetup.destroyEditorView()
  await nextTick()
  if (editorRoot.value) {
    await editorSetup.setupEditorForDocument(props.content, props.documentId, editorRoot.value, props.settings)
    if (!isTouch.value) blockHandleComposable.mount()
    refreshIsEmpty()
  }
  hasInitializedPluginHost.value = true
}

const pluginSignature = computed(() => props.pluginManifests
  .map((manifest) => [
    manifest.id,
    manifest.version,
    manifest.enabled,
    manifest.entryPoint,
    manifest.priority ?? 0,
    (manifest.editorCapabilities ?? []).join(','),
  ].join(':'))
  .join('|'))

watch(
  () => ({
    workspacePath: props.workspacePath,
    pluginSignature: pluginSignature.value,
    slashCommands: props.settings.editor.slashCommands,
    markdownShortcuts: props.settings.editor.markdownShortcuts,
    tabKeyBehavior: props.settings.editor.tabKeyBehavior,
    pasteBehavior: props.settings.editor.pasteBehavior,
  }),
  () => { void setupSurfaceEditor() },
  { immediate: true },
)

watch(
  () => [props.documentId, props.content] as const,
  async ([documentId, content]) => {
    if (!hasInitializedPluginHost.value) return
    if (core.editorView && documentId === core.lastLoadedNoteId) {
      // Content identity is preserved across the editor→store→props round-trip
      // (setContent mutates in place). A reference check suffices and avoids an
      // O(document) JSON.stringify on every debounced flush for large notes.
      const rawContent = toRaw(content)
      if (rawContent === core.lastSerializedContentRef) {
        core.lastSerializedContentRef = rawContent
        refreshIsEmpty()
        return
      }
    }
    blockHandleComposable.unmount()
    closeSlashEmojiPicker()
    closeCalloutIconPicker()
    closeEmbedUrlPopover()
    closeNoteEmbedPicker()
    await nextTick()
    if (editorRoot.value) {
      await editorSetup.setupEditorForDocument(content, documentId, editorRoot.value, props.settings)
      if (!isTouch.value) blockHandleComposable.mount()
      refreshIsEmpty()
    }
  },
)

watch(
  () => [props.settings.editor.spellCheck, locale.value] as const,
  ([spellCheck]) => {
    if (!core.editorView) return
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

watch(isTouch, (touch) => {
  if (touch) {
    blockHandleComposable.closeTypeMenu()
    blockHandleComposable.unmount()
  } else {
    blockHandleComposable.mount()
  }
})

watch(
  () => slashOverlay.open,
  (open) => {
    if (!open) closeSlashEmojiPicker()
  },
)

onMounted(() => {
  document.addEventListener('mousedown', onDocumentMouseDown)
})

onBeforeUnmount(async () => {
  document.removeEventListener('mousedown', onDocumentMouseDown)
  editorSetup.flushPendingContentUpdate()
  blockHandleComposable.unmount()
  editorSetup.destroyEditorView()
  if (core.pluginHost) {
    await core.pluginHost.deactivateAll()
    await core.pluginHost.dispose()
  }
})

const surfaceClasses = computed(() => ({
  'editor-surface--compact': props.variant === 'compact',
  'editor-surface--full': props.variant === 'full',
}))

const editorContentStyle = computed<CSSProperties>(() => ({
  '--workspace-editor-font-family': resolveEditorFontFamilyCss(props.settings.appearance.editorFontFamily),
  '--workspace-editor-font-size': props.variant === 'compact'
    ? '13.5px'
    : `${props.settings.appearance.editorFontSize}px`,
  '--workspace-editor-line-width': props.variant === 'compact'
    ? '100%'
    : EDITOR_LINE_WIDTHS[props.settings.appearance.editorLineWidth],
}))

defineExpose({
  editorRoot,
  flushPendingContent: editorSetup.flushPendingContentUpdate,
  core,
})
</script>

<template>
  <div ref="surfaceRootEl" class="editor-surface" :class="surfaceClasses" :style="editorContentStyle">
    <div
      ref="editorRoot"
      class="doc-editor editor-surface__editor"
      :class="{ 'colored-headings': props.settings.appearance.accentColoredHeadings }"
      @dragover="imageUpload.onEditorDragOver"
      @drop="imageUpload.onEditorDrop"
    />
    <span v-if="placeholder && isEmpty" class="editor-surface__placeholder">{{ placeholder }}</span>

    <input
      ref="imageInputRef"
      class="image-file-input"
      type="file"
      accept="image/*"
      @change="imageUpload.onImageInputChange"
    />
    <input
      ref="fileInputRef"
      class="image-file-input"
      type="file"
      @change="fileUpload.onFileInputChange"
    />

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
  </div>

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
    :current-note-id="currentNoteId ?? undefined"
    :slash-emoji-picker-open="slashEmojiPickerOpen"
    :handlers="overlayHandlers"
  />
</template>

<style scoped>
.editor-surface {
  position: relative;
  width: 100%;
  max-width: var(--workspace-editor-line-width);
  margin: 0 auto;
  font-family: var(--workspace-editor-font-family);
  font-size: var(--workspace-editor-font-size);
}

.editor-surface__editor {
  position: relative;
}

.editor-surface__placeholder {
  position: absolute;
  top: 0;
  left: 0;
  color: var(--text-4, var(--text-muted));
  font-size: var(--workspace-editor-font-size);
  line-height: 1.6;
  pointer-events: none;
  user-select: none;
}

.editor-surface--compact {
  max-height: 320px;
  overflow-y: auto;
  overscroll-behavior: contain;
}

.editor-surface--compact .editor-surface__editor {
  min-height: 60px;
}

.editor-surface--compact :deep(.nv-prosemirror) {
  min-height: 60px;
  font-size: 13.5px;
  line-height: 1.6;
}

.editor-surface--compact :deep(.nv-prosemirror h1) {
  font-size: 1.45em;
}

.editor-surface--compact :deep(.nv-prosemirror h2) {
  font-size: 1.28em;
}

.editor-surface--compact :deep(.nv-prosemirror h3) {
  font-size: 1.12em;
}
</style>
