import { h, markRaw, render } from 'vue'
import type { Node as PMNode } from 'prosemirror-model'
import type { EditorView, NodeView } from 'prosemirror-view'
import { FolderOpen, Trash2 } from 'lucide-vue-next'
import NvPopupMenu from '../../ui/primitives/NvPopupMenu.vue'
import { resolveNodePosition, getStringAttr, type CoreNodeViewOptions, type NodeViewPosition } from './utils'

function getMimeCategory(mime: string): string {
  if (mime === 'application/pdf') return 'pdf'
  if (mime.startsWith('audio/')) return 'audio'
  if (mime.startsWith('video/')) return 'video'
  if (mime.startsWith('image/')) return 'image'
  if (mime.includes('zip') || mime.includes('rar') || mime.includes('tar') || mime.includes('7z') || mime.includes('gzip')) return 'archive'
  if (mime.includes('word') || mime.includes('document')) return 'document'
  if (mime.includes('sheet') || mime.includes('excel') || mime.includes('spreadsheet')) return 'spreadsheet'
  if (mime.includes('presentation') || mime.includes('powerpoint')) return 'slides'
  if (mime.startsWith('text/')) return 'text'
  return 'generic'
}

const CATEGORY_LABELS: Record<string, string> = {
  pdf: 'PDF', audio: 'Audio', video: 'Video', image: 'Image',
  archive: 'Archive', document: 'Doc', spreadsheet: 'Sheet',
  slides: 'Slides', text: 'Text', generic: 'File',
}

function formatFileSize(bytes: number): string {
  if (!bytes || bytes <= 0) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1073741824) return `${(bytes / 1048576).toFixed(1)} MB`
  return `${(bytes / 1073741824).toFixed(1)} GB`
}

export function createFileNodeView(
  node: PMNode,
  view: EditorView,
  getPos: NodeViewPosition,
  options?: CoreNodeViewOptions,
): NodeView {
  const t = options?.t || ((key: string) => key)
  const dom = document.createElement('div')
  dom.className = 'nv-file-block'

  const card = document.createElement('div')
  card.className = 'nv-file-card'

  const iconEl = document.createElement('div')
  iconEl.className = 'nv-file-icon'

  const info = document.createElement('div')
  info.className = 'nv-file-info'

  const nameEl = document.createElement('span')
  nameEl.className = 'nv-file-name'

  const sizeEl = document.createElement('span')
  sizeEl.className = 'nv-file-size'

  info.append(nameEl, sizeEl)

  const moreBtnContainer = document.createElement('div')
  moreBtnContainer.className = 'nv-file-more-container'

  card.append(iconEl, info, moreBtnContainer)
  dom.append(card)

  let currentNode = node

  const sync = () => {
    const src = getStringAttr(currentNode, 'src')
    const filename = getStringAttr(currentNode, 'filename')
    const mime = getStringAttr(currentNode, 'mime')
    const size = typeof currentNode.attrs.size === 'number' ? currentNode.attrs.size : 0
    const category = getMimeCategory(mime)

    dom.dataset.hasFile = src ? 'true' : 'false'
    iconEl.dataset.category = category
    iconEl.textContent = CATEGORY_LABELS[category] ?? 'File'
    nameEl.textContent = filename || (src ? 'File' : 'Attach a file…')
    sizeEl.textContent = src ? formatFileSize(size) : ''

    moreBtnContainer.style.display = src ? '' : 'none'

    if (src) {
      // Render Popup Menu
      const menuVNode = h(NvPopupMenu, {
        items: [
          {
            label: t('media.replace'),
            icon: markRaw(FolderOpen),
            action: onPick,
          },
          {
            type: 'separator',
          },
          {
            label: t('media.remove'),
            icon: markRaw(Trash2),
            danger: true,
            action: onRemove,
          },
        ],
        placement: 'bottom-end',
      }, {
        trigger: () => h('button', {
          type: 'button',
          className: 'nv-file-more-btn',
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
    } else {
      render(null, moreBtnContainer)
    }
  }

  const onPick = () => {
    const position = resolveNodePosition(getPos)
    if (typeof position !== 'number') return
    options?.onRequestFileAsset?.({ view, position, attrs: currentNode.attrs })
  }

  const onOpen = () => {
    const src = getStringAttr(currentNode, 'src')
    if (!src) {
      onPick()
      return
    }
    const position = resolveNodePosition(getPos)
    if (typeof position !== 'number') return
    options?.onOpenFileAsset?.({ view, position, attrs: currentNode.attrs, src })
  }

  const onRemove = () => {
    const position = resolveNodePosition(getPos)
    if (typeof position !== 'number') return
    view.dispatch(view.state.tr.delete(position, position + currentNode.nodeSize).scrollIntoView())
  }

  const onCardMouseDown = (event: MouseEvent) => {
    if (moreBtnContainer.contains(event.target as Node)) return
    event.preventDefault()
  }

  const onCardClick = (event: MouseEvent) => {
    if (event.button !== 0 || moreBtnContainer.contains(event.target as Node)) return
    event.preventDefault()
    event.stopPropagation()
    onOpen()
  }

  card.addEventListener('mousedown', onCardMouseDown)
  card.addEventListener('click', onCardClick)

  sync()

  return {
    dom,
    stopEvent(event) {
      return card.contains(event.target as Node)
    },
    update(nextNode) {
      if (nextNode.type !== currentNode.type) return false
      currentNode = nextNode
      sync()
      return true
    },
    ignoreMutation() {
      return true
    },
    destroy() {
      card.removeEventListener('mousedown', onCardMouseDown)
      card.removeEventListener('click', onCardClick)
      render(null, moreBtnContainer)
    },
  }
}
