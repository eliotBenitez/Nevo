import type { Node as PMNode } from 'prosemirror-model'
import type { EditorView } from 'prosemirror-view'
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
  const languageControl = document.createElement('label')
  languageControl.className = 'nv-audio-transcript-language-control'
  const languageText = document.createElement('span')
  languageText.textContent = t('media.transcriptLanguage')
  const languageSelect = document.createElement('select')
  languageSelect.className = 'nv-audio-transcript-language'
  for (const language of TRANSCRIPTION_LANGUAGES) {
    const option = document.createElement('option')
    option.value = language
    option.textContent = t(`media.transcriptLanguages.${language}`)
    languageSelect.append(option)
  }
  languageControl.append(languageText, languageSelect)
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
    languageSelect.disabled = busy
    button.hidden = !canTranscribe
    button.disabled = busy
    button.textContent = busy ? t('media.transcribing') : t(segments.length ? 'media.retranscribe' : 'media.transcribe')
    root.hidden = !segments.length && !canTranscribe
    title.hidden = !segments.length
    editable = view.editable
    snapshot = JSON.stringify(currentNode.attrs.transcript ?? [])
  }

  button.addEventListener('click', async () => {
    if (!transcribe || busy || !view.editable || destroyed) return
    const src = currentNode.attrs.src
    if (typeof src !== 'string' || !src) return
    const requestGeneration = ++generation
    const original = JSON.stringify(currentNode.attrs.transcript ?? [])
    busy = true
    status.textContent = ''
    render()
    try {
      const language = TRANSCRIPTION_LANGUAGES.find(value => value === languageSelect.value) ?? 'auto'
      const result = readAudioTranscript(await transcribe(src, language))
      if (destroyed || view.isDestroyed || requestGeneration !== generation) return
      let position: number | undefined
      try { position = typeof getPos === 'function' ? getPos() : undefined } catch { return }
      if (typeof position !== 'number') return
      const live = view.state.doc.nodeAt(position)
      if (!live || live.type !== currentNode.type || live.attrs.kind !== 'audio'
        || live.attrs.src !== src || JSON.stringify(live.attrs.transcript ?? []) !== original || !view.editable) return
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
    destroy() { destroyed = true; generation++ },
  }
}
