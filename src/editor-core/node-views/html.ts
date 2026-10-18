import type { Node as PMNode } from 'prosemirror-model'
import type { EditorView, NodeView } from 'prosemirror-view'
import {
  resolveNodePosition,
  getStringAttr,
  selectNodeAt,
  type CoreNodeViewOptions,
  type NodeViewPosition,
} from './utils'
import { MAX_EMBED_SOURCE_CHARS } from './embedLimits'
import { clampHtmlBlockHeight, HTML_BLOCK_CSP_META } from '../schema/htmlBlock'

const FALLBACK_COLOR = 'CanvasText'
const FALLBACK_FONT = 'system-ui, sans-serif'

// Values come from computed style; strip angle brackets so they can never close the <style> tag.
function safeCssValue(value: string, fallback: string): string {
  const cleaned = value.replace(/[<>]/g, '').trim()
  return cleaned || fallback
}

function buildSrcdoc(code: string, view: EditorView): string {
  const computed = typeof getComputedStyle === 'function' ? getComputedStyle(view.dom) : null
  const color = safeCssValue(computed?.color ?? '', FALLBACK_COLOR)
  const font = safeCssValue(computed?.fontFamily ?? '', FALLBACK_FONT)
  return `<!doctype html><meta charset="utf-8">${HTML_BLOCK_CSP_META}<style>html{color-scheme:light dark;color:${color};font-family:${font}}body{margin:12px}</style>${code}`
}

export function createHtmlNodeView(node: PMNode, view: EditorView, getPos: NodeViewPosition, options?: CoreNodeViewOptions): NodeView {
  const dom = document.createElement('div')
  dom.className = 'nv-html-block'

  let currentNode = node
  let iframe: HTMLIFrameElement | null = null
  let placeholder: HTMLElement | null = null
  let renderedSrcdoc: string | null = null

  const applyHeight = () => {
    if (iframe) iframe.style.height = `${clampHtmlBlockHeight(currentNode.attrs.height)}px`
  }

  const sync = () => {
    const code = getStringAttr(currentNode, 'code')
    if (code.length > MAX_EMBED_SOURCE_CHARS) {
      iframe?.remove()
      iframe = null
      renderedSrcdoc = null
      if (!placeholder) {
        placeholder = document.createElement('div')
        placeholder.className = 'nv-html-block-placeholder'
        dom.append(placeholder)
      }
      placeholder.textContent = options?.t?.('editor.embeds.sourceTooLarge') ?? 'Source is too large to render — shorten it to continue'
      dom.dataset.error = 'true'
      return
    }
    placeholder?.remove()
    placeholder = null
    dom.dataset.error = 'false'
    if (!iframe) {
      iframe = document.createElement('iframe')
      // Empty sandbox: no scripts, no same-origin, no forms, no popups.
      iframe.setAttribute('sandbox', '')
      iframe.setAttribute('referrerpolicy', 'no-referrer')
      iframe.setAttribute('loading', 'lazy')
      iframe.title = options?.t?.('editor.html.label') ?? 'HTML block'
      // Clicks fall through to the wrapper so the node gets selected.
      iframe.style.cssText = 'width:100%;border:0;display:block;pointer-events:none'
      dom.append(iframe)
      renderedSrcdoc = null
    }
    applyHeight()
    // Compare the built document, not the code: a theme change alters the baked-in colours.
    const srcdoc = buildSrcdoc(code, view)
    if (srcdoc !== renderedSrcdoc) {
      iframe.srcdoc = srcdoc
      renderedSrcdoc = srcdoc
    }
  }

  const onClick = (event: MouseEvent) => {
    event.preventDefault()
    event.stopPropagation()
    const position = resolveNodePosition(getPos)
    if (typeof position !== 'number') return
    selectNodeAt(view, position)
    // The source popover is shared with the mermaid block.
    options?.onRequestMermaidEdit?.({
      view,
      position,
      node: currentNode,
      anchorRect: new DOMRect(event.clientX - 5, event.clientY - 5, 10, 10),
    })
  }

  dom.addEventListener('click', onClick)
  sync()

  // The srcdoc bakes in the editor text colour; sync() reloads only when it actually changed.
  const themeObserver = typeof MutationObserver === 'undefined' ? null : new MutationObserver(sync)
  themeObserver?.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })

  return {
    dom,
    update(nextNode) {
      if (nextNode.type !== currentNode.type) return false
      currentNode = nextNode
      sync()
      return true
    },
    ignoreMutation: () => true,
    destroy() {
      themeObserver?.disconnect()
      dom.removeEventListener('click', onClick)
    },
  }
}
