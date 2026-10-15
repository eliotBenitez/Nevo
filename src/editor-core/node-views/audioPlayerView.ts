import type { Node as PMNode } from 'prosemirror-model'
import { clearIcon, mountIcon, type UiIconName } from '../../ui/icons/dom'
import { formatAudioTime } from '../../core/media/audioBookmarks'
import { loadAudioPeaks } from './audioWaveform'

export interface AudioPlayerViewOptions {
  t: (key: string) => string
  resolveMediaSrc: (src: string) => string | null
  resolveWaveformSrc: (src: string) => string
}

function iconButton(label: string, icon: UiIconName, className: string) {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = className
  button.setAttribute('aria-label', label)
  const mount = document.createElement('span')
  mount.setAttribute('aria-hidden', 'true')
  button.append(mount)
  mountIcon(icon, mount)
  return button
}
function setButtonIcon(button: HTMLButtonElement, name: UiIconName) {
  const mount = button.querySelector<HTMLElement>('span')
  if (mount) mountIcon(name, mount)
}

export function createAudioPlayerView(node: PMNode, options: AudioPlayerViewOptions) {
  const { t, resolveMediaSrc, resolveWaveformSrc } = options
  const root = document.createElement('section')
  root.className = 'nv-audio-player'
  root.setAttribute('aria-label', t('media.audioPlayer'))
  const audio = document.createElement('audio')
  audio.preload = 'metadata'
  audio.hidden = true
  const title = document.createElement('div')
  title.className = 'nv-audio-title'
  const subtitle = document.createElement('div')
  subtitle.className = 'nv-audio-subtitle'
  const waveform = document.createElement('div')
  waveform.className = 'nv-audio-waveform'
  const canvas = document.createElement('canvas')
  canvas.setAttribute('aria-hidden', 'true')
  canvas.hidden = true
  const seek = document.createElement('input')
  seek.type = 'range'
  seek.min = '0'
  seek.max = '1000'
  seek.value = '0'
  seek.setAttribute('aria-label', t('media.seek'))
  seek.className = 'nv-audio-seek'
  seek.disabled = true
  waveform.append(canvas, seek)
  const controls = document.createElement('div')
  controls.className = 'nv-audio-controls'
  const play = iconButton(t('media.play'), 'Play', 'nv-audio-play')
  const back = iconButton(t('media.skipBack'), 'Rewind', 'nv-audio-skip')
  const forward = iconButton(t('media.skipForward'), 'FastForward', 'nv-audio-skip')
  back.append(document.createTextNode('10'))
  forward.append(document.createTextNode('10'))
  back.disabled = true
  forward.disabled = true
  const clock = document.createElement('output')
  clock.className = 'nv-audio-clock'
  const speed = document.createElement('select')
  speed.setAttribute('aria-label', t('media.playbackSpeed'))
  for (const rate of [0.75, 1, 1.25, 1.5, 2]) {
    const option = document.createElement('option')
    option.value = String(rate)
    option.textContent = `${rate}×`
    speed.append(option)
  }
  speed.value = '1'
  const speedLabel = document.createElement('label')
  speedLabel.textContent = `${t('media.playbackSpeed')} `
  speedLabel.append(speed)
  const volume = document.createElement('input')
  volume.type = 'range'
  volume.min = '0'
  volume.max = '1'
  volume.step = '0.05'
  volume.value = '1'
  volume.setAttribute('aria-label', t('media.volume'))
  const volumeLabel = document.createElement('label')
  volumeLabel.textContent = `${t('media.volume')} `
  volumeLabel.append(volume)
  const status = document.createElement('div')
  status.className = 'nv-audio-status'
  status.setAttribute('role', 'status')
  const statusMessage = document.createElement('span')
  const retry = document.createElement('button')
  retry.type = 'button'
  retry.textContent = t('media.retryAudio')
  retry.hidden = true
  retry.className = 'nv-audio-retry'
  controls.append(play, back, forward, clock, speedLabel, volumeLabel)
  status.append(statusMessage, retry)
  root.append(title, subtitle, waveform, controls, status, audio)

  let source = ''
  let retryTimer: ReturnType<typeof setTimeout> | null = null
  let destroyed = false
  let seeking = false
  let waveformController: AbortController | null = null
  let waveformGeneration = 0
  let peaks: number[] | null = null
  let resizeObserver: ResizeObserver | null = null
  let themeObserver: MutationObserver | null = null
  let waveformUrl = ''
  let sourceSize = Number(node.attrs.size)
  let pendingSeek: { time: number; src: string } | null = null
  const timeListeners = new Set<() => void>()

  function showError() {
    status.dataset.error = 'true'
    statusMessage.textContent = t('media.audioError')
    retry.hidden = false
  }
  function drawWaveform() {
    if (!peaks) return
    const width = Math.max(1, waveform.clientWidth)
    const height = Math.max(1, waveform.clientHeight)
    const ratio = window.devicePixelRatio || 1
    canvas.width = Math.round(width * ratio)
    canvas.height = Math.round(height * ratio)
    const context = canvas.getContext('2d')
    if (!context) return
    context.scale(ratio, ratio)
    const progress = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.currentTime / audio.duration : 0
    const active = getComputedStyle(root).getPropertyValue('--accent').trim() || '#397b7d'
    const muted = getComputedStyle(root).getPropertyValue('--text-muted').trim() || '#8b8b8b'
    const barWidth = width / peaks.length
    for (let index = 0; index < peaks.length; index++) {
      const amplitude = Math.max(2, (peaks[index] ?? 0) * height * .86)
      context.fillStyle = index / peaks.length <= progress ? active : muted
      context.fillRect(index * barWidth + barWidth * .28, (height - amplitude) / 2, Math.max(1, barWidth * .44), amplitude)
    }
  }
  function cancelWaveform() {
    waveformGeneration++
    waveformController?.abort()
    waveformController = null
    peaks = null
    canvas.hidden = true
  }
  function loadWaveform(url: string, duration: number, size: number) {
    if (Number.isFinite(size) && size > 16 * 1024 * 1024) return
    cancelWaveform()
    const generation = waveformGeneration
    const controller = new AbortController()
    waveformController = controller
    void loadAudioPeaks(url, controller.signal, duration).then((result) => {
      if (destroyed || controller.signal.aborted || generation !== waveformGeneration || !result) return
      peaks = result
      canvas.hidden = false
      drawWaveform()
    })
  }
  function setSource(src: string, force = false) {
    if (retryTimer) { clearTimeout(retryTimer); retryTimer = null }
    if (!force && source === src) return
    source = src
    pendingSeek = null
    cancelWaveform()
    waveformUrl = ''
    audio.pause()
    audio.removeAttribute('src')
    audio.load()
    seek.disabled = true
    back.disabled = true
    forward.disabled = true
    statusMessage.textContent = src ? t('media.loadingAudio') : ''
    retry.hidden = true
    if (!src) return
    let attempt = 0
    const resolve = () => {
      // `EditorView.isDestroyed` can be true transiently while the initial
      // document view is being constructed. This callback is queued until the
      // constructor stack has finished; the node-view lifetime and source
      // identity guards are sufficient to reject stale work.
      if (destroyed || source !== src) return
      const url = resolveMediaSrc(src)
      if (url) {
        waveformUrl = resolveWaveformSrc(src)
        audio.src = url
        audio.load()
      } else if (attempt++ < 40) retryTimer = setTimeout(resolve, 150)
      else showError()
    }
    queueMicrotask(resolve)
  }
  function updateClock() {
    if (!seeking && Number.isFinite(audio.duration) && audio.duration > 0) seek.value = String(Math.round(audio.currentTime / audio.duration * 1000))
    clock.textContent = `${formatAudioTime(audio.currentTime)} / ${formatAudioTime(audio.duration)}`
    if (peaks) drawWaveform()
    for (const listener of timeListeners) listener()
  }
  const onPlay = () => {
    play.setAttribute('aria-label', t('media.pause'))
    setButtonIcon(play, 'Pause')
  }
  const onPause = () => {
    play.setAttribute('aria-label', t('media.play'))
    setButtonIcon(play, 'Play')
  }
  const onMetadata = () => {
    status.dataset.error = ''
    statusMessage.textContent = ''
    retry.hidden = true
    const hasDuration = Number.isFinite(audio.duration) && audio.duration > 0
    seek.disabled = !hasDuration
    back.disabled = !hasDuration
    forward.disabled = !hasDuration
    if (hasDuration && pendingSeek?.src === source) {
      audio.currentTime = Math.min(pendingSeek.time, audio.duration)
      pendingSeek = null
    }
    if (waveformUrl) loadWaveform(waveformUrl, audio.duration, sourceSize)
    drawWaveform()
    updateClock()
  }
  play.addEventListener('click', () => audio.paused ? void audio.play().catch(showError) : audio.pause())
  back.addEventListener('click', () => { audio.currentTime = Math.max(0, audio.currentTime - 10) })
  forward.addEventListener('click', () => { audio.currentTime = Math.min(Number.isFinite(audio.duration) ? audio.duration : Infinity, audio.currentTime + 10) })
  seek.addEventListener('pointerdown', () => { seeking = true })
  seek.addEventListener('input', () => { if (Number.isFinite(audio.duration) && audio.duration > 0) audio.currentTime = Number(seek.value) / 1000 * audio.duration })
  seek.addEventListener('change', () => { seeking = false; updateClock() })
  speed.addEventListener('change', () => { audio.playbackRate = Number(speed.value) })
  volume.addEventListener('input', () => { audio.volume = Number(volume.value) })
  retry.addEventListener('click', () => { status.dataset.error = ''; setSource(source, true) })
  audio.addEventListener('timeupdate', updateClock)
  audio.addEventListener('loadedmetadata', onMetadata)
  audio.addEventListener('error', showError)
  audio.addEventListener('play', onPlay)
  audio.addEventListener('pause', onPause)
  if (typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(drawWaveform)
    resizeObserver.observe(waveform)
  }
  if (typeof MutationObserver !== 'undefined' && document.documentElement) {
    themeObserver = new MutationObserver(() => drawWaveform())
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'style', 'data-theme'],
    })
  }

  function update(next: PMNode, loadSource = true) {
    title.textContent = String(next.attrs.name || t('media.audioFile'))
    sourceSize = Number(next.attrs.size)
    const size = Number(next.attrs.size)
    const duration = Number(next.attrs.duration)
    subtitle.textContent = `${t('media.audio')} · ${Number.isFinite(duration) && duration > 0 ? formatAudioTime(duration) : ''}${size > 0 ? ` · ${(size / 1048576).toFixed(1)} MB` : ''}`
    if (loadSource && next.attrs.kind !== 'audio') {
      waveformUrl = ''
      setSource('')
      updateClock()
      return
    }
    if (loadSource && next.attrs.kind === 'audio' && next.attrs.src !== source) {
      waveformUrl = next.attrs.src ? resolveWaveformSrc(String(next.attrs.src)) : ''
      setSource(String(next.attrs.src || ''))
    }
    updateClock()
  }
  update(node, false)
  return {
    dom: root,
    update,
    get currentTime() { return Number.isFinite(audio.currentTime) ? audio.currentTime : 0 },
    get duration() { return Number.isFinite(audio.duration) ? audio.duration : null },
    isPaused: () => audio.paused,
    seekTo(time: number) {
      if (!Number.isFinite(audio.duration) || audio.duration <= 0) {
        pendingSeek = { time: Math.max(0, time), src: source }
        return
      }
      audio.currentTime = Math.min(Math.max(0, time), audio.duration)
    },
    onTimeUpdate(callback: () => void) { timeListeners.add(callback); return () => timeListeners.delete(callback) },
    suspend() {
      cancelWaveform()
      if (retryTimer) { clearTimeout(retryTimer); retryTimer = null }
      audio.pause()
      audio.removeAttribute('src')
      audio.load()
      source = ''
      waveformUrl = ''
    },
    destroy() {
      destroyed = true
      cancelWaveform()
      resizeObserver?.disconnect()
      resizeObserver = null
      themeObserver?.disconnect()
      themeObserver = null
      if (retryTimer) clearTimeout(retryTimer)
      audio.pause()
      audio.removeAttribute('src')
      audio.load()
      audio.removeEventListener('timeupdate', updateClock)
      audio.removeEventListener('loadedmetadata', onMetadata)
      audio.removeEventListener('error', showError)
      audio.removeEventListener('play', onPlay)
      audio.removeEventListener('pause', onPause)
      if (play.querySelector('span')) clearIcon(play.querySelector('span')!)
      if (back.querySelector('span')) clearIcon(back.querySelector('span')!)
      if (forward.querySelector('span')) clearIcon(forward.querySelector('span')!)
      timeListeners.clear()
    },
    stopEvent(target: Node) { return root.contains(target) },
  }
}
