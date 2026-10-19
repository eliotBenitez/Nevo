import { afterEach, describe, expect, it, vi } from 'vitest'
import { EditorView } from 'prosemirror-view'
import { createNevoEditorState } from '../state'
import { nevoBaseSchema } from '../schema'
import type { BlockNode } from '../../types/note'
import type { AudioTranscriptSegment } from '../../core/media/audioTranscript'
import type { TranscriptionLanguage } from '../../core/media/transcriptionLanguage'

function createMediaEditor(
  attrs: Record<string, unknown>,
  resolveMediaSrc: (src: string) => string | null,
  onTranscribeAudio?: (src: string, language: TranscriptionLanguage) => Promise<AudioTranscriptSegment[]>,
) {
  const setup = createNevoEditorState({
    schema: nevoBaseSchema,
    content: { type: 'doc', content: [{ type: 'media_block', attrs }] } as BlockNode,
    nodeViewOptions: { resolveMediaSrc, onTranscribeAudio },
  })
  const mount = document.createElement('div')
  document.body.appendChild(mount)
  const view = new EditorView(mount, {
    state: setup.state,
    nodeViews: setup.nodeViews,
    dispatchTransaction(transaction) {
      view.updateState(view.state.apply(transaction))
    },
  })
  return {
    mount,
    view,
    destroy() { view.destroy(); mount.remove() },
  }
}

async function tick() {
  await new Promise((resolve) => setTimeout(resolve, 0))
}

describe('media node view source lifecycle', () => {
  afterEach(() => vi.restoreAllMocks())

  it('transcribes a local audio asset and persists timestamped text in the live editor', async () => {
    const transcribe = vi.fn(async () => [{ start: 1, end: 3, text: 'Recognized speech' }])
    const editor = createMediaEditor({ kind: 'audio', src: '.nevo/assets/audio.wav' }, () => null, transcribe)
    try {
      await tick()
      const button = editor.mount.querySelector<HTMLButtonElement>('.nv-audio-transcribe')!
      expect(button).toBeTruthy()
      button.click()
      await tick()
      expect(transcribe).toHaveBeenCalledWith('.nevo/assets/audio.wav', 'auto')
      expect(editor.view.state.doc.firstChild?.attrs.transcript).toEqual([{ start: 1, end: 3, text: 'Recognized speech' }])
      expect(editor.mount.querySelector('.nv-audio-transcript')?.textContent).toContain('Recognized speech')
    } finally { editor.destroy() }
  })

  it('uses the selected spoken language when retranscribing a song', async () => {
    const transcribe = vi.fn(async () => [{ start: 3, end: 5, text: 'Я танцую' }])
    const editor = createMediaEditor({ kind: 'audio', src: '.nevo/assets/song.mp3', transcript: [
      { start: 0, end: 2, text: '[Música]' },
    ] }, () => null, transcribe)
    try {
      await tick()
      const trigger = editor.mount.querySelector<HTMLButtonElement>('.nv-audio-transcript-language .nv-select__trigger')!
      expect(trigger.getAttribute('aria-label')).toBe('media.transcriptLanguage')
      trigger.click()
      await tick()
      const ru = [...document.querySelectorAll<HTMLButtonElement>('.nv-select__option')]
        .find(option => option.textContent?.includes('media.transcriptLanguages.ru'))!
      ru.click()
      await tick()
      expect(trigger.textContent).toContain('media.transcriptLanguages.ru')
      editor.mount.querySelector<HTMLButtonElement>('.nv-audio-transcribe')!.click()
      await tick()
      expect(transcribe).toHaveBeenCalledWith('.nevo/assets/song.mp3', 'ru')
      expect(editor.view.state.doc.firstChild?.attrs.transcript).toEqual([{ start: 3, end: 5, text: 'Я танцую' }])
    } finally { editor.destroy() }
  })

  it('keeps a transcript that finishes after ProseMirror recreated the block view', async () => {
    let resolve!: (segments: AudioTranscriptSegment[]) => void
    const transcribe = vi.fn(() => new Promise<AudioTranscriptSegment[]>(done => { resolve = done }))
    const editor = createMediaEditor({ kind: 'audio', src: '.nevo/assets/a.wav' }, () => null, transcribe)
    try {
      await tick()
      editor.mount.querySelector<HTMLButtonElement>('.nv-audio-transcribe')!.click()
      // A new nodeViews object forces every node view to be destroyed and rebuilt.
      editor.view.setProps({ nodeViews: { ...editor.view.props.nodeViews } })
      resolve([{ start: 0, end: 1, text: 'Kept' }])
      await tick()
      expect(editor.view.state.doc.firstChild?.attrs.transcript).toEqual([{ start: 0, end: 1, text: 'Kept' }])
    } finally { editor.destroy() }
  })

  it('never writes a late transcript into another note loaded into the same view', async () => {
    let resolve!: (segments: AudioTranscriptSegment[]) => void
    const transcribe = vi.fn(() => new Promise<AudioTranscriptSegment[]>(done => { resolve = done }))
    const attrs = { kind: 'audio', src: '.nevo/assets/shared.wav' }
    const editor = createMediaEditor(attrs, () => null, transcribe)
    try {
      await tick()
      editor.mount.querySelector<HTMLButtonElement>('.nv-audio-transcribe')!.click()
      const other = createNevoEditorState({
        schema: nevoBaseSchema,
        content: { type: 'doc', content: [{ type: 'media_block', attrs }] } as BlockNode,
        nodeViewOptions: { resolveMediaSrc: () => null, onTranscribeAudio: transcribe },
      })
      editor.view.updateState(other.state)
      editor.view.setProps({ nodeViews: other.nodeViews })
      resolve([{ start: 0, end: 1, text: 'Wrong note' }])
      await tick()
      expect(editor.view.state.doc.firstChild?.attrs.transcript).toEqual([])
    } finally { editor.destroy() }
  })

  it('does not attach a stale transcript after the audio source changes', async () => {
    let resolve!: (segments: AudioTranscriptSegment[]) => void
    const transcribe = vi.fn(() => new Promise<AudioTranscriptSegment[]>(done => { resolve = done }))
    const editor = createMediaEditor({ kind: 'audio', src: '.nevo/assets/old.wav' }, () => null, transcribe)
    try {
      await tick()
      editor.mount.querySelector<HTMLButtonElement>('.nv-audio-transcribe')!.click()
      const node = editor.view.state.doc.firstChild!
      editor.view.dispatch(editor.view.state.tr.setNodeMarkup(0, undefined, { ...node.attrs, src: '.nevo/assets/new.wav' }))
      expect(editor.mount.querySelector<HTMLButtonElement>('.nv-audio-transcribe')?.disabled).toBe(false)
      resolve([{ start: 0, end: 1, text: 'Old speech' }])
      await tick()
      expect(editor.view.state.doc.firstChild?.attrs.transcript).toEqual([])
    } finally { editor.destroy() }
  })

  it('resolves and loads an existing audio source during real editor construction', async () => {
    const mediaUrl = 'http://127.0.0.1:1/audio-ready'
    const resolveMediaSrc = vi.fn(() => mediaUrl)
    const editor = createMediaEditor({ kind: 'audio', src: 'audio-ready', name: '', size: 0 }, resolveMediaSrc)
    const audio = editor.mount.querySelector<HTMLAudioElement>('audio')!

    try {
      await tick()
      expect(resolveMediaSrc).toHaveBeenCalledWith('audio-ready')
      expect(audio.getAttribute('src')).toBe(mediaUrl)
    } finally {
      editor.destroy()
    }
  })

  it('does not resolve or load an empty video source', async () => {
    const resolveMediaSrc = vi.fn((src: string) => `http://127.0.0.1:1/media?path=${src}`)
    const editor = createMediaEditor({ kind: 'video', src: '', name: '', size: 0 }, resolveMediaSrc)
    const video = editor.mount.querySelector<HTMLVideoElement>('video')!
    const load = vi.spyOn(video, 'load').mockImplementation(() => {})

    try {
      await tick()
      expect(resolveMediaSrc).not.toHaveBeenCalled()
      expect(video.hasAttribute('src')).toBe(false)
      expect(load).not.toHaveBeenCalled()
    } finally {
      editor.destroy()
    }
  })

  it('defaults to the player layout and switches to bookmarks through the block header', async () => {
    const editor = createMediaEditor(
      { kind: 'audio', src: 'audio-ready', name: 'Track', size: 0 },
      () => 'http://127.0.0.1:1/audio-ready',
    )
    const layout = editor.mount.querySelector<HTMLElement>('.nv-audio-layout')!
    const mode = editor.mount.querySelector<HTMLElement>('.nv-audio-mode')!
    const [playerBtn, bookmarksBtn] = [...mode.querySelectorAll<HTMLButtonElement>('button')]

    try {
      await tick()
      // No bookmarks yet, so `auto` resolves to the plain player.
      expect(layout.dataset.layout).toBe('player')
      expect(editor.mount.querySelector('.nv-audio-bookmarks')?.hasAttribute('hidden')).toBe(true)
      expect(playerBtn.getAttribute('aria-pressed')).toBe('true')

      bookmarksBtn.click()
      await tick()
      const node = editor.view.state.doc.nodeAt(0)!
      expect(node.attrs.audioLayout).toBe('bookmarks')
      expect(layout.dataset.layout).toBe('bookmarks')
      expect(editor.mount.querySelector('.nv-audio-bookmarks')?.hasAttribute('hidden')).toBe(false)
      expect(bookmarksBtn.getAttribute('aria-pressed')).toBe('true')

      playerBtn.click()
      await tick()
      expect(editor.view.state.doc.nodeAt(0)!.attrs.audioLayout).toBe('player')
      expect(layout.dataset.layout).toBe('player')
    } finally {
      editor.destroy()
    }
  })

  it('shows the stored layout without the switch when the editor is read-only', async () => {
    const editor = createMediaEditor(
      { kind: 'audio', src: 'audio-ready', name: 'Track', size: 0, audioLayout: 'bookmarks', bookmarks: [] },
      () => 'http://127.0.0.1:1/audio-ready',
    )
    const mode = editor.mount.querySelector<HTMLElement>('.nv-audio-mode')!

    try {
      await tick()
      // An explicit `bookmarks` choice stays visible even without records.
      expect(editor.mount.querySelector<HTMLElement>('.nv-audio-layout')!.dataset.layout).toBe('bookmarks')

      editor.view.setProps({ editable: () => false })
      // Node views re-read `view.editable` on the next update, not on setProps.
      const node = editor.view.state.doc.nodeAt(0)!
      editor.view.dispatch(editor.view.state.tr.setNodeMarkup(0, undefined, { ...node.attrs, name: 'Locked' }))
      await tick()
      expect(mode.classList.contains('is-readonly')).toBe(true)
      expect(mode.hidden).toBe(false)
      expect([...editor.mount.querySelectorAll<HTMLButtonElement>('.nv-audio-mode-btn')].map(b => b.getAttribute('aria-pressed'))).toEqual(['false', 'true'])
    } finally {
      editor.destroy()
    }
  })

  it('hides the layout switch when there is no audio source', async () => {
    const editor = createMediaEditor(
      { kind: 'audio', src: '', name: '', size: 0 },
      () => 'http://127.0.0.1:1/audio-ready',
    )

    try {
      await tick()
      expect(editor.mount.querySelector<HTMLElement>('.nv-audio-mode')!.hidden).toBe(true)
    } finally {
      editor.destroy()
    }
  })

  it('renders the playback speed through the shared select primitive', async () => {
    const editor = createMediaEditor(
      { kind: 'audio', src: 'audio-ready', name: 'Track', size: 0 },
      () => 'http://127.0.0.1:1/audio-ready',
    )
    const trigger = editor.mount.querySelector<HTMLButtonElement>('.nv-audio-speed .nv-select__trigger')!

    try {
      await tick()
      expect(trigger).not.toBeNull()
      expect(trigger.getAttribute('aria-label')).toBe('media.playbackSpeed')
      expect(trigger.textContent).toContain('1×')

      trigger.click()
      await tick()
      const options = [...document.querySelectorAll<HTMLButtonElement>('.nv-select__option')]
      options.find(option => option.textContent?.includes('1.5×'))!.click()
      await tick()
      expect(editor.mount.querySelector('.nv-audio-speed .nv-select__trigger')!.textContent).toContain('1.5×')
    } finally {
      editor.destroy()
    }
  })

  it('cancels a native node drag that starts on an audio slider', async () => {
    const editor = createMediaEditor(
      { kind: 'audio', src: 'audio-ready', name: 'Track', size: 0 },
      () => 'http://127.0.0.1:1/audio-ready',
    )
    const block = editor.mount.querySelector<HTMLElement>('.nv-media-block')!

    try {
      await tick()
      // The block is draggable, so a drag beginning on a slider must be cancelled
      // or the control loses pointer capture after its first move.
      const seek = editor.mount.querySelector<HTMLInputElement>('.nv-audio-seek')!
      // Metadata never loads in jsdom, which keeps the seek control disabled;
      // enable it so it is focusable like a ready player.
      seek.disabled = false
      seek.focus()
      expect(document.activeElement).toBe(seek)
      const sliderDrag = new Event('dragstart', { bubbles: true, cancelable: true })
      block.dispatchEvent(sliderDrag)
      expect(sliderDrag.defaultPrevented).toBe(true)

      // A drag from anywhere else still reaches the block handle.
      seek.blur()
      const blockDrag = new Event('dragstart', { bubbles: true, cancelable: true })
      block.dispatchEvent(blockDrag)
      expect(blockDrag.defaultPrevented).toBe(false)
    } finally {
      editor.destroy()
    }
  })

  it('cancels a pending video resolver when the node changes to audio', async () => {
    const resolveMediaSrc = vi.fn((src: string) => src === 'video-pending' ? null : `http://127.0.0.1:1/media?path=${src}`)
    const editor = createMediaEditor({ kind: 'video', src: 'video-pending', name: '', size: 0 }, resolveMediaSrc)
    const video = editor.mount.querySelector<HTMLVideoElement>('video')!
    const load = vi.spyOn(video, 'load').mockImplementation(() => {})

    try {
      await tick()
      expect(resolveMediaSrc.mock.calls.filter(([src]) => src === 'video-pending')).toHaveLength(1)
      editor.view.dispatch(editor.view.state.tr.setNodeMarkup(0, undefined, {
        ...editor.view.state.doc.nodeAt(0)!.attrs,
        kind: 'audio',
        src: 'audio-ready',
      }))
      await tick()
      const loadCount = load.mock.calls.length
      await new Promise((resolve) => setTimeout(resolve, 200))

      expect(resolveMediaSrc.mock.calls.filter(([src]) => src === 'video-pending')).toHaveLength(1)
      expect(load).toHaveBeenCalledTimes(loadCount)
      expect(video.hasAttribute('src')).toBe(false)
    } finally {
      editor.destroy()
    }
  })
})
