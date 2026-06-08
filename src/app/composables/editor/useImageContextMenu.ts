import { computed, markRaw, reactive, toRaw } from 'vue'
import type { EditorView } from 'prosemirror-view'
import { NodeSelection } from 'prosemirror-state'
import { useI18n } from 'vue-i18n'
import { AlignCenter, AlignLeft, AlignRight, ArrowLeftRight, Copy, PencilLine, Scissors, Trash2 } from 'lucide-vue-next'
import type { NvMenuItemDef } from '../../../ui/primitives/menu-types'
import { isProseMirrorTransformError } from './prosemirrorErrors'
import { appLogger } from '../../../utils/logger'

// EditorCore is intentionally not required here — the active view is captured
// from the context-menu request payload.

export interface ImageContextMenuRequest {
  position: number
  attrs: Record<string, unknown>
  focusCaption: () => void
  view: EditorView
  anchorRect: DOMRect
  anchorPoint?: { top: number; left: number }
}

interface ImageCtxMenuState {
  open: boolean
  pos: { top: number; left: number }
  nodePos: number
  attrs: Record<string, unknown>
  focusCaption: () => void
  view: EditorView | null
}

/** Image block context menu (caption / copy / cut / align / size / delete),
 *  extracted from WorkspaceEditorPane. */
export function useImageContextMenu(getWorkspacePath: () => string | null) {
  const { t } = useI18n()

  const imageCtxMenu = reactive<ImageCtxMenuState>({
    open: false,
    pos: { top: 0, left: 0 },
    nodePos: -1,
    attrs: {},
    focusCaption: () => {},
    view: null,
  })

  function openImageContextMenu(ctx: ImageContextMenuRequest) {
    imageCtxMenu.nodePos = ctx.position
    imageCtxMenu.attrs = ctx.attrs
    imageCtxMenu.focusCaption = ctx.focusCaption
    imageCtxMenu.view = ctx.view
    imageCtxMenu.pos = ctx.anchorPoint ?? { top: ctx.anchorRect.bottom + 4, left: ctx.anchorRect.left }
    imageCtxMenu.open = true
  }

  function getImageNodeView() {
    const v = imageCtxMenu.view ? toRaw(imageCtxMenu.view) : null
    if (!v || imageCtxMenu.nodePos < 0) return null
    const nodeType = v.state.schema.nodes.image_block
    if (!nodeType) return null
    try {
      const node = v.state.doc.nodeAt(imageCtxMenu.nodePos)
      if (!node || node.type !== nodeType) return null
      return { view: v, pos: imageCtxMenu.nodePos, node }
    } catch {
      return null
    }
  }

  function updateImageAttribute(name: 'align' | 'sizePreset', value: string) {
    const ctx = getImageNodeView()
    if (!ctx) return

    try {
      ctx.view.dispatch(ctx.view.state.tr.setNodeAttribute(ctx.pos, name, value).scrollIntoView())
      ctx.view.focus()
    } catch (error) {
      if (!isProseMirrorTransformError(error)) throw error
      void appLogger.warn({
        source: 'frontend.editor',
        event: 'image_attr_transform_error',
        message: 'Image attribute update failed during document transform',
        workspacePath: getWorkspacePath(),
        error,
        payload: { attr: name, value, pos: ctx.pos },
      })
    } finally {
      imageCtxMenu.open = false
    }
  }

  function setImageAlign(align: 'left' | 'center' | 'right') {
    updateImageAttribute('align', align)
  }

  function setImageSize(sizePreset: 'small' | 'medium' | 'large' | 'full') {
    updateImageAttribute('sizePreset', sizePreset)
  }

  function deleteImageBlock() {
    const ctx = getImageNodeView()
    if (!ctx) return
    try {
      ctx.view.dispatch(ctx.view.state.tr.delete(ctx.pos, ctx.pos + ctx.node.nodeSize).scrollIntoView())
      ctx.view.focus()
    } catch (error) {
      if (!isProseMirrorTransformError(error)) throw error
      void appLogger.warn({
        source: 'frontend.editor',
        event: 'image_delete_transform_error',
        message: 'Image delete failed during document transform',
        workspacePath: getWorkspacePath(),
        error,
        payload: { pos: ctx.pos },
      })
    } finally {
      imageCtxMenu.open = false
    }
  }

  function copyImageBlock() {
    const ctx = getImageNodeView()
    if (!ctx) return
    const tr = ctx.view.state.tr.setSelection(NodeSelection.create(ctx.view.state.doc, ctx.pos))
    ctx.view.dispatch(tr)
    document.execCommand('copy')
    ctx.view.focus()
  }

  function cutImageBlock() {
    const ctx = getImageNodeView()
    if (!ctx) return
    const tr = ctx.view.state.tr.setSelection(NodeSelection.create(ctx.view.state.doc, ctx.pos))
    ctx.view.dispatch(tr)
    document.execCommand('cut')
    ctx.view.focus()
  }

  const imageMenuItems = computed<NvMenuItemDef[]>(() => {
    if (!imageCtxMenu.view) return []
    return [
      {
        label: t('image.menu.caption'),
        icon: markRaw(PencilLine),
        action: () => { imageCtxMenu.focusCaption() },
      },
      { type: 'separator' },
      { label: t('image.menu.copy'), icon: markRaw(Copy), action: copyImageBlock },
      { label: t('image.menu.cut'), icon: markRaw(Scissors), action: cutImageBlock },
      { type: 'separator' },
      { type: 'label', label: t('image.menu.align') },
      { label: t('image.menu.alignLeft'),   icon: markRaw(AlignLeft),   action: () => setImageAlign('left') },
      { label: t('image.menu.alignCenter'), icon: markRaw(AlignCenter), action: () => setImageAlign('center') },
      { label: t('image.menu.alignRight'),  icon: markRaw(AlignRight),  action: () => setImageAlign('right') },
      { type: 'separator' },
      {
        label: t('image.menu.width'),
        icon: markRaw(ArrowLeftRight),
        items: [
          { label: t('image.size.small'),  action: () => setImageSize('small') },
          { label: t('image.size.medium'), action: () => setImageSize('medium') },
          { label: t('image.size.large'),  action: () => setImageSize('large') },
          { label: t('image.size.full'),   action: () => setImageSize('full') },
        ],
      },
      { type: 'separator' },
      { label: t('image.menu.delete'), icon: markRaw(Trash2), danger: true, action: deleteImageBlock },
    ]
  })

  return { imageCtxMenu, imageMenuItems, openImageContextMenu }
}
