import { h, render as renderVNode } from 'vue'
import type { Node as PMNode } from 'prosemirror-model'
import type { EditorView } from 'prosemirror-view'
import NvSelect from '../../ui/primitives/NvSelect.vue'
import { formatAudioTime } from '../../core/media/audioBookmarks'
import { readAudioTranscript, type AudioTranscriptSegment } from '../../core/media/audioTranscript'
import { TRANSCRIPTION_LANGUAGES, type TranscriptionLanguage } from '../../core/media/transcriptionLanguage'
import type { NodeViewPosition } from './utils'

interface AudioTranscriptViewOptions {
  view: EditorView
  getPos: NodeViewPosition
  t: (key: string) => string
  seekTo: (time: number) => void
  transcribe?: (src: string, language: TranscriptionLanguage) => Promise<AudioTranscriptSegment[]>
}

/** DOM and async lifecycle for the transcript panel; persistence uses the live editor transaction. */
export function createAudioTranscriptView(node: PMNode, options: AudioTranscriptViewOptions) {
  const { view, getPos, t, seekTo, transcribe } = options
  const root = document.createElement('section')
  root.className = 'nv-audio-transcript'
  root.setAttribute('aria-label', t('media.transcript'))
  const header = document.createElement('div')
  header.className = 'nv-audio-transcript-header'
  const title = document.createElement('h3')
  title.textContent = t('media.transcript')
  const controls = document.createElement('div')
  controls.className = 'nv-audio-transcript-controls'
  const languageControl = document.createElement('div')
  languageControl.className = 'nv-audio-transcript-language-control'
  const languageText = document.createElement('span')
  languageText.textContent = t('media.transcriptLanguage')
  // Uses the project's NvSelect primitive, matching the playback speed control.
  const languageContainer = document.createElement('div')
  languageContainer.className = 'nv-audio-transcript-language'
  const languageOptions = TRANSCRIPTION_LANGUAGES.map(value => ({ value, label: t(`media.transcriptLanguages.${value}`) }))
  let language: TranscriptionLanguage = 'auto'
  languageControl.append(languageText, languageContainer)
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'nv-audio-transcribe'
  const status = document.createElement('span')
  status.className = 'nv-audio-transcript-status'
  status.setAttribute('role', 'status')
  const list = document.createElement('div')
  list.className = 'nv-audio-transcript-list'
  controls.append(languageControl, button)
  header.append(title, controls)
  root.append(header, status, list)

  let currentNode = node
  let snapshot = ''
  let editable = view.editable
  let busy = false
  let destroyed = false
  let generation = 0

  function render() {
    const segments = readAudioTranscript(currentNode.attrs.transcript)
    list.replaceChildren()
    for (const segment of segments) {
      const row = document.createElement('div')
      row.className = 'nv-audio-transcript-row'
      const time = document.createElement('button')
      time.type = 'button'
      time.className = 'nv-audio-transcript-time'
      time.textContent = formatAudioTime(segment.start)
      time.setAttribute('aria-label', `${formatAudioTime(segment.start)} ${segment.text}`)
      time.addEventListener('click', () => seekTo(segment.start))
      const text = document.createElement('span')
      text.textContent = segment.text
      row.append(time, text)
      list.append(row)
    }
    const canTranscribe = !!transcribe && view.editable && !!currentNode.attrs.src
    languageControl.hidden = !canTranscribe
    renderLanguageSelect()
    button.hidden = !canTranscribe
    button.disabled = busy
    button.textContent = busy ? t('media.transcribing') : t(segments.length ? 'media.retranscribe' : 'media.transcribe')
    root.hidden = !segments.length && !canTranscribe
    title.hidden = !segments.length
    editable = view.editable
    snapshot = JSON.stringify(currentNode.attrs.transcript ?? [])
  }

  function renderLanguageSelect() {
    renderVNode(h(NvSelect, {
      modelValue: language,
      options: languageOptions,
      disabled: busy,
      minWidth: 0,
      ariaLabel: t('media.transcriptLanguage'),
      'onUpdate:modelValue': (value: string) => {
        language = TRANSCRIPTION_LANGUAGES.find(candidate => candidate === value) ?? 'auto'
        renderLanguageSelect()
      },
    }), languageContainer)
  }

  button.addEventListener('click', async () => {
    if (!transcribe || busy || !view.editable || destroyed) return
    const src = currentNode.attrs.src
    if (typeof src !== 'string' || !src) return
    const requestGeneration = ++generation
    const original = JSON.stringify(currentNode.attrs.transcript ?? [])
    // The view is reused across notes; `plugins` stays the same array only within one editor state lineage.
    const startPlugins = view.state.plugins
    busy = true
    status.textContent = ''
    render()
    try {
      const result = readAudioTranscript(await transcribe(src, language))
      if (view.isDestroyed || requestGeneration !== generation) return
      const isTarget = (node: PMNode | null | undefined): node is PMNode => !!node && node.type === currentNode.type
        && node.attrs.kind === 'audio' && node.attrs.src === src && JSON.stringify(node.attrs.transcript ?? []) === original
      let position: number | undefined
      if (!destroyed) {
        try { position = typeof getPos === 'function' ? getPos() : undefined } catch { return }
      } else if (view.state.plugins === startPlugins) {
        // ProseMirror recreated this view (drag, undo, re-render): find the same block in the live doc.
        const matches: number[] = []
        view.state.doc.descendants((node, pos) => { if (isTarget(node)) matches.push(pos) })
        if (matches.length === 1) position = matches[0]
      }
      if (typeof position !== 'number') return
      const live = view.state.doc.nodeAt(position)
      if (!isTarget(live) || !view.editable) return
      if (!result.length) {
        status.textContent = t('media.transcriptEmpty')
        return
      }
      view.dispatch(view.state.tr.setNodeMarkup(position, undefined, { ...live.attrs, transcript: result }))
    } catch (error) {
      if (destroyed || requestGeneration !== generation) return
      status.textContent = error === 'transcription_busy' ? t('media.transcriptBusy') : t('media.transcriptFailed')
    } finally {
      if (!destroyed && requestGeneration === generation) {
        busy = false
        render()
      }
    }
  })

  function update(next: PMNode) {
    const sourceChanged = currentNode.attrs.src !== next.attrs.src
    if (sourceChanged) {
      generation++
      busy = false
      status.textContent = ''
    }
    currentNode = next
    if (sourceChanged || snapshot !== JSON.stringify(next.attrs.transcript ?? []) || editable !== view.editable) render()
  }
  render()
  return {
    dom: root,
    update,
    stopEvent: (target: Node) => root.contains(target),
    destroy() {
      destroyed = true
      generation++
      renderVNode(null, languageContainer)
    },
  }
}
