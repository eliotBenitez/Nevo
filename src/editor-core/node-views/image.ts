import type { Node as PMNode } from 'prosemirror-model'
import type { EditorView, NodeView } from 'prosemirror-view'
import { resolveNodePosition, getStringAttr, createUpdateAttrs, addClickHandler, type CoreNodeViewOptions, type NodeViewPosition } from './utils'

function buildPlaceholder(): HTMLDivElement {
  const el = document.createElement('div')
  el.className = 'nv-image-placeholder'

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('viewBox', '0 0 24 24')
  svg.setAttribute('fill', 'none')
  svg.setAttribute('stroke', 'currentColor')
  svg.setAttribute('stroke-width', '1.5')
  svg.setAttribute('stroke-linecap', 'round')
  svg.setAttribute('stroke-linejoin', 'round')
  svg.setAttribute('width', '28')
  svg.setAttribute('height', '28')

  const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
  rect.setAttribute('x', '3'); rect.setAttribute('y', '3')
  rect.setAttribute('width', '18'); rect.setAttribute('height', '18')
  rect.setAttribute('rx', '3')

  const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle')
  circle.setAttribute('cx', '8.5'); circle.setAttribute('cy', '8.5'); circle.setAttribute('r', '1.5')

  const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polyline')
  poly.setAttribute('points', '21 15 16 10 5 21')

  svg.append(rect, circle, poly)

  const label = document.createElement('span')
  label.textContent = 'Click to add image'

  el.append(svg, label)
  return el
}

export function createImageNodeView(node: PMNode, view: EditorView, getPos: NodeViewPosition, options?: CoreNodeViewOptions): NodeView {
  const dom = document.createElement('figure')
  dom.className = 'nv-image-block'

  const placeholder = buildPlaceholder()

  const image = document.createElement('img')
  image.className = 'nv-image-preview'
  image.loading = 'lazy'

  const menuBtn = document.createElement('button')
  menuBtn.type = 'button'
  menuBtn.className = 'nv-image-menu-btn'
  menuBtn.setAttribute('aria-label', 'Image options')
  menuBtn.textContent = '···'

  const caption = document.createElement('figcaption')
  caption.className = 'nv-image-caption'
  caption.contentEditable = 'true'
  caption.dataset.placeholder = 'Add caption…'

  dom.append(placeholder, image, menuBtn, caption)

  let currentNode = node
  const updateAttrs = createUpdateAttrs(view, getPos)

  function focusCaption() {
    caption.dataset.forceShow = 'true'
    caption.focus()
    if (caption.textContent === '') {
      const range = document.createRange()
      range.setStart(caption, 0)
      range.collapse(true)
      const sel = window.getSelection()
      sel?.removeAllRanges()
      sel?.addRange(range)
    }
  }

  const resolveSrc = (s: string) => (options?.resolveAssetSrc ? options.resolveAssetSrc(s) : s)

  // Cloud assets resolve asynchronously (fetch + decrypt); the resolver returns
  // '' until the blob URL is cached. Retry a bounded number of times.
  let resolveRetryTimer: ReturnType<typeof setTimeout> | null = null
  let resolveRetries = 0

  const sync = () => {
    const src = getStringAttr(currentNode, 'src')
    const alt = getStringAttr(currentNode, 'alt')
    const cap = getStringAttr(currentNode, 'caption')
    const sizePreset = getStringAttr(currentNode, 'sizePreset', 'medium')
    const align = getStringAttr(currentNode, 'align', 'center')

    dom.dataset.sizePreset = sizePreset
    dom.dataset.align = align

    if (src) {
      placeholder.style.display = 'none'
      image.style.display = ''
      menuBtn.style.display = ''
      const resolved = resolveSrc(src)
      if (resolved && image.src !== resolved) image.src = resolved
      image.alt = alt
      // Unresolved (e.g. cloud asset still fetching) — retry shortly.
      if (!resolved && resolveRetries < 12) {
        resolveRetries++
        if (resolveRetryTimer) clearTimeout(resolveRetryTimer)
        resolveRetryTimer = setTimeout(sync, 350)
      } else if (resolved) {
        resolveRetries = 0
      }
    } else {
      placeholder.style.display = ''
      image.style.display = 'none'
      menuBtn.style.display = 'none'
    }

    if (cap !== caption.textContent) {
      caption.textContent = cap
    }
    if (cap) {
      caption.dataset.forceShow = 'true'
    } else {
      delete caption.dataset.forceShow
    }
  }

  const onPickImage = () => {
    const position = resolveNodePosition(getPos)
    if (typeof position !== 'number') return
    options?.onRequestImageAsset?.({ view, position, attrs: currentNode.attrs })
  }

  const requestContextMenu = (anchorRect: DOMRect, anchorPoint?: { top: number; left: number }) => {
    const position = resolveNodePosition(getPos)
    if (typeof position !== 'number') return
    options?.onRequestImageContextMenu?.({
      view,
      position,
      attrs: currentNode.attrs,
      anchorRect,
      anchorPoint,
      focusCaption,
    })
  }

  const onMenuClick = () => {
    requestContextMenu(menuBtn.getBoundingClientRect())
  }

  const onContextMenu = (event: MouseEvent) => {
    const target = event.target
    if (target instanceof Node && caption.contains(target)) return
    if (!getStringAttr(currentNode, 'src')) return

    event.preventDefault()
    requestContextMenu(dom.getBoundingClientRect(), { top: event.clientY, left: event.clientX })
  }

  const onCaptionInput = () => {
    updateAttrs({ ...currentNode.attrs, caption: caption.textContent ?? '' })
  }

  const onCaptionBlur = () => {
    if (!caption.textContent) {
      delete caption.dataset.forceShow
    }
  }

  const onCaptionKeydown = (e: KeyboardEvent) => {
    if (e.key === 'Escape' || e.key === 'Enter') {
      e.preventDefault()
      caption.blur()
    }
  }

  const cleanupPick = addClickHandler(placeholder, onPickImage)
  const cleanupMenu = addClickHandler(menuBtn, onMenuClick)
  dom.addEventListener('contextmenu', onContextMenu)
  caption.addEventListener('input', onCaptionInput)
  caption.addEventListener('blur', onCaptionBlur)
  caption.addEventListener('keydown', onCaptionKeydown)

  sync()

  return {
    dom,
    ignoreMutation() {
      return true
    },
    stopEvent(event) {
      const target = event.target as Node
      if (caption.contains(target) || menuBtn.contains(target)) return true
      return event.type === 'contextmenu'
    },
    update(nextNode) {
      if (nextNode.type !== currentNode.type) return false
      currentNode = nextNode
      sync()
      return true
    },
    destroy() {
      if (resolveRetryTimer) clearTimeout(resolveRetryTimer)
      cleanupPick()
      cleanupMenu()
      dom.removeEventListener('contextmenu', onContextMenu)
      caption.removeEventListener('input', onCaptionInput)
      caption.removeEventListener('blur', onCaptionBlur)
      caption.removeEventListener('keydown', onCaptionKeydown)
    },
  }
}
