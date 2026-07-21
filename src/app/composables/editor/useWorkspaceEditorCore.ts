import { ref, type Ref } from 'vue'
import { TextSelection } from 'prosemirror-state'
import type { Node } from 'prosemirror-model'
import type { WorkspaceSettings } from '../../../types/workspace'
import { noteCommands } from '../../../tauri/commands'
import { blockNode } from '../../../utils/noteExport/htmlSerializer'
import {
  useEditorCore,
  type EditorCore,
  type EditorCoreCallbacks,
} from './useEditorCore'

const TYPEWRITER_POSITION_RATIO: Record<string, number> = {
  upper: 0.30,
  center: 0.50,
  lower: 0.68,
}

type RequiredCallback<K extends keyof EditorCoreCallbacks> = NonNullable<EditorCoreCallbacks[K]>

export interface WorkspaceEditorCoreOptions {
  core: EditorCore
  editorScrollEl: Ref<HTMLElement | null>
  getSettings: () => WorkspaceSettings
  getNoteId: () => string | null
  getWorkspacePath: () => string | null
  updateOverlays: () => void
  closeOverlays: () => void
  closeSlashEmojiPicker: () => void
  closeEmbedUrlPopover: () => void
  emitContentUpdate: EditorCoreCallbacks['onContentUpdate']
  emitContentDirty: () => void
  onTransactionDoc: (doc: Node) => void
  scheduleGraphUpdate: RequiredCallback<'onDocChanged'>
  markRemovedEditorAssets: RequiredCallback<'onAssetSrcsRemoved'>
  openInternalLink: RequiredCallback<'onInternalLinkOpen'>
  internalLinkExists: RequiredCallback<'internalLinkExists'>
  resolveWikiLink: RequiredCallback<'resolveWikiLink'>
  resolveAssetSrc: RequiredCallback<'resolveAssetSrc'>
  resolveMediaSrc: RequiredCallback<'resolveMediaSrc'>
  backendSupportsPathImport: () => boolean
  pickAndInsertImage: (pos?: number) => Promise<unknown>
  requestImageInput: () => void
  onImagePaste: RequiredCallback<'onImagePaste'>
  openImageContextMenu: RequiredCallback<'onImageContextMenuRequest'>
  pickAndInsertFile: (pos?: number) => Promise<unknown>
  requestFileInput: () => void
  openFileAsset: (src: string) => Promise<unknown>
  requestMediaPicker: RequiredCallback<'onMediaPickerRequest'>
  openNoteEmbedPicker: RequiredCallback<'onNoteEmbedPickRequest'>
  openEmbedUrlPopover: RequiredCallback<'onEmbedUrlRequest'>
  openNoteEmbed: (noteId: string) => void
  openMathEditor: RequiredCallback<'onMathEditRequest'>
  openFormulaEditor: RequiredCallback<'onFormulaEditRequest'>
  openMermaidEditor: RequiredCallback<'onMermaidEditRequest'>
  openPluginNodeEditor: RequiredCallback<'onPluginNodeEditRequest'>
  openMarkmapEditor: RequiredCallback<'onMarkmapEditRequest'>
  openVegaEditor: RequiredCallback<'onVegaEditRequest'>
  openDraw: RequiredCallback<'onDrawOpen'>
  selectActiveLinkPicker: RequiredCallback<'onLinkPickerEnter'>
  insertInlineMath: RequiredCallback<'onMathInlineInsert'>
  insertBlockMath: RequiredCallback<'onMathBlockInsert'>
  openSelectedMathEditor: RequiredCallback<'onSlashMathItemRan'>
  openSlashEmojiPicker: RequiredCallback<'onSlashEmojiPickRequest'>
  openCalloutIconPicker: RequiredCallback<'onCalloutIconPickRequest'>
  openTemplatePicker: () => void
}

async function loadNoteEmbedContent(
  options: WorkspaceEditorCoreOptions,
  noteId: string,
): Promise<string> {
  const workspacePath = options.getWorkspacePath()
  if (!workspacePath) throw new Error('No workspace')

  const doc = await noteCommands.loadNote(workspacePath, noteId)
  const context = { assetSrcs: [] as string[], assetsSubfolderName: '__EMBED__' }
  const rawHtml = await blockNode(doc.content, context)
  if (context.assetSrcs.length === 0) return rawHtml

  return rawHtml.replace(
    /\bsrc="__EMBED__\/([^"]+)"/g,
    (_, filename: string) => {
      const original = context.assetSrcs.find(src => src.endsWith(filename)) ?? filename
      return `src="${options.resolveAssetSrc(original)}"`
    },
  )
}

export function useWorkspaceEditorCore(options: WorkspaceEditorCoreOptions) {
  const aiAskOpen = ref(false)
  const aiAskValue = ref('')
  let aiAskResolver: ((value: string) => void) | null = null

  function confirmAiAsk() {
    aiAskResolver?.(aiAskValue.value)
    aiAskOpen.value = false
    aiAskResolver = null
  }

  function cancelAiAsk() {
    aiAskOpen.value = false
    aiAskResolver = null
  }

  const editorSetup = useEditorCore(options.core, {
    onOverlaysUpdate: options.updateOverlays,
    onCloseOverlays: () => {
      options.closeOverlays()
      options.closeSlashEmojiPicker()
      options.closeEmbedUrlPopover()
    },
    onContentUpdate: (content) => {
      if (options.core.lastLoadedNoteId === options.getNoteId()) {
        options.emitContentUpdate(content)
      }
    },
    onDocDirty: () => {
      if (options.core.lastLoadedNoteId === options.getNoteId()) {
        options.emitContentDirty()
      }
    },
    onAfterTransaction: (view) => {
      const settings = options.getSettings()
      if (settings.editor.typewriterScrolling) {
        const { selection } = view.state
        if (selection instanceof TextSelection && selection.$cursor) {
          const scrollEl = options.editorScrollEl.value
          if (scrollEl) {
            const coords = view.coordsAtPos(selection.$cursor.pos)
            const rect = scrollEl.getBoundingClientRect()
            const ratio = TYPEWRITER_POSITION_RATIO[settings.editor.typewriterPosition] ?? 0.68
            const delta = coords.top - (rect.top + rect.height * ratio)
            if (Math.abs(delta) > 32) {
              scrollEl.scrollBy({ top: delta, behavior: 'smooth' })
            }
          }
        }
      }
      options.onTransactionDoc(view.state.doc)
    },
    onDocChanged: options.scheduleGraphUpdate,
    onAssetSrcsRemoved: options.markRemovedEditorAssets,
    onInternalLinkOpen: options.openInternalLink,
    internalLinkExists: options.internalLinkExists,
    resolveWikiLink: options.resolveWikiLink,
    resolveAssetSrc: options.resolveAssetSrc,
    resolveMediaSrc: options.resolveMediaSrc,
    onImagePickerRequest: (pos) => {
      if (options.backendSupportsPathImport()) {
        void options.pickAndInsertImage(pos)
      } else {
        options.core.pendingImageTargetPos = pos
        options.requestImageInput()
      }
    },
    onImagePaste: options.onImagePaste,
    onImageContextMenuRequest: options.openImageContextMenu,
    onFilePickerRequest: (pos) => {
      if (options.backendSupportsPathImport()) {
        void options.pickAndInsertFile(pos)
      } else {
        options.core.pendingFileTargetPos = pos
        options.requestFileInput()
      }
    },
    onFileOpenRequest: (src) => {
      void options.openFileAsset(src)
    },
    onMediaPickerRequest: options.requestMediaPicker,
    onNoteEmbedPickRequest: options.openNoteEmbedPicker,
    onEmbedUrlRequest: options.openEmbedUrlPopover,
    onNoteEmbedContentLoad: async ({ noteId, setHtml, setLoading }) => {
      setLoading(true)
      try {
        setHtml((await loadNoteEmbedContent(options, noteId)) || '')
      } catch {
        setHtml('<p class="nv-embed-error">Failed to load preview</p>')
      } finally {
        setLoading(false)
      }
    },
    onNoteEmbedOpen: options.openNoteEmbed,
    onMathEditRequest: options.openMathEditor,
    onFormulaEditRequest: options.openFormulaEditor,
    onMermaidEditRequest: options.openMermaidEditor,
    onPluginNodeEditRequest: options.openPluginNodeEditor,
    onMarkmapEditRequest: options.openMarkmapEditor,
    onVegaEditRequest: options.openVegaEditor,
    onDrawOpen: options.openDraw,
    onLinkPickerEnter: options.selectActiveLinkPicker,
    onMathInlineInsert: options.insertInlineMath,
    onMathBlockInsert: options.insertBlockMath,
    onSlashMathItemRan: options.openSelectedMathEditor,
    onSlashEmojiPickRequest: options.openSlashEmojiPicker,
    onCalloutIconPickRequest: options.openCalloutIconPicker,
    onTemplateInsertRequest: options.openTemplatePicker,
    onAiAskRequest: (submit) => {
      aiAskResolver = submit
      aiAskValue.value = ''
      aiAskOpen.value = true
    },
  })

  return {
    editorSetup,
    aiAskOpen,
    aiAskValue,
    confirmAiAsk,
    cancelAiAsk,
  }
}
