import { nextTick, reactive } from 'vue'
import { NodeSelection } from 'prosemirror-state'
import type { Node as ProseMirrorNode } from 'prosemirror-model'
import type { EditorCore } from './useEditorCore'
import type { ClampOverlayPosition } from './editorPopoverPosition'
import { isProseMirrorTransformError } from './prosemirrorErrors'
import { appLogger } from '../../../utils/logger'

export interface EmbedUrlPopoverState {
  open: boolean
  nodePos: number | null
  position: { top: number; left: number }
}

export interface EmbedUrlResult {
  url: string
  embedType: string
  embedHtml: string
  title: string
  thumbnailUrl: string
}

interface EmbedUrlPopoverRefs {
  getEmbedUrlPopoverEl: () => HTMLElement | null
  focusInput: () => void
}

/** Embed-block URL popover (open / confirm / cancel) extracted from
 *  WorkspaceEditorPane. */
export function useEmbedUrlPopover(
  core: EditorCore,
  refs: EmbedUrlPopoverRefs,
  clampOverlayPosition: ClampOverlayPosition,
  getWorkspacePath: () => string | null,
) {
  const embedUrlPopover = reactive<EmbedUrlPopoverState>({
    open: false,
    nodePos: null,
    position: { top: 0, left: 0 },
  })

  let embedUrlOutsideClickIgnoreUntil = 0

  function isOpeningClickIgnored() {
    return Date.now() < embedUrlOutsideClickIgnoreUntil
  }

  function closeEmbedUrlPopover() {
    embedUrlPopover.open = false
    embedUrlPopover.nodePos = null
  }

  function openEmbedUrlPopover(pos: number, anchorRect: DOMRect) {
    embedUrlOutsideClickIgnoreUntil = Date.now() + 250
    embedUrlPopover.nodePos = pos
    embedUrlPopover.position = { top: anchorRect.bottom + 8, left: anchorRect.left }
    embedUrlPopover.open = true

    void nextTick(() => {
      const popoverEl = (refs.getEmbedUrlPopoverEl()?.firstElementChild as HTMLElement | null)
        ?? refs.getEmbedUrlPopoverEl()
        ?? null
      if (!embedUrlPopover.open || !popoverEl) return
      embedUrlPopover.position = clampOverlayPosition(embedUrlPopover.position, popoverEl)
      refs.focusInput()
    })
  }

  function getEmbedPopoverTarget() {
    const view = core.editorView
    const pos = embedUrlPopover.nodePos
    if (!view || pos === null) return null
    const embedBlock = view.state.schema.nodes.embed_block
    if (!embedBlock) return null
    const node = view.state.doc.nodeAt(pos)
    if (!node || node.type !== embedBlock) return null
    return { view, pos, node }
  }

  function isEmptyEmbedNode(node: ProseMirrorNode) {
    return ['url', 'embedType', 'embedHtml', 'title', 'thumbnailUrl']
      .every((key) => typeof node.attrs[key] !== 'string' || node.attrs[key].trim() === '')
  }

  function confirmEmbedUrl(result: EmbedUrlResult) {
    const target = getEmbedPopoverTarget()
    if (!target) {
      closeEmbedUrlPopover()
      return
    }

    try {
      const tr = target.view.state.tr
        .setNodeMarkup(target.pos, undefined, { ...target.node.attrs, ...result })
      target.view.dispatch(tr
        .setSelection(NodeSelection.create(tr.doc, target.pos))
        .scrollIntoView())
      target.view.focus()
    } catch (error) {
      if (!isProseMirrorTransformError(error)) throw error
      void appLogger.warn({
        source: 'frontend.editor',
        event: 'embed_attr_transform_error',
        message: 'Embed attribute update failed during document transform',
        workspacePath: getWorkspacePath(),
        error,
        payload: { pos: target.pos, url: result.url },
      })
    } finally {
      closeEmbedUrlPopover()
    }
  }

  function cancelEmbedUrl() {
    const target = getEmbedPopoverTarget()
    try {
      if (target && isEmptyEmbedNode(target.node)) {
        target.view.dispatch(target.view.state.tr.delete(target.pos, target.pos + target.node.nodeSize).scrollIntoView())
        target.view.focus()
      }
    } catch (error) {
      if (!isProseMirrorTransformError(error)) throw error
      void appLogger.warn({
        source: 'frontend.editor',
        event: 'embed_cancel_transform_error',
        message: 'Embed cancel failed during document transform',
        workspacePath: getWorkspacePath(),
        error,
        payload: { pos: target?.pos },
      })
    } finally {
      closeEmbedUrlPopover()
    }
  }

  function onEmbedUrlInputKeyDown(event: KeyboardEvent) {
    if (event.key !== 'Escape') return
    event.preventDefault()
    event.stopPropagation()
    cancelEmbedUrl()
  }

  return {
    embedUrlPopover,
    openEmbedUrlPopover,
    closeEmbedUrlPopover,
    confirmEmbedUrl,
    cancelEmbedUrl,
    onEmbedUrlInputKeyDown,
    isOpeningClickIgnored,
  }
}
