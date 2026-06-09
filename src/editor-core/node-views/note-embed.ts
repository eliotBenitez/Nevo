import { h, markRaw, render } from 'vue'
import type { Node as PMNode } from 'prosemirror-model'
import type { EditorView, NodeView } from 'prosemirror-view'
import { ExternalLink, Link, Trash2 } from 'lucide-vue-next'
import NvPopupMenu from '../../ui/primitives/NvPopupMenu.vue'
import { resolveNodePosition, getStringAttr, type CoreNodeViewOptions, type NodeViewPosition } from './utils'

const SAFE_URL_RE = /^(https?:|mailto:|tel:|asset:|blob:|data:image\/|#|\/|\.\/|\.\.\/|[^:]*$)/i

/**
 * Embedded-note previews are rendered read-only via innerHTML. The HTML is
 * produced by the app's own serializer, but the underlying note content can come
 * from a collaborator, so neutralize active content before insertion:
 * drop <script>/<style>, strip `on*` handlers, and reject unsafe href/src URLs
 * (e.g. `javascript:`). Dependency-free to avoid pulling in a sanitizer lib.
 */
function sanitizeEmbedHtml(html: string): string {
  if (!html) return ''
  const tpl = document.createElement('template')
  tpl.innerHTML = html
  const walker = document.createTreeWalker(tpl.content, NodeFilter.SHOW_ELEMENT)
  const toRemove: Element[] = []
  let el = walker.nextNode() as Element | null
  while (el) {
    const tag = el.tagName.toLowerCase()
    if (tag === 'script' || tag === 'style' || tag === 'iframe' || tag === 'object' || tag === 'embed') {
      toRemove.push(el)
    } else {
      for (const attr of Array.from(el.attributes)) {
        const name = attr.name.toLowerCase()
        if (name.startsWith('on')) {
          el.removeAttribute(attr.name)
        } else if ((name === 'href' || name === 'src' || name === 'xlink:href') && !SAFE_URL_RE.test(attr.value.trim())) {
          el.removeAttribute(attr.name)
        }
      }
    }
    el = walker.nextNode() as Element | null
  }
  toRemove.forEach((node) => node.remove())
  return tpl.innerHTML
}

export function createNoteEmbedNodeView(
  node: PMNode,
  view: EditorView,
  getPos: NodeViewPosition,
  options?: CoreNodeViewOptions,
): NodeView {
  const t = options?.t || ((key: string) => key)

  const dom = document.createElement('div')
  dom.className = 'nv-note-embed-block'

  const card = document.createElement('div')
  card.className = 'nv-note-embed-card'

  // --- Header ---
  const headerEl = document.createElement('div')
  headerEl.className = 'nv-note-embed-header'

  const iconEl = document.createElement('span')
  iconEl.className = 'nv-note-embed-icon'
  const defaultIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg>`
  iconEl.innerHTML = defaultIcon

  const titleEl = document.createElement('span')
  titleEl.className = 'nv-note-embed-title'

  const moreBtnContainer = document.createElement('div')
  moreBtnContainer.className = 'nv-note-embed-more-container'

  headerEl.append(iconEl, titleEl, moreBtnContainer)

  // --- Divider ---
  const dividerEl = document.createElement('div')
  dividerEl.className = 'nv-note-embed-divider'
  dividerEl.style.display = 'none'

  // --- Loading ---
  const loadingEl = document.createElement('div')
  loadingEl.className = 'nv-note-embed-loading'
  loadingEl.innerHTML = '<div class="nv-spinner"></div>'
  loadingEl.style.display = 'none'

  // --- Content (rendered HTML) ---
  const contentEl = document.createElement('div')
  contentEl.className = 'nv-note-embed-content nv-prose'
  contentEl.style.display = 'none'

  card.append(headerEl, dividerEl, loadingEl, contentEl)
  dom.append(card)

  let currentNode = node
  let lastLoadedNoteId = ''

  const setHtml = (html: string) => {
    contentEl.innerHTML = sanitizeEmbedHtml(html)
    loadingEl.style.display = 'none'
    contentEl.style.display = html ? '' : 'none'
  }

  const setLoading = (v: boolean) => {
    loadingEl.style.display = v ? 'flex' : 'none'
    if (v) contentEl.style.display = 'none'
  }

  const onOpen = () => {
    const noteId = getStringAttr(currentNode, 'noteId')
    if (!noteId) return
    options?.onNoteEmbedOpen?.(noteId)
  }

  const onRemove = () => {
    const position = resolveNodePosition(getPos)
    if (typeof position !== 'number') return
    view.dispatch(view.state.tr.delete(position, position + currentNode.nodeSize).scrollIntoView())
  }

  const sync = () => {
    const noteId = getStringAttr(currentNode, 'noteId')
    const title = getStringAttr(currentNode, 'title')
    const icon = getStringAttr(currentNode, 'icon')

    titleEl.textContent = title || (noteId ? t('noteEmbed.untitled') : t('noteEmbed.noNoteSelected'))
    dom.dataset.hasNote = noteId ? 'true' : 'false'

    if (icon && !icon.startsWith('lucide:')) {
      iconEl.textContent = icon
      iconEl.style.fontSize = '16px'
    } else {
      iconEl.innerHTML = defaultIcon
      iconEl.style.fontSize = ''
    }

    if (noteId !== lastLoadedNoteId) {
      lastLoadedNoteId = noteId
      if (noteId) {
        dividerEl.style.display = ''
        setLoading(true)
        options?.onNoteEmbedContentLoad?.({ noteId, setHtml, setLoading })
      } else {
        dividerEl.style.display = 'none'
        contentEl.innerHTML = ''
        contentEl.style.display = 'none'
        loadingEl.style.display = 'none'
      }
    }

    // Render Popup Menu
    const menuVNode = h(NvPopupMenu, {
      items: [
        {
          label: noteId ? t('noteEmbed.change') : t('noteEmbed.pickNote'),
          icon: markRaw(Link),
          action: onPick,
        },
        {
          label: t('noteEmbed.open'),
          icon: markRaw(ExternalLink),
          action: onOpen,
          disabled: !noteId,
        },
        {
          type: 'separator',
        },
        {
          label: t('noteEmbed.remove'),
          icon: markRaw(Trash2),
          danger: true,
          action: onRemove,
        },
      ],
      placement: 'bottom-end',
    }, {
      trigger: () => h('button', {
        type: 'button',
        className: 'nv-note-embed-more-btn',
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
    render(menuVNode, moreBtnContainer)
  }

  const onPick = () => {
    const position = resolveNodePosition(getPos)
    if (typeof position !== 'number') return
    options?.onRequestNoteEmbedPick?.({
      view,
      position,
      anchorRect: moreBtnContainer.getBoundingClientRect(),
    })
  }

  sync()

  return {
    dom,
    stopEvent: () => false,
    update(nextNode) {
      if (nextNode.type !== currentNode.type) return false
      currentNode = nextNode
      sync()
      return true
    },
    destroy() {
      render(null, moreBtnContainer)
    },
  }
}
