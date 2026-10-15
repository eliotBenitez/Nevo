import { markRaw, render } from 'vue'
import type { Node as PMNode } from 'prosemirror-model'
import type { EditorView, NodeView } from 'prosemirror-view'
import { FolderOpen, Trash2 } from '../../ui/icons'
import {
  resolveNodePosition,
  getStringAttr,
  addClickHandler,
  renderNodeOverflowMenu,
  type CoreNodeViewOptions,
  type NodeViewPosition,
} from './utils'
import { createAudioBookmarksView } from './audioBookmarksView'
import { createViewportRenderController, type ViewportRenderController } from './viewportRenderController'

export function createMediaNodeView(
  node: PMNode,
  view: EditorView,
  getPos: NodeViewPosition,
  options?: CoreNodeViewOptions,
): NodeView {
  const t = options?.t || ((key: string) => key)
  const dom = document.createElement('div')
  dom.className = 'nv-media-block'
  const empty = document.createElement('div')
  empty.className = 'nv-media-empty'
  const pick = document.createElement('button')
  pick.type = 'button'
  pick.className = 'nv-media-pick-btn'
  empty.append(pick)
  const player = document.createElement('div')
  player.className = 'nv-media-player'
  const header = document.createElement('div')
  header.className = 'nv-media-header'
  const kindLabel = document.createElement('span')
  kindLabel.className = 'nv-media-kind-label'
  const menu = document.createElement('div')
  menu.className = 'nv-media-more-container'
  header.append(kindLabel, menu)
  const audioHost = document.createElement('div')
  const video = document.createElement('video')
  video.className = 'nv-media-video'
  video.controls = true
  video.preload = 'metadata'
  const videoMeta = document.createElement('div')
  videoMeta.className = 'nv-media-meta'
  const videoName = document.createElement('span')
  videoName.className = 'nv-media-name'
  const videoSize = document.createElement('span')
  videoSize.className = 'nv-media-size'
  videoMeta.append(videoName, videoSize)
  player.append(header, audioHost, video, videoMeta)
  dom.append(empty, player)

  let currentNode = node
  let videoSrc = ''
  let videoRetry: ReturnType<typeof setTimeout> | null = null
  let destroyed = false
  let controller: ViewportRenderController | null = null
  const audioUi = createAudioBookmarksView(node, {
    view,
    getPos,
    t,
    resolveMediaSrc: (src) => options?.resolveMediaSrc?.(src) ?? null,
    resolveWaveformSrc: (src) => options?.resolveAssetSrc?.(src) ?? src,
  })
  audioHost.append(audioUi.dom)
  // The layout switcher lives in the shared block header (next to the overflow
  // menu) so it stays visible in both player and bookmarks layouts.
  header.insertBefore(audioUi.modeControl, menu)

  function clearVideoSource() {
    if (videoRetry) { clearTimeout(videoRetry); videoRetry = null }
    if (videoSrc || video.hasAttribute('src')) {
      video.pause()
      video.removeAttribute('src')
      video.load()
    }
    videoSrc = ''
  }

  function setVideoSource(src: string, attempt = 0) {
    if (videoRetry) { clearTimeout(videoRetry); videoRetry = null }
    if (!src) { clearVideoSource(); return }
    const isCurrentVideo = () => !destroyed
      && getStringAttr(currentNode, 'kind', 'audio') === 'video'
      && getStringAttr(currentNode, 'src') === src
    const url = options?.resolveMediaSrc?.(src)
    if (!url) {
      if (attempt < 40 && isCurrentVideo()) {
        videoRetry = setTimeout(() => {
          videoRetry = null
          if (isCurrentVideo()) setVideoSource(src, attempt + 1)
        }, 150)
      }
      return
    }
    if (!isCurrentVideo()) return
    if (videoSrc === url) return
    videoSrc = url
    video.src = url
    video.load()
  }

  function sync() {
    const kind = getStringAttr(currentNode, 'kind', 'audio') as 'audio' | 'video'
    const src = getStringAttr(currentNode, 'src')
    const name = getStringAttr(currentNode, 'name')
    const size = typeof currentNode.attrs.size === 'number' ? currentNode.attrs.size : 0
    dom.dataset.kind = kind
    dom.dataset.hasSrc = src ? 'true' : 'false'
    pick.textContent = kind === 'video' ? t('media.attachVideo') : t('media.attachAudio')
    kindLabel.textContent = kind === 'video' ? t('media.video') : t('media.audio')
    videoName.textContent = name || t('media.videoFile')
    videoSize.textContent = size >= 1048576 ? `${(size / 1048576).toFixed(1)} MB` : size >= 1024 ? `${(size / 1024).toFixed(1)} KB` : size > 0 ? `${size} B` : ''
    empty.style.display = src ? 'none' : ''
    player.style.display = src ? '' : 'none'
    kindLabel.style.display = kind === 'audio' ? 'none' : ''
    // Source/kind visibility is owned here (the sole writer of `hidden`);
    // read-only visibility is owned by the audio view via `.is-readonly`.
    audioUi.modeControl.hidden = kind !== 'audio' || !src
    if (kind === 'audio') {
      audioHost.style.display = ''
      video.style.display = 'none'
      videoMeta.style.display = 'none'
      clearVideoSource()
      audioUi.update(currentNode)
    } else {
      audioUi.suspend()
      audioHost.style.display = 'none'
      video.style.display = ''
      videoMeta.style.display = ''
      setVideoSource(src)
    }
    renderNodeOverflowMenu(menu, [
      { label: t('media.replace'), icon: markRaw(FolderOpen), action: onPick },
      { type: 'separator' },
      { label: t('media.remove'), icon: markRaw(Trash2), danger: true, action: onRemove },
    ], 'nv-media-more-btn')
  }

  function onPick() {
    let position: number | undefined
    try { position = resolveNodePosition(getPos) } catch { return }
    if (typeof position !== 'number') return
    const kind = getStringAttr(currentNode, 'kind', 'audio') as 'audio' | 'video'
    options?.onRequestMediaAsset?.({ view, position, kind, attrs: currentNode.attrs })
  }
  function onRemove() {
    let position: number | undefined
    try { position = resolveNodePosition(getPos) } catch { return }
    if (typeof position !== 'number') return
    audioUi.suspend()
    video.pause()
    view.dispatch(view.state.tr.delete(position, position + currentNode.nodeSize).scrollIntoView())
  }
  const cleanupPick = addClickHandler(pick, onPick)
  controller = createViewportRenderController(dom, {
    render: sync,
    suspend: () => {
      audioUi.suspend()
      clearVideoSource()
      render(null, menu)
    },
    canSuspend: () => video.paused && audioUi.isPaused(),
    initialPlaceholderHeight: 180,
  })

  return {
    dom,
    stopEvent(event) {
      const target = event.target as Node
      return audioUi.stopEvent(target) || video.contains(target) || menu.contains(target)
    },
    ignoreMutation: () => true,
    update(nextNode) {
      if (nextNode.type !== currentNode.type) return false
      currentNode = nextNode
      audioUi.updateBookmarks(nextNode)
      controller?.requestRender()
      return true
    },
    destroy() {
      destroyed = true
      controller?.destroy()
      audioUi.destroy()
      clearVideoSource()
      cleanupPick()
      render(null, menu)
    },
  }
}
