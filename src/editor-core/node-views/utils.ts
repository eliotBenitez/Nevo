import { h, render } from 'vue'
import hljs from 'highlight.js/lib/common'
import type { Node as PMNode } from 'prosemirror-model'
import { NodeSelection } from 'prosemirror-state'
import type { EditorView } from 'prosemirror-view'
import NvPopupMenu from '../../ui/primitives/NvPopupMenu.vue'
import type { NvMenuItemDef } from '../../ui/primitives/menu-types'
import type { DatabaseRepository } from '../../features/database/databaseRepository'

export type NodeViewPosition = (() => number | undefined) | boolean

export interface CodeHighlightResult {
  language: string | null
  html: string
}

export interface CoreNodeViewOptions {
  databaseRepository?: DatabaseRepository
  onRequestCalloutIconPick?: (ctx: {
    view: EditorView
    position: number
    node: PMNode
    anchorRect: DOMRect
  }) => void
  onRequestImageAsset?: (ctx: { view: EditorView; position: number; attrs: Record<string, unknown> }) => void
  resolveAssetSrc?: (relativeSrc: string) => string
  /** Resolve a relative asset src to a streaming HTTP URL (for <video>); null until ready. */
  resolveMediaSrc?: (relativeSrc: string) => string | null
  onRequestImageContextMenu?: (ctx: {
    view: EditorView
    position: number
    attrs: Record<string, unknown>
    anchorRect: DOMRect
    anchorPoint?: { top: number; left: number }
    focusCaption: () => void
  }) => void
  onRequestFileAsset?: (ctx: { view: EditorView; position: number; attrs: Record<string, unknown> }) => void
  onOpenFileAsset?: (ctx: { view: EditorView; position: number; attrs: Record<string, unknown>; src: string }) => void
  onRequestMathEdit?: (ctx: {
    view: EditorView
    position: number
    node: PMNode
    isInline: boolean
    anchorRect: DOMRect
  }) => void
  onRequestFormulaEdit?: (ctx: { view: EditorView; cellPos: number; formula: string; anchorRect: DOMRect }) => void
  onRequestMermaidEdit?: (ctx: { view: EditorView; position: number; node: PMNode; anchorRect: DOMRect }) => void
  onRequestMarkmapEdit?: (ctx: { view: EditorView; position: number; node: PMNode; anchorRect: DOMRect }) => void
  onRequestVegaEdit?: (ctx: { view: EditorView; position: number; node: PMNode; anchorRect: DOMRect }) => void
  onRequestDrawOpen?: (ctx: { view: EditorView; position: number; node: PMNode }) => void
  onRequestNoteEmbedPick?: (ctx: { view: EditorView; position: number; anchorRect: DOMRect }) => void
  onNoteEmbedOpen?: (noteId: string) => void
  onNoteEmbedContentLoad?: (ctx: {
    noteId: string
    setHtml: (html: string) => void
    setLoading: (v: boolean) => void
  }) => void
  onRequestMediaAsset?: (ctx: { view: EditorView; position: number; kind: 'audio' | 'video'; attrs: Record<string, unknown> }) => void
  onRequestEmbedUrl?: (ctx: { view: EditorView; position: number; anchorRect: DOMRect }) => void
  codeLanguages?: string[]
  t?: (key: string) => string
}

export function resolveNodePosition(getPos: NodeViewPosition): number | undefined {
  if (typeof getPos !== 'function') return undefined
  return getPos()
}

export function escapeHtml(input: string): string {
  return input.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export function getStringAttr(node: PMNode, key: string, fallback = ''): string {
  const value = node.attrs[key]
  return typeof value === 'string' ? value : fallback
}

export function getCodeHighlight(text: string, language: string | null): CodeHighlightResult {
  const normalized = language?.trim() ? language.trim() : null
  if (normalized && hljs.getLanguage(normalized)) {
    try {
      return { language: normalized, html: hljs.highlight(text, { language: normalized, ignoreIllegals: true }).value }
    } catch {
      return { language: normalized, html: escapeHtml(text) }
    }
  }
  if (normalized) {
    return { language: normalized, html: escapeHtml(text) }
  }
  try {
    const highlighted = hljs.highlightAuto(text)
    return { language: highlighted.language ?? null, html: highlighted.value }
  } catch {
    return { language: null, html: escapeHtml(text) }
  }
}

export function formatLanguageLabel(language: string | null): string {
  if (!language) return 'Auto'
  const normalized = language.trim().toLowerCase()
  if (!normalized) return 'Auto'
  if (normalized === 'typescript') return 'TypeScript'
  if (normalized === 'javascript') return 'JavaScript'
  if (normalized === 'markdown') return 'Markdown'
  return normalized.charAt(0).toUpperCase() + normalized.slice(1)
}

export function inferCodeFilename(language: string | null): string {
  const normalized = language?.trim().toLowerCase() ?? ''
  switch (normalized) {
    case 'typescript': return 'schema.ts'
    case 'javascript': return 'schema.js'
    case 'rust': return 'schema.rs'
    case 'python': return 'schema.py'
    case 'go': return 'schema.go'
    case 'json': return 'schema.json'
    case 'css': return 'schema.css'
    case 'html': return 'schema.html'
    case 'sql': return 'schema.sql'
    case 'markdown': return 'notes.md'
    default: return 'snippet.txt'
  }
}

export function renderHighlightedCodeLines(highlightedHtml: string, activeLineIndex: number | null): string {
  const lines = highlightedHtml.split('\n')
  return lines
    .map((line, index) => {
      const activeClass = activeLineIndex === index ? ' is-active' : ''
      const safeLine = line.length > 0 ? line : '&nbsp;'
      return `<div class="nv-code-line${activeClass}"><span class="nv-code-line-no">${index + 1}</span><span class="nv-code-line-content">${safeLine}</span></div>`
    })
    .join('')
}

export function createUpdateAttrs(
  view: EditorView,
  getPos: NodeViewPosition,
): (nextAttrs: Record<string, unknown>) => void {
  return (nextAttrs: Record<string, unknown>): void => {
    const position = resolveNodePosition(getPos)
    if (typeof position !== 'number') return
    view.dispatch(view.state.tr.setNodeMarkup(position, undefined, nextAttrs))
  }
}

export function createLazyRenderObserver(
  dom: HTMLElement,
  onVisible: () => void,
): { isInitiallyVisible: boolean; disconnect: () => void } {
  if (typeof IntersectionObserver === 'undefined') {
    return { isInitiallyVisible: true, disconnect: () => {} }
  }
  let observer: IntersectionObserver | null = new IntersectionObserver((entries) => {
    if (!entries[0]?.isIntersecting) return
    observer?.disconnect()
    observer = null
    onVisible()
  }, { rootMargin: '200px' })
  observer.observe(dom)
  return {
    isInitiallyVisible: false,
    disconnect: () => {
      observer?.disconnect()
      observer = null
    },
  }
}

export function selectNodeAt(view: EditorView, position: number): void {
  view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, position)))
}

/**
 * Renders (or re-renders) a "three dots" overflow menu button into `container`,
 * mounting an `NvPopupMenu` with the given items. Used by node views that expose
 * a per-block overflow menu (media, note embed) so the trigger button/icon markup
 * and popup wiring aren't duplicated per node view.
 */
export function renderNodeOverflowMenu(
  container: HTMLElement,
  items: NvMenuItemDef[],
  triggerClassName: string,
): void {
  const menuVNode = h(NvPopupMenu, {
    items,
    placement: 'bottom-end',
  }, {
    trigger: () => h('button', {
      type: 'button',
      className: triggerClassName,
    }, [
      h('svg', {
        xmlns: 'http://www.w3.org/2000/svg',
        width: '16',
        height: '16',
        viewBox: '0 0 24 24',
        fill: 'none',
        stroke: 'currentColor',
        'stroke-width': '2',
        'stroke-linecap': 'round',
        'stroke-linejoin': 'round',
      }, [
        h('circle', { cx: '12', cy: '12', r: '1' }),
        h('circle', { cx: '12', cy: '5', r: '1' }),
        h('circle', { cx: '12', cy: '19', r: '1' }),
      ]),
    ]),
  })
  render(menuVNode, container)
}

export function addClickHandler(
  el: HTMLElement,
  onClick: (e: MouseEvent) => void,
): () => void {
  const onMouseDown = (e: MouseEvent) => e.preventDefault()
  el.addEventListener('mousedown', onMouseDown)
  el.addEventListener('click', onClick)
  return () => {
    el.removeEventListener('mousedown', onMouseDown)
    el.removeEventListener('click', onClick)
  }
}
