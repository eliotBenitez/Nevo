import { beforeEach, describe, expect, it, vi } from 'vitest'
import { EditorState, TextSelection } from 'prosemirror-state'
import { EditorView } from 'prosemirror-view'
import { nevoBaseSchema } from '../../../editor-core/schema'
import { createDictationPlugin, getDictationState } from '../../../editor-core/plugins/dictation'
import { clearActiveRecording, hasActiveRecording, setActiveRecording } from '../../../core/voice-recording/activeRecording'
import type { EditorCore } from './useEditorCore'
import { useDictation } from './useDictation'

const { mockShowToast } = vi.hoisted(() => ({ mockShowToast: vi.fn() }))

vi.mock('../../../ui/composables/useToast', () => ({
  useToast: () => ({ showToast: mockShowToast, dismissToast: vi.fn(), toastState: { items: [] } }),
}))

vi.mock('../../../i18n', () => ({
  i18n: { global: { t: (key: string) => key, locale: { value: 'ru' } } },
}))

vi.mock('../../../tauri/dictation', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../tauri/dictation')>()
  return { ...actual, startDictation: vi.fn(), stopDictation: vi.fn(), cancelDictation: vi.fn() }
})

import * as api from '../../../tauri/dictation'

type Emit = (e: api.DictationEvent) => void

function makeCore(): { core: EditorCore, view: EditorView } {
  const doc = nevoBaseSchema.node('doc', null, [nevoBaseSchema.node('paragraph', null, [])])
  const state = EditorState.create({ doc, plugins: [createDictationPlugin({ onStop: vi.fn(), t: k => k })] })
  const view = new EditorView(document.createElement('div'), { state })
  view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 1)))
  return { core: { editorView: view } as unknown as EditorCore, view }
}

function mockStart(): { emit: () => Emit } {
  let emit: Emit = () => {}
  vi.mocked(api.startDictation).mockImplementation(async (_lang, onEvent) => { emit = onEvent })
  return { emit: () => emit }
}

describe('useDictation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(api.stopDictation).mockResolvedValue(undefined)
    vi.mocked(api.cancelDictation).mockResolvedValue(undefined)
  })

  it('commits finals and shows partials, then stop cleans up', async () => {
    const { emit } = mockStart()
    const { core, view } = makeCore()
    const d = useDictation(core, () => 'auto')

    await d.toggle()
    expect(getDictationState(view.state).active).toBe(true)
    expect(hasActiveRecording()).toBe(true)
    expect(api.startDictation).toHaveBeenCalledWith('ru', expect.any(Function))

    emit()({ kind: 'partial', text: 'hel' })
    expect(getDictationState(view.state).partial).toBe('hel')
    emit()({ kind: 'final', text: 'hello' })
    expect(view.state.doc.textContent).toBe('hello')

    vi.mocked(api.stopDictation).mockImplementation(async () => {
      emit()({ kind: 'final', text: 'world' })
      emit()({ kind: 'stopped' })
    })
    await d.toggle()
    expect(api.stopDictation).toHaveBeenCalledTimes(1)
    expect(view.state.doc.textContent).toBe('hello world')
    expect(getDictationState(view.state).active).toBe(false)
    expect(hasActiveRecording()).toBe(false)
    expect(api.cancelDictation).not.toHaveBeenCalled()
    expect(d.isActive.value).toBe(false)
  })

  it('maps start errors to toasts and cleans up', async () => {
    vi.mocked(api.startDictation).mockRejectedValue('no_device')
    const { core, view } = makeCore()
    const d = useDictation(core, () => 'auto')

    await d.toggle()
    expect(mockShowToast).toHaveBeenCalledWith({ message: 'dictation.errors.noDevice', variant: 'error' })
    expect(getDictationState(view.state).active).toBe(false)
    expect(hasActiveRecording()).toBe(false)

    vi.mocked(api.startDictation).mockRejectedValue('boom')
    await d.toggle()
    expect(mockShowToast).toHaveBeenLastCalledWith({ message: 'dictation.errors.startFailed', variant: 'error' })
  })

  it('cancels the backend on an error event', async () => {
    const { emit } = mockStart()
    const { core, view } = makeCore()
    const d = useDictation(core, () => 'auto')

    await d.toggle()
    emit()({ kind: 'error', code: 'recording_failed' })
    emit()({ kind: 'stopped' })

    expect(mockShowToast).toHaveBeenCalledWith({ message: 'dictation.errors.failed', variant: 'error' })
    expect(api.cancelDictation).toHaveBeenCalledTimes(1)
    expect(getDictationState(view.state).active).toBe(false)
    expect(hasActiveRecording()).toBe(false)
  })

  it('cancels the backend on an unexpected stopped event', async () => {
    const { emit } = mockStart()
    const { core } = makeCore()
    const d = useDictation(core, () => 'auto')

    await d.toggle()
    emit()({ kind: 'stopped' })
    expect(api.cancelDictation).toHaveBeenCalledTimes(1)
    expect(d.isActive.value).toBe(false)
  })

  it('refuses to start while another recording is active', async () => {
    setActiveRecording('voice', async () => {})
    const { core, view } = makeCore()
    const d = useDictation(core, () => 'auto')

    await d.toggle()
    clearActiveRecording('voice')

    expect(api.startDictation).not.toHaveBeenCalled()
    expect(mockShowToast).toHaveBeenCalledWith({ message: 'dictation.errors.alreadyRecording', variant: 'error' })
    expect(getDictationState(view.state).active).toBe(false)
  })

  it('cancels on editor destroy and ignores later events', async () => {
    const { emit } = mockStart()
    const { core, view } = makeCore()
    const d = useDictation(core, () => 'auto')

    await d.toggle()
    d.bindings.onEditorDestroy()
    await Promise.resolve()
    await Promise.resolve()
    emit()({ kind: 'final', text: 'late' })

    expect(api.cancelDictation).toHaveBeenCalledTimes(1)
    expect(view.state.doc.textContent).toBe('')
  })
})
