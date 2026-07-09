import { markRaw, render } from 'vue'
import type { Node as PMNode } from 'prosemirror-model'
import type { EditorView, NodeView } from 'prosemirror-view'
import { FolderOpen, Trash2 } from 'lucide-vue-next'
import {
  resolveNodePosition,
  getStringAttr,
  addClickHandler,
  renderNodeOverflowMenu,
  type CoreNodeViewOptions,
  type NodeViewPosition,
} from './utils'

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

function formatFileSize(bytes: number): string {
  if (!bytes || bytes <= 0) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1048576).toFixed(1)} MB`
}

function makePlaySvg(): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('viewBox', '0 0 16 16')
  svg.setAttribute('fill', 'currentColor')
  svg.setAttribute('width', '14')
  svg.setAttribute('height', '14')
  const p = document.createElementNS('http://www.w3.org/2000/svg', 'polygon')
  p.setAttribute('points', '3,1 14,8 3,15')
  svg.append(p)
  return svg
}

function makePauseSvg(): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('viewBox', '0 0 16 16')
  svg.setAttribute('fill', 'currentColor')
  svg.setAttribute('width', '14')
  svg.setAttribute('height', '14')
  const r1 = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
  r1.setAttribute('x', '2'); r1.setAttribute('y', '1'); r1.setAttribute('width', '5'); r1.setAttribute('height', '14'); r1.setAttribute('rx', '1.5')
  const r2 = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
  r2.setAttribute('x', '9'); r2.setAttribute('y', '1'); r2.setAttribute('width', '5'); r2.setAttribute('height', '14'); r2.setAttribute('rx', '1.5')
  svg.append(r1, r2)
  return svg
}

export function createMediaNodeView(
  node: PMNode,
  view: EditorView,
  getPos: NodeViewPosition,
  options?: CoreNodeViewOptions,
): NodeView {
  const t = options?.t || ((key: string) => key)
  const dom = document.createElement('div')
  dom.className = 'nv-media-block'

  // Empty / upload state
  const emptyEl = document.createElement('div')
  emptyEl.className = 'nv-media-empty'

  const emptyPickBtn = document.createElement('button')
  emptyPickBtn.type = 'button'
  emptyPickBtn.className = 'nv-media-pick-btn'
  emptyEl.append(emptyPickBtn)

  // Player state
  const playerEl = document.createElement('div')
  playerEl.className = 'nv-media-player'

  const headerEl = document.createElement('div')
  headerEl.className = 'nv-media-header'

  const kindLabelEl = document.createElement('span')
  kindLabelEl.className = 'nv-media-kind-label'

  const moreBtnContainer = document.createElement('div')
  moreBtnContainer.className = 'nv-media-more-container'

  headerEl.append(kindLabelEl, moreBtnContainer)

  // Hidden audio element — no native controls; played programmatically
  const audioEl = document.createElement('audio')
  audioEl.preload = 'metadata'
  audioEl.style.cssText = 'position:absolute;width:0;height:0;opacity:0;pointer-events:none'

  // Custom audio controls row
  const audioControlsEl = document.createElement('div')
  audioControlsEl.className = 'nv-media-audio-controls'

  const playBtnEl = document.createElement('button')
  playBtnEl.type = 'button'
  playBtnEl.className = 'nv-media-play-btn'
  playBtnEl.setAttribute('aria-label', t('media.play'))
  playBtnEl.append(makePlaySvg())

  const progressEl = document.createElement('input')
  progressEl.type = 'range'
  progressEl.className = 'nv-media-progress'
  progressEl.min = '0'
  progressEl.max = '1000'
  progressEl.value = '0'
  progressEl.step = '1'

  const timeEl = document.createElement('span')
  timeEl.className = 'nv-media-time'
  timeEl.textContent = '0:00 / --:--'

  audioControlsEl.append(playBtnEl, progressEl, timeEl)

  // Native video (keeps native controls — video works fine)
  const videoEl = document.createElement('video')
  videoEl.className = 'nv-media-video'
  videoEl.controls = true
  videoEl.preload = 'metadata'

  // Meta row
  const metaEl = document.createElement('div')
  metaEl.className = 'nv-media-meta'

  const nameEl = document.createElement('span')
  nameEl.className = 'nv-media-name'

  const sizeEl = document.createElement('span')
  sizeEl.className = 'nv-media-size'

  metaEl.append(nameEl, sizeEl)

  playerEl.append(headerEl, audioEl, audioControlsEl, videoEl, metaEl)
  dom.append(emptyEl, playerEl)

  let currentNode = node
  let isSeeking = false
  let currentAudioSrc: string | null = null
  let audioSrcRetry: ReturnType<typeof setTimeout> | null = null
  let currentVideoSrc: string | null = null

  // Stop retrying media-server resolution after ~6s so a server that never comes
  // up in the packaged build degrades to an error instead of looping forever.
  const MAX_MEDIA_SRC_RETRIES = 40

  // WebKitGTK's GStreamer backend cannot play from asset:// (no range streaming).
  // Both audio and video are served via the localhost HTTP media server instead.
  function setAudioHttpSrc(relativeSrc: string, duration: number | null, attempt = 0) {
    if (audioSrcRetry) { clearTimeout(audioSrcRetry); audioSrcRetry = null }
    const httpUrl = options?.resolveMediaSrc ? options.resolveMediaSrc(relativeSrc) : null
    if (!httpUrl) {
      if (attempt >= MAX_MEDIA_SRC_RETRIES) {
        console.error('[nevo:audio] media server unavailable; giving up on', relativeSrc)
        return
      }
      audioSrcRetry = setTimeout(() => setAudioHttpSrc(relativeSrc, duration, attempt + 1), 150)
      return
    }
    if (currentAudioSrc === httpUrl) return
    currentAudioSrc = httpUrl
    progressEl.value = '0'
    timeEl.textContent = duration !== null ? `0:00 / ${formatDuration(duration)}` : '0:00 / --:--'
    audioEl.src = httpUrl
    audioEl.load()
  }

  // WebKitGTK's <video> cannot play from asset:// (custom URI scheme, no range streaming)
  // nor from blob: URLs. It must stream over real HTTP, so video is served from the localhost
  // media server. resolveMediaSrc returns null until the server info has loaded; retry shortly.
  let videoSrcRetry: ReturnType<typeof setTimeout> | null = null
  function setVideoSrc(relativeSrc: string, attempt = 0) {
    if (videoSrcRetry) { clearTimeout(videoSrcRetry); videoSrcRetry = null }
    const httpUrl = options?.resolveMediaSrc ? options.resolveMediaSrc(relativeSrc) : null
    if (!httpUrl) {
      // Server not ready yet — retry until available, but give up after ~6s.
      if (attempt >= MAX_MEDIA_SRC_RETRIES) {
        console.error('[nevo:video] media server unavailable; giving up on', relativeSrc)
        return
      }
      videoSrcRetry = setTimeout(() => setVideoSrc(relativeSrc, attempt + 1), 150)
      return
    }
    if (currentVideoSrc === httpUrl) return
    currentVideoSrc = httpUrl
    videoEl.src = httpUrl
    videoEl.load()
  }

  // Audio state sync
  function refreshPlayBtn() {
    playBtnEl.innerHTML = ''
    playBtnEl.append(audioEl.paused ? makePlaySvg() : makePauseSvg())
    playBtnEl.setAttribute('aria-label', audioEl.paused ? t('media.play') : t('media.pause'))
  }

  function refreshProgress() {
    if (isSeeking) return
    const dur = audioEl.duration
    if (Number.isFinite(dur) && dur > 0) {
      progressEl.value = String(Math.round((audioEl.currentTime / dur) * 1000))
    }
  }

  function refreshTime() {
    const cur = audioEl.currentTime
    const dur = Number.isFinite(audioEl.duration) ? audioEl.duration : null
    timeEl.textContent = `${formatDuration(cur)} / ${dur !== null ? formatDuration(dur) : '--:--'}`
  }

  const onAudioPlay = () => refreshPlayBtn()
  const onAudioPause = () => refreshPlayBtn()
  const onAudioEnded = () => { refreshPlayBtn(); refreshProgress(); refreshTime() }
  const onAudioTimeUpdate = () => { refreshProgress(); refreshTime() }
  const onAudioLoadedMetadata = () => refreshTime()
  const onAudioError = () => {
    const e = audioEl.error
    console.error('[nevo:audio] MediaError:', e?.code, e?.message, 'src:', audioEl.src)
  }

  audioEl.addEventListener('play', onAudioPlay)
  audioEl.addEventListener('pause', onAudioPause)
  audioEl.addEventListener('ended', onAudioEnded)
  audioEl.addEventListener('timeupdate', onAudioTimeUpdate)
  audioEl.addEventListener('loadedmetadata', onAudioLoadedMetadata)
  audioEl.addEventListener('error', onAudioError)

  // Video diagnostics — surfaces codec/load failures (e.g. MediaError code 4 = unsupported codec)
  const onVideoError = () => {
    const e = videoEl.error
    console.error('[nevo:video] MediaError:', e?.code, e?.message, 'src:', videoEl.src, 'networkState:', videoEl.networkState, 'readyState:', videoEl.readyState)
  }
  const onVideoLoadedMetadata = () => {
    console.info('[nevo:video] loadedmetadata', { duration: videoEl.duration, w: videoEl.videoWidth, h: videoEl.videoHeight })
  }
  videoEl.addEventListener('error', onVideoError)
  videoEl.addEventListener('loadedmetadata', onVideoLoadedMetadata)

  // Play/pause — direct click listener (no addClickHandler/e.preventDefault on mousedown;
  // stopEvent already blocks PM for audioControlsEl, so preventDefault is redundant and harmful in WebKitGTK)
  const onPlayClick = () => {
    if (audioEl.paused) {
      audioEl.play().catch((err: unknown) => {
        console.error('[nevo:audio] play() rejected:', err, 'src:', audioEl.src, 'readyState:', audioEl.readyState, 'networkState:', audioEl.networkState)
      })
    } else {
      audioEl.pause()
    }
  }

  // Seeking via range input
  const onProgressMouseDown = () => { isSeeking = true }
  const onProgressInput = () => {
    if (Number.isFinite(audioEl.duration) && audioEl.duration > 0) {
      audioEl.currentTime = (Number(progressEl.value) / 1000) * audioEl.duration
      refreshTime()
    }
  }
  const onProgressMouseUp = () => { isSeeking = false }

  progressEl.addEventListener('mousedown', onProgressMouseDown)
  progressEl.addEventListener('input', onProgressInput)
  progressEl.addEventListener('mouseup', onProgressMouseUp)

  const sync = () => {
    const kind = getStringAttr(currentNode, 'kind', 'audio') as 'audio' | 'video'
    const src = getStringAttr(currentNode, 'src')
    const name = getStringAttr(currentNode, 'name')
    const size = typeof currentNode.attrs.size === 'number' ? currentNode.attrs.size : 0
    const duration = typeof currentNode.attrs.duration === 'number' ? currentNode.attrs.duration : null

    dom.dataset.kind = kind
    dom.dataset.hasSrc = src ? 'true' : 'false'

    emptyPickBtn.textContent = kind === 'video' ? t('media.attachVideo') : t('media.attachAudio')
    kindLabelEl.textContent = kind === 'video' ? t('media.video') : t('media.audio')

    if (src) {
      emptyEl.style.display = 'none'
      playerEl.style.display = ''

      if (kind === 'audio') {
        setAudioHttpSrc(src, duration)
        audioControlsEl.style.display = ''
        videoEl.style.display = 'none'
        if (currentVideoSrc) {
          if (videoSrcRetry) { clearTimeout(videoSrcRetry); videoSrcRetry = null }
          videoEl.pause()
          videoEl.removeAttribute('src')
          videoEl.load()
          currentVideoSrc = null
        }
      } else {
        setVideoSrc(src)
        videoEl.style.display = ''
        audioControlsEl.style.display = 'none'
        if (currentAudioSrc) {
          if (audioSrcRetry) { clearTimeout(audioSrcRetry); audioSrcRetry = null }
          audioEl.pause()
          audioEl.removeAttribute('src')
          audioEl.load()
          currentAudioSrc = null
        }
      }
    } else {
      emptyEl.style.display = ''
      playerEl.style.display = 'none'
    }

    nameEl.textContent = name || (kind === 'video' ? t('media.videoFile') : t('media.audioFile'))
    sizeEl.textContent = formatFileSize(size)

    // Render Popup Menu
    renderNodeOverflowMenu(moreBtnContainer, [
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
    ], 'nv-media-more-btn')
  }

  const onPick = () => {
    const position = resolveNodePosition(getPos)
    if (typeof position !== 'number') return
    const kind = getStringAttr(currentNode, 'kind', 'audio') as 'audio' | 'video'
    options?.onRequestMediaAsset?.({ view, position, kind, attrs: currentNode.attrs })
  }

  const onRemove = () => {
    const position = resolveNodePosition(getPos)
    if (typeof position !== 'number') return
    if (!audioEl.paused) audioEl.pause()
    view.dispatch(view.state.tr.delete(position, position + currentNode.nodeSize).scrollIntoView())
  }

  // playBtnEl uses direct listener — see comment above onPlayClick
  playBtnEl.addEventListener('click', onPlayClick)

  const cleanupEmptyPick = addClickHandler(emptyPickBtn, onPick)
  sync()

  return {
    dom,
    stopEvent(event) {
      const target = event.target as Node
      // Let ProseMirror ignore events from our interactive areas so they work normally
      return audioControlsEl.contains(target) || videoEl.contains(target) || moreBtnContainer.contains(target)
    },
    ignoreMutation() {
      return true
    },
    update(nextNode) {
      if (nextNode.type !== currentNode.type) return false
      currentNode = nextNode
      sync()
      return true
    },
    destroy() {
      audioEl.pause()
      if (audioSrcRetry) { clearTimeout(audioSrcRetry); audioSrcRetry = null }
      if (videoSrcRetry) { clearTimeout(videoSrcRetry); videoSrcRetry = null }
      audioEl.removeEventListener('play', onAudioPlay)
      audioEl.removeEventListener('pause', onAudioPause)
      audioEl.removeEventListener('ended', onAudioEnded)
      audioEl.removeEventListener('timeupdate', onAudioTimeUpdate)
      audioEl.removeEventListener('loadedmetadata', onAudioLoadedMetadata)
      audioEl.removeEventListener('error', onAudioError)
      videoEl.removeEventListener('error', onVideoError)
      videoEl.removeEventListener('loadedmetadata', onVideoLoadedMetadata)
      playBtnEl.removeEventListener('click', onPlayClick)
      progressEl.removeEventListener('mousedown', onProgressMouseDown)
      progressEl.removeEventListener('input', onProgressInput)
      progressEl.removeEventListener('mouseup', onProgressMouseUp)
      cleanupEmptyPick()
      render(null, moreBtnContainer)
    },
  }
}
