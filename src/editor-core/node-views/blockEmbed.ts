import { DOMSerializer } from 'prosemirror-model'
import type { Node as PMNode } from 'prosemirror-model'
import type { EditorView, NodeView } from 'prosemirror-view'
import type { BlockNode } from '../../types/note'
import { getStringAttr, type CoreNodeViewOptions, type NodeViewPosition } from './utils'

// Inline lucide "link-2" / "link-2-off" glyphs (matches the icon set used
// elsewhere via @lucide/vue) — this node view is plain DOM, not Vue, so
// the paths are copied rather than importing the component.
const ICON_LINK =
  '<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 17H7A5 5 0 0 1 7 7h2"/><path d="M15 7h2a5 5 0 1 1 0 10h-2"/><line x1="8" x2="16" y1="12" y2="12"/></svg>'
const ICON_LINK_OFF =
  '<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 17H7A5 5 0 0 1 7 7"/><path d="M15 7h2a5 5 0 0 1 4 8"/><line x1="8" x2="12" y1="12" y2="12"/><line x1="2" x2="22" y1="2" y2="22"/></svg>'
const ICON_SPINNER =
  '<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="nv-block-embed__spinner"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>'

/**
 * Read-only transclusion of a single block from another (or the same) note.
 * v1 scope (see task): no interactive nested node view for rich atom targets
 * (mermaid/draw/vega/markmap/database/query/image/math) — they render via
 * their own static `toDOM`, same as any other resolved node, through
 * `DOMSerializer`. The rendered subtree is inert (no contenteditable, no
 * nested node views), which is why `stopEvent`/`ignoreMutation` both return
 * `true`: ProseMirror must never try to reconcile edits inside it.
 */
export function createBlockEmbedNodeView(
  node: PMNode,
  view: EditorView,
  _getPos: NodeViewPosition,
  options?: CoreNodeViewOptions,
): NodeView {
  const t = options?.t || ((key: string) => key)

  const dom = document.createElement('div')
  dom.className = 'nv-block-embed'

  const headerEl = document.createElement('div')
  headerEl.className = 'nv-block-embed__header'

  // Decorative "this is a live mirror" affordance — purely visual, the
  // accessible name/state lives on titleEl below.
  const iconEl = document.createElement('span')
  iconEl.className = 'nv-block-embed__icon'
  iconEl.setAttribute('aria-hidden', 'true')
  iconEl.innerHTML = ICON_LINK

  const titleEl = document.createElement('button')
  titleEl.type = 'button'
  titleEl.className = 'nv-block-embed__title'
  headerEl.append(iconEl, titleEl)

  const bodyEl = document.createElement('div')
  bodyEl.className = 'nv-block-embed__body nv-prose'
  // The mirrored subtree is a read-only projection of content that already
  // lives (interactively) in its source note — `inert` keeps it out of the
  // tab order and the accessibility tree so screen reader users aren't
  // handed a duplicate, non-functional copy of e.g. internal links.
  bodyEl.inert = true

  dom.append(headerEl, bodyEl)

  let currentNode = node
  let currentNoteId = ''
  // Bumped on every resolve() call so a slow/late async resolution from a
  // previous attrs value can't clobber a newer one (rapid noteId/blockId
  // changes, e.g. undo/redo across a paste).
  let requestToken = 0
  let unsubscribeSaved: (() => void) | null = null

  const onOpen = (event: MouseEvent) => {
    event.preventDefault()
    if (currentNoteId) options?.onOpenBlockRefSource?.(currentNoteId)
  }
  titleEl.addEventListener('mousedown', (event) => event.preventDefault())
  titleEl.addEventListener('click', onOpen)

  // titleEl is a live-mirror affordance: visually it just shows the source
  // note title (kept short/quiet per design), while its accessible name
  // spells out "Referenced from <title>" so screen reader users get the same
  // context sighted users get from the leading link icon.
  const setTitleLabel = (sourceTitle: string | undefined, openable: boolean) => {
    const label = sourceTitle || t('editor.blockEmbed.header')
    titleEl.textContent = label
    titleEl.disabled = !openable
    if (openable) {
      const prefix = t('editor.blockEmbed.referencedFromPrefix')
      titleEl.setAttribute('aria-label', `${prefix} ${label}. ${t('editor.blockEmbed.openSource')}`)
      titleEl.title = t('editor.blockEmbed.openSource')
    } else {
      titleEl.removeAttribute('aria-label')
      titleEl.removeAttribute('title')
    }
  }

  const renderNotFound = (sourceTitle?: string) => {
    setTitleLabel(sourceTitle, !!currentNoteId)
    iconEl.innerHTML = ICON_LINK_OFF
    dom.dataset.state = 'not-found'
    bodyEl.innerHTML = ''
    const notice = document.createElement('div')
    notice.className = 'nv-block-embed__notice'
    notice.innerHTML = ICON_LINK_OFF
    const noticeText = document.createElement('span')
    noticeText.textContent = t('editor.blockEmbed.notFound')
    notice.append(noticeText)
    bodyEl.append(notice)
  }

  const renderResolved = (resolvedNode: BlockNode, sourceTitle: string) => {
    setTitleLabel(sourceTitle, true)
    iconEl.innerHTML = ICON_LINK
    dom.dataset.state = 'ok'
    bodyEl.innerHTML = ''
    try {
      const pmNode = view.state.schema.nodeFromJSON(resolvedNode)
      const rendered = DOMSerializer.fromSchema(view.state.schema).serializeNode(pmNode)
      bodyEl.append(rendered)
    } catch {
      // A resolved block whose JSON no longer matches the live schema (e.g. a
      // plugin-defined node type that got uninstalled) — fall back rather
      // than leaving a broken/partial DOM tree.
      renderNotFound(sourceTitle)
    }
  }

  const resolve = () => {
    const noteId = getStringAttr(currentNode, 'noteId')
    const blockId = getStringAttr(currentNode, 'blockId')
    currentNoteId = noteId

    unsubscribeSaved?.()
    unsubscribeSaved = noteId ? options?.onSubscribeNoteSaved?.(noteId, resolve) ?? null : null

    if (!noteId || !blockId || !options?.onResolveBlockRef) {
      renderNotFound()
      return
    }

    const token = ++requestToken
    dom.dataset.state = 'loading'
    // Only show the loading placeholder on the very first resolve — a
    // background resubscribe refresh (the note was saved elsewhere) should
    // keep the last-known content visible rather than flashing back to a
    // generic "loading" label on every save.
    if (bodyEl.childElementCount === 0) {
      titleEl.textContent = t('editor.blockEmbed.loading')
      titleEl.disabled = true
      titleEl.removeAttribute('aria-label')
      titleEl.removeAttribute('title')
      bodyEl.innerHTML = `<div class="nv-block-embed__loading">${ICON_SPINNER}</div>`
    }

    options.onResolveBlockRef({ noteId, blockId })
      .then((resolution) => {
        if (token !== requestToken) return
        if (resolution.status === 'ok') {
          renderResolved(resolution.node, resolution.sourceTitle)
        } else if (resolution.status === 'block-missing') {
          renderNotFound(resolution.sourceTitle)
        } else {
          renderNotFound()
        }
      })
      .catch(() => {
        if (token !== requestToken) return
        renderNotFound()
      })
  }

  resolve()

  return {
    dom,
    stopEvent: () => true,
    ignoreMutation: () => true,
    update(nextNode) {
      if (nextNode.type !== currentNode.type) return false
      const noteChanged = getStringAttr(nextNode, 'noteId') !== getStringAttr(currentNode, 'noteId')
      const blockChanged = getStringAttr(nextNode, 'blockId') !== getStringAttr(currentNode, 'blockId')
      currentNode = nextNode
      if (noteChanged || blockChanged) resolve()
      return true
    },
    destroy() {
      unsubscribeSaved?.()
    },
  }
}
