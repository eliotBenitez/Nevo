import { describe, expect, it, vi, beforeEach } from 'vitest'
import { EditorState } from 'prosemirror-state'
import { EditorView } from 'prosemirror-view'
import { nevoBaseSchema } from '../../../editor-core/schema'
import {
  createVoiceRecordingPlaceholderPlugin,
  getVoiceRecordingPlaceholder,
  type VoiceRecordingPlaceholderOptions,
} from '../../../editor-core/plugins/voice-recording-placeholder'
import { hasActiveRecording, finalizeActiveRecording } from '../../../core/voice-recording/activeRecording'
import type { EditorCore } from './useEditorCore'
import { useVoiceRecording } from './useVoiceRecording'

const { mockShowToast } = vi.hoisted(() => ({ mockShowToast: vi.fn() }))

vi.mock('../../../ui/composables/useToast', () => ({
  useToast: () => ({ showToast: mockShowToast, dismissToast: vi.fn(), toastState: { items: [] } }),
}))

vi.mock('../../../i18n', () => ({
  i18n: { global: { t: (key: string) => key } },
}))

vi.mock('../../../tauri/voiceRecording', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../tauri/voiceRecording')>()
  return {
    ...actual,
    startVoiceRecording: vi.fn(),
    stopVoiceRecording: vi.fn(),
    cancelVoiceRecording: vi.fn(),
  }
})

import * as voice from '../../../tauri/voiceRecording'

function flushAsync(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 0))
}

function makeCore(paragraphs: string[]): { core: EditorCore, view: EditorView } {
  const schema = nevoBaseSchema
  const doc = schema.node('doc', null, paragraphs.map(text =>
    schema.node('paragraph', null, text ? [schema.text(text)] : [])))
  const options: VoiceRecordingPlaceholderOptions = {
    t: (k: string) => k,
    onStop: vi.fn(),
    onCancel: vi.fn(),
    getElapsedMs: () => 0,
  }
  const state = EditorState.create({ doc, plugins: [createVoiceRecordingPlaceholderPlugin(options)] })
  const view = new EditorView(document.createElement('div'), { state })
  const core = { editorView: view } as unknown as EditorCore
  return { core, view }
}

describe('useVoiceRecording', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('start shows placeholder, registers active recording, calls start', async () => {
    vi.mocked(voice.startVoiceRecording).mockResolvedValue(undefined)
    vi.mocked(voice.cancelVoiceRecording).mockResolvedValue(undefined)
    const { core, view } = makeCore([''])
    const rec = useVoiceRecording(core, () => '/ws')

    await rec.start()

    const placeholder = getVoiceRecordingPlaceholder(view.state)
    expect(placeholder).not.toBeNull()
    expect(placeholder!.phase).toBe('recording')
    expect(hasActiveRecording()).toBe(true)
    expect(voice.startVoiceRecording).toHaveBeenCalledTimes(1)

    await rec.cancel(placeholder!.id)
    expect(hasActiveRecording()).toBe(false)
  })

  it('stop replaces placeholder with an audio media_block', async () => {
    vi.mocked(voice.startVoiceRecording).mockResolvedValue(undefined)
    vi.mocked(voice.stopVoiceRecording).mockResolvedValue({ src: '.nevo/assets/h-r.wav', name: 'R.wav', mime: 'audio/wav', size: 10, durationMs: 2500 })
    const { core, view } = makeCore([''])
    const rec = useVoiceRecording(core, () => '/ws')

    await rec.start()
    const id = getVoiceRecordingPlaceholder(view.state)!.id
    await rec.stop(id)

    expect(voice.stopVoiceRecording).toHaveBeenCalledWith('/ws', 'voiceRecording.fileLabel')
    const media = view.state.doc.firstChild!
    expect(media.type.name).toBe('media_block')
    expect(media.attrs).toMatchObject({ kind: 'audio', src: '.nevo/assets/h-r.wav', mime: 'audio/wav', size: 10, duration: 2.5 })
    expect(getVoiceRecordingPlaceholder(view.state)).toBeNull()
    expect(hasActiveRecording()).toBe(false)
  })

  it('double stop only calls stopVoiceRecording once', async () => {
    vi.mocked(voice.startVoiceRecording).mockResolvedValue(undefined)
    let resolveStop!: (asset: Awaited<ReturnType<typeof voice.stopVoiceRecording>>) => void
    vi.mocked(voice.stopVoiceRecording).mockImplementation(() => new Promise((resolve) => { resolveStop = resolve }))
    const { core, view } = makeCore([''])
    const rec = useVoiceRecording(core, () => '/ws')

    await rec.start()
    const id = getVoiceRecordingPlaceholder(view.state)!.id
    const first = rec.stop(id)
    const second = rec.stop(id)
    // stop() now awaits session.started (already-resolved here) before calling
    // stopVoiceRecording, so let that microtask hop settle before resolveStop
    // is assigned.
    await flushAsync()
    resolveStop({ src: '.nevo/assets/a.wav', name: 'a.wav', mime: 'audio/wav', size: 1, durationMs: 1000 })
    await Promise.all([first, second])

    expect(voice.stopVoiceRecording).toHaveBeenCalledTimes(1)
  })

  it('permission_denied on start removes placeholder and shows the permission toast', async () => {
    vi.mocked(voice.startVoiceRecording).mockRejectedValue('permission_denied')
    const { core, view } = makeCore([''])
    const rec = useVoiceRecording(core, () => '/ws')

    await rec.start()

    expect(getVoiceRecordingPlaceholder(view.state)).toBeNull()
    expect(hasActiveRecording()).toBe(false)
    expect(mockShowToast).toHaveBeenCalledWith({ message: 'voiceRecording.errors.permissionDenied', variant: 'error' })
  })

  it('import_failed on stop removes placeholder and shows saveFailed toast', async () => {
    vi.mocked(voice.startVoiceRecording).mockResolvedValue(undefined)
    vi.mocked(voice.stopVoiceRecording).mockRejectedValue('import_failed: disk full')
    const { core, view } = makeCore([''])
    const rec = useVoiceRecording(core, () => '/ws')

    await rec.start()
    const id = getVoiceRecordingPlaceholder(view.state)!.id
    await rec.stop(id)

    expect(getVoiceRecordingPlaceholder(view.state)).toBeNull()
    expect(hasActiveRecording()).toBe(false)
    expect(mockShowToast).toHaveBeenCalledWith({ message: 'voiceRecording.errors.saveFailed', variant: 'error' })
  })

  it('cancel calls cancelVoiceRecording and removes placeholder', async () => {
    vi.mocked(voice.startVoiceRecording).mockResolvedValue(undefined)
    vi.mocked(voice.cancelVoiceRecording).mockResolvedValue(undefined)
    const { core, view } = makeCore([''])
    const rec = useVoiceRecording(core, () => '/ws')

    await rec.start()
    const id = getVoiceRecordingPlaceholder(view.state)!.id
    await rec.cancel(id)

    expect(voice.cancelVoiceRecording).toHaveBeenCalledTimes(1)
    expect(getVoiceRecordingPlaceholder(view.state)).toBeNull()
    expect(hasActiveRecording()).toBe(false)
  })

  it('second start while active shows alreadyRecording toast and does not call start', async () => {
    vi.mocked(voice.startVoiceRecording).mockResolvedValue(undefined)
    vi.mocked(voice.cancelVoiceRecording).mockResolvedValue(undefined)
    const { core, view } = makeCore([''])
    const rec = useVoiceRecording(core, () => '/ws')

    await rec.start()
    vi.mocked(voice.startVoiceRecording).mockClear()
    await rec.start()

    expect(voice.startVoiceRecording).not.toHaveBeenCalled()
    expect(mockShowToast).toHaveBeenCalledWith({ message: 'voiceRecording.errors.alreadyRecording', variant: 'error' })

    const id = getVoiceRecordingPlaceholder(view.state)!.id
    await rec.cancel(id)
  })

  it('onEditorDestroy while recording stops, imports and shows savedNotInserted', async () => {
    vi.mocked(voice.startVoiceRecording).mockResolvedValue(undefined)
    vi.mocked(voice.stopVoiceRecording).mockResolvedValue({ src: '.nevo/assets/a.wav', name: 'a.wav', mime: 'audio/wav', size: 1, durationMs: 1000 })
    const { core, view } = makeCore([''])
    const rec = useVoiceRecording(core, () => '/ws')

    await rec.start()
    rec.bindings.onEditorDestroy()
    await flushAsync()

    expect(voice.stopVoiceRecording).toHaveBeenCalledTimes(1)
    expect(mockShowToast).toHaveBeenCalledWith({ message: 'voiceRecording.savedNotInserted', variant: 'info' })
    expect(getVoiceRecordingPlaceholder(view.state)).toBeNull()
    expect(hasActiveRecording()).toBe(false)
    // The view was never actually destroyed here (only its placeholder was
    // pre-emptively removed), so the block insertion attempt correctly finds
    // no placeholder left and falls back to the "not inserted" toast instead
    // of throwing.
    expect(view.state.doc.firstChild!.type.name).toBe('paragraph')
  })

  it('finalizeActiveRecording() inserts the block while the view is alive', async () => {
    vi.mocked(voice.startVoiceRecording).mockResolvedValue(undefined)
    vi.mocked(voice.stopVoiceRecording).mockResolvedValue({ src: '.nevo/assets/a.wav', name: 'a.wav', mime: 'audio/wav', size: 1, durationMs: 2000 })
    const { core, view } = makeCore([''])
    const rec = useVoiceRecording(core, () => '/ws')

    await rec.start()
    await finalizeActiveRecording()

    expect(view.state.doc.firstChild!.type.name).toBe('media_block')
    expect(hasActiveRecording()).toBe(false)
    void rec
  })

  it('finalizeActiveRecording waits for a manual stop to insert the audio block', async () => {
    vi.mocked(voice.startVoiceRecording).mockResolvedValue(undefined)
    let resolveStop!: (asset: Awaited<ReturnType<typeof voice.stopVoiceRecording>>) => void
    vi.mocked(voice.stopVoiceRecording).mockImplementation(() => new Promise((resolve) => { resolveStop = resolve }))
    const { core, view } = makeCore([''])
    const rec = useVoiceRecording(core, () => '/ws')

    await rec.start()
    const id = getVoiceRecordingPlaceholder(view.state)!.id
    const manualStop = rec.stop(id)
    await flushAsync()

    let finalizeSettled = false
    const finalize = finalizeActiveRecording().then(() => { finalizeSettled = true })
    await flushAsync()

    expect(finalizeSettled).toBe(false)

    resolveStop({ src: '.nevo/assets/a.wav', name: 'a.wav', mime: 'audio/wav', size: 1, durationMs: 2000 })
    await Promise.all([manualStop, finalize])

    expect(view.state.doc.firstChild!.type.name).toBe('media_block')
    expect(hasActiveRecording()).toBe(false)
  })

  it('a failed start leaves no active recording so a later start works', async () => {
    vi.mocked(voice.startVoiceRecording).mockRejectedValueOnce('permission_denied')
    const { core, view } = makeCore([''])
    const rec = useVoiceRecording(core, () => '/ws')

    await rec.start()
    expect(hasActiveRecording()).toBe(false)

    vi.mocked(voice.startVoiceRecording).mockResolvedValueOnce(undefined)
    vi.mocked(voice.cancelVoiceRecording).mockResolvedValue(undefined)
    await rec.start()

    expect(hasActiveRecording()).toBe(true)
    const id = getVoiceRecordingPlaceholder(view.state)!.id
    await rec.cancel(id)
  })

  describe('races with a still-pending startVoiceRecording()', () => {
    it('stop called before start resolves waits, then stops after start succeeds', async () => {
      let resolveStart!: () => void
      vi.mocked(voice.startVoiceRecording).mockImplementation(() => new Promise((resolve) => { resolveStart = resolve }))
      vi.mocked(voice.stopVoiceRecording).mockResolvedValue({ src: '.nevo/assets/a.wav', name: 'a.wav', mime: 'audio/wav', size: 1, durationMs: 1000 })
      const { core, view } = makeCore([''])
      const rec = useVoiceRecording(core, () => '/ws')

      const startPromise = rec.start()
      const id = getVoiceRecordingPlaceholder(view.state)!.id
      const stopPromise = rec.stop(id)

      await flushAsync()
      expect(voice.stopVoiceRecording).not.toHaveBeenCalled()

      resolveStart()
      await Promise.all([startPromise, stopPromise])

      expect(voice.stopVoiceRecording).toHaveBeenCalledTimes(1)
      expect(voice.stopVoiceRecording).toHaveBeenCalledWith('/ws', 'voiceRecording.fileLabel')
      expect(view.state.doc.firstChild!.type.name).toBe('media_block')
      expect(hasActiveRecording()).toBe(false)
    })

    it('cancel called before start resolves waits, then cancels after start succeeds', async () => {
      let resolveStart!: () => void
      vi.mocked(voice.startVoiceRecording).mockImplementation(() => new Promise((resolve) => { resolveStart = resolve }))
      vi.mocked(voice.cancelVoiceRecording).mockResolvedValue(undefined)
      const { core, view } = makeCore([''])
      const rec = useVoiceRecording(core, () => '/ws')

      const startPromise = rec.start()
      const id = getVoiceRecordingPlaceholder(view.state)!.id
      const cancelPromise = rec.cancel(id)

      await flushAsync()
      expect(voice.cancelVoiceRecording).not.toHaveBeenCalled()

      resolveStart()
      await Promise.all([startPromise, cancelPromise])

      expect(voice.cancelVoiceRecording).toHaveBeenCalledTimes(1)
      expect(getVoiceRecordingPlaceholder(view.state)).toBeNull()
      expect(hasActiveRecording()).toBe(false)
    })

    it('stop called before a start that then rejects never calls stopVoiceRecording and shows a single start-failure toast', async () => {
      let rejectStart!: (reason: unknown) => void
      vi.mocked(voice.startVoiceRecording).mockImplementation(() => new Promise((_resolve, reject) => { rejectStart = reject }))
      const { core, view } = makeCore([''])
      const rec = useVoiceRecording(core, () => '/ws')

      const startPromise = rec.start()
      const id = getVoiceRecordingPlaceholder(view.state)!.id
      const stopPromise = rec.stop(id)

      rejectStart('permission_denied')
      await Promise.all([startPromise, stopPromise])

      expect(voice.stopVoiceRecording).not.toHaveBeenCalled()
      expect(mockShowToast).toHaveBeenCalledTimes(1)
      expect(mockShowToast).toHaveBeenCalledWith({ message: 'voiceRecording.errors.permissionDenied', variant: 'error' })
      expect(getVoiceRecordingPlaceholder(view.state)).toBeNull()
      expect(hasActiveRecording()).toBe(false)
    })
  })
})
