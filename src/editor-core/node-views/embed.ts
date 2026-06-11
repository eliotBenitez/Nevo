import { h, markRaw, render } from 'vue'
import type { Node as PMNode } from 'prosemirror-model'
import type { EditorView, NodeView } from 'prosemirror-view'
import { ExternalLink, Link, Trash2 } from 'lucide-vue-next'
import NvPopupMenu from '../../ui/primitives/NvPopupMenu.vue'
import { resolveNodePosition, getStringAttr, addClickHandler, type CoreNodeViewOptions, type NodeViewPosition } from './utils'
import { ensureMediaServer, youTubeEmbedUrl } from '../../tauri/mediaServer'
import { extractYouTubeVideoId } from '../../utils/oembed'

interface EmbedIframeAttrs {
  src: string
  title: string
  allow: string
  referrerPolicy: string
}

// Untrusted third-party embed HTML (from oembed providers) is rendered via
// `srcdoc`. We intentionally omit `allow-same-origin`: combined with
// `allow-scripts` it would grant the framed content the app's own origin,
// letting provider scripts reach app storage and Tauri IPC. Without it the
// iframe gets a unique opaque origin — widget scripts still run, but isolated.
const EMBED_IFRAME_SANDBOX = 'allow-scripts allow-presentation allow-popups allow-forms'
const DEFAULT_EMBED_ALLOW = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen'
const EMBED_FALLBACK_SANDBOX = `${EMBED_IFRAME_SANDBOX} allow-popups-to-escape-sandbox`

export function extractEmbedIframeAttrs(embedHtml: string): EmbedIframeAttrs | null {
  const template = document.createElement('template')
  template.innerHTML = embedHtml.trim()

  const iframe = template.content.querySelector('iframe')
  const rawSrc = iframe?.getAttribute('src')?.trim()
  if (!rawSrc) return null

  let parsed: URL
  try {
    parsed = new URL(rawSrc)
  } catch {
    return null
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null

  return {
    src: parsed.toString(),
    title: iframe?.getAttribute('title')?.trim() ?? '',
    allow: iframe?.getAttribute('allow')?.trim() || DEFAULT_EMBED_ALLOW,
    referrerPolicy: iframe?.getAttribute('referrerpolicy')?.trim() || 'strict-origin-when-cross-origin',
  }
}

export function createEmbedNodeView(
  node: PMNode,
  view: EditorView,
  getPos: NodeViewPosition,
  options?: CoreNodeViewOptions,
): NodeView {
  const t = options?.t || ((key: string) => key)

  const dom = document.createElement('div')
  dom.className = 'nv-embed-block'

  const card = document.createElement('div')
  card.className = 'nv-embed-card'

  const placeholder = document.createElement('div')
  placeholder.className = 'nv-embed-placeholder'

  const placeholderIcon = document.createElement('div')
  placeholderIcon.className = 'nv-embed-placeholder-icon'
  placeholderIcon.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8.5Z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg>'

  const placeholderText = document.createElement('span')
  placeholderText.className = 'nv-embed-placeholder-text'
  placeholderText.textContent = t('embed.pasteUrl')

  const placeholderBtn = document.createElement('button')
  placeholderBtn.type = 'button'
  placeholderBtn.className = 'nv-embed-placeholder-btn'
  placeholderBtn.textContent = t('embed.pasteUrl')

  placeholder.append(placeholderIcon, placeholderText, placeholderBtn)

  const headerEl = document.createElement('div')
  headerEl.className = 'nv-embed-header'

  const iconEl = document.createElement('span')
  iconEl.className = 'nv-embed-icon'

  const titleEl = document.createElement('span')
  titleEl.className = 'nv-embed-title'

  const moreBtnContainer = document.createElement('div')
  moreBtnContainer.className = 'nv-embed-more-container'

  headerEl.append(iconEl, titleEl, moreBtnContainer)

  const previewEl = document.createElement('div')
  previewEl.className = 'nv-embed-preview'

  card.append(headerEl, previewEl)
  dom.append(card)

  let currentNode = node
  let iframeEl: HTMLIFrameElement | null = null
  let mediaServerPrefetching = false

  const prefetchMediaServer = () => {
    if (mediaServerPrefetching) return
    mediaServerPrefetching = true
    void ensureMediaServer().then(() => {
      if (getStringAttr(currentNode, 'embedType') === 'youtube') sync()
    })
  }

  const EMBED_ICONS: Record<string, string> = {
    youtube: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 17a24.12 24.12 0 0 1 0-10 2 2 0 0 1 1.4-1.4 49.56 49.56 0 0 1 16.2 0A2 2 0 0 1 21.5 7a24.12 24.12 0 0 1 0 10 2 2 0 0 1-1.4 1.4 49.55 49.55 0 0 1-16.2 0A2 2 0 0 1 2.5 17"/><polygon points="10 15 15 12 10 9 10 15"/></svg>',
    vimeo: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 8.5c2.5-1 4-3 5.5-4.5C8 6 9 8 10 8c1 0 2-2 2-4s2-3 3-2 1 4 1 6c0 3-1 5-3 7s-4 3-5 3-2-1-2-2 1-3 2-4"/></svg>',
    figma: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 5.5A3.5 3.5 0 0 1 8.5 2H14v7H8.5A3.5 3.5 0 0 1 5 5.5zM14 2h2.5a3.5 3.5 0 1 1 0 7H14V2z"/><path d="M5 12a3.5 3.5 0 1 1 7 0 3.5 3.5 0 1 1-7 0z"/><path d="M14 12a3.5 3.5 0 1 1 7 0 3.5 3.5 0 1 1-7 0z"/><path d="M5 18.5A3.5 3.5 0 0 1 8.5 15H12v3.5a3.5 3.5 0 1 1-7 0z"/><path d="M14 15v3.5a3.5 3.5 0 1 1 0-7"/></svg>',
    codepen: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 22 8.5 22 15.5 12 22 2 15.5 2 8.5 12 2"/><line x1="12" y1="22" x2="12" y2="15.5"/><polyline points="22 8.5 12 15.5 2 8.5"/><polyline points="2 15.5 12 8.5 22 15.5"/><line x1="12" y1="2" x2="12" y2="8.5"/></svg>',
    generic: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>',
  }

  function getProviderIcon(embedType: string): string {
    return EMBED_ICONS[embedType] || EMBED_ICONS.generic
  }

  function renderPreview(embedHtml: string) {
    previewEl.innerHTML = ''
    if (!embedHtml) {
      previewEl.style.display = 'none'
      return
    }
    previewEl.style.display = ''

    const iframeAttrs = extractEmbedIframeAttrs(embedHtml)
    iframeEl = document.createElement('iframe')
    iframeEl.className = 'nv-embed-iframe'
    if (iframeAttrs) {
      iframeEl.src = iframeAttrs.src
      iframeEl.title = iframeAttrs.title || 'Embed'
      iframeEl.setAttribute('allow', iframeAttrs.allow)
      iframeEl.setAttribute('referrerpolicy', iframeAttrs.referrerPolicy)
    } else {
      iframeEl.srcdoc = embedHtml
      iframeEl.setAttribute('sandbox', EMBED_FALLBACK_SANDBOX)
      iframeEl.setAttribute('allow', DEFAULT_EMBED_ALLOW)
    }
    iframeEl.setAttribute('allowfullscreen', 'true')
    previewEl.appendChild(iframeEl)
  }

  function renderGenericCard(url: string, title: string, thumbnailUrl: string) {
    previewEl.innerHTML = ''
    previewEl.style.display = ''

    const cardInner = document.createElement('div')
    cardInner.className = 'nv-embed-generic-card'
    cardInner.style.cursor = 'pointer'
    cardInner.addEventListener('click', () => window.open(url, '_blank', 'noopener,noreferrer'))

    if (thumbnailUrl) {
      const img = document.createElement('div')
      img.className = 'nv-embed-generic-thumbnail'
      img.style.backgroundImage = `url(${thumbnailUrl})`
      cardInner.appendChild(img)
    }

    const info = document.createElement('div')
    info.className = 'nv-embed-generic-info'

    if (title) {
      const titleP = document.createElement('div')
      titleP.className = 'nv-embed-generic-title'
      titleP.textContent = title
      info.appendChild(titleP)
    }

    try {
      const domain = new URL(url).hostname
      const domainEl = document.createElement('div')
      domainEl.className = 'nv-embed-generic-domain'
      domainEl.textContent = domain
      info.appendChild(domainEl)
    } catch { /* invalid URL — skip domain label */ }

    cardInner.appendChild(info)
    previewEl.appendChild(cardInner)
  }

  const onOpen = () => {
    const url = getStringAttr(currentNode, 'url')
    if (!url) return
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  const onRemove = () => {
    const position = resolveNodePosition(getPos)
    if (typeof position !== 'number') return
    view.dispatch(view.state.tr.delete(position, position + currentNode.nodeSize).scrollIntoView())
  }

  const sync = () => {
    const url = getStringAttr(currentNode, 'url')
    const embedType = getStringAttr(currentNode, 'embedType')
    const embedHtml = getStringAttr(currentNode, 'embedHtml')
    const title = getStringAttr(currentNode, 'title')
    const thumbnailUrl = getStringAttr(currentNode, 'thumbnailUrl')

    const hasEmbed = Boolean(getStringAttr(currentNode, 'url'))

    dom.dataset.hasEmbed = hasEmbed ? 'true' : 'false'

    if (!hasEmbed) {
      placeholder.style.display = ''
      card.style.display = 'none'
      render(null, moreBtnContainer)
      return
    }

    placeholder.style.display = 'none'
    card.style.display = ''

    iconEl.innerHTML = getProviderIcon(embedType)
    titleEl.textContent = title || url

    if (embedType === 'youtube' && url) {
      prefetchMediaServer()
      const videoId = extractYouTubeVideoId(url)
      const proxyUrl = videoId ? youTubeEmbedUrl(videoId) : null
      if (proxyUrl) {
        renderPreview(`<iframe src="${proxyUrl}" allow="${DEFAULT_EMBED_ALLOW}" allowfullscreen style="width:100%;height:100%;border:none;position:absolute;top:0;left:0;"></iframe>`)
      } else {
        const thumb = thumbnailUrl || (videoId ? `https://img.youtube.com/vi/${videoId}/mqdefault.jpg` : '')
        renderGenericCard(url, title, thumb)
      }
    } else if (embedHtml) {
      renderPreview(embedHtml)
    } else {
      renderGenericCard(url, title, thumbnailUrl)
    }

    // Render Popup Menu
    const menuVNode = h(NvPopupMenu, {
      items: [
        {
          label: t('embed.changeUrl'),
          icon: markRaw(Link),
          action: onPick,
        },
        {
          label: t('embed.open'),
          icon: markRaw(ExternalLink),
          action: onOpen,
          disabled: !url,
        },
        {
          type: 'separator',
        },
        {
          label: t('embed.remove'),
          icon: markRaw(Trash2),
          danger: true,
          action: onRemove,
        },
      ],
      placement: 'bottom-end',
    }, {
      trigger: () => h('button', {
        type: 'button',
        className: 'nv-embed-more-btn',
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
    options?.onRequestEmbedUrl?.({
      view,
      position,
      anchorRect: (getStringAttr(currentNode, 'url') ? moreBtnContainer : placeholderBtn).getBoundingClientRect(),
    })
  }

  const cleanupPlaceholderBtn = addClickHandler(placeholderBtn, onPick)

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
      cleanupPlaceholderBtn()
      render(null, moreBtnContainer)
    },
  }
}
