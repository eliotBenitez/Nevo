import { ref } from 'vue'
import { i18n } from '../../../i18n'
import { resolveDictationLanguage, type TranscriptionLanguage } from '../../../core/media/transcriptionLanguage'
import { clearActiveRecording, hasActiveRecording, setActiveRecording } from '../../../core/voice-recording/activeRecording'
import {
  commitDictatedText,
  setDictationLevel,
  setDictationPartial,
  startDictationUi,
  stopDictationUi,
  type DictationPluginOptions,
} from '../../../editor-core/plugins/dictation'
import {
  cancelDictation,
  dictationErrorCode,
  startDictation,
  stopDictation,
  type DictationEvent,
} from '../../../tauri/dictation'
import { useToast } from '../../../ui/composables/useToast'
import type { EditorView } from 'prosemirror-view'
import type { EditorCore } from './useEditorCore'

export interface DictationEditorBindings {
  toggle: () => void
  plugin: DictationPluginOptions
  onEditorDestroy: () => void
}

const START_ERROR_KEYS: Record<string, string> = {
  no_device: 'dictation.errors.noDevice',
  permission_denied: 'dictation.errors.permissionDenied',
  transcription_busy: 'dictation.errors.busy',
  already_recording: 'dictation.errors.alreadyRecording',
  model_unavailable: 'dictation.errors.modelUnavailable',
  unsupported: 'dictation.errors.unsupported',
}

interface Session {
  id: string
  view: EditorView
  started: Promise<boolean>
  stopping: boolean
  ended: boolean
  completion: Promise<void> | null
  /** Resolves on the backend's `stopped`/`error` event, which follows the last `final`. */
  backendDone: Promise<void>
  resolveBackendDone: () => void
}

// The stop command can resolve before the channel delivers the trailing `final`; wait this long at most.
const STOPPED_EVENT_TIMEOUT_MS = 3000

/**
 * Owns one live-dictation session per editor instance. The backend keeps the
 * microphone until stopDictation/cancelDictation, so every path that ends a
 * session without our own stop request must call cancelDictation().
 */
export function useDictation(core: EditorCore, getLanguage: () => TranscriptionLanguage) {
  const { showToast } = useToast()
  const t = (key: string) => i18n.global.t(key)
  const isActive = ref(false)
  let session: Session | null = null

  function toastError(key: string) {
    showToast({ message: t(key), variant: 'error' })
  }

  function finish(s: Session) {
    if (s.ended) return
    s.ended = true
    if (session === s) {
      session = null
      isActive.value = false
    }
    clearActiveRecording(s.id)
    if (core.editorView === s.view) stopDictationUi(s.view)
  }

  function dropBackend() {
    void cancelDictation().catch(() => {})
  }

  function onEvent(s: Session, event: DictationEvent) {
    if (event.kind === 'stopped' || event.kind === 'error') s.resolveBackendDone()
    if (s.ended) return
    const view = core.editorView === s.view ? s.view : null
    switch (event.kind) {
      case 'partial':
        if (view) setDictationPartial(view, event.text)
        break
      case 'final':
        if (view) commitDictatedText(view, event.text)
        break
      case 'level':
        if (view) setDictationLevel(view, Math.min(1, event.rms * 8))
        break
      case 'error':
        toastError('dictation.errors.failed')
        finish(s)
        dropBackend()
        break
      case 'stopped':
        finish(s)
        if (!s.stopping) dropBackend()
        break
    }
  }

  async function start() {
    const view = core.editorView
    if (!view) return
    if (hasActiveRecording() || session) {
      toastError('dictation.errors.alreadyRecording')
      return
    }
    let resolveStarted!: (ok: boolean) => void
    let resolveBackendDone!: () => void
    const s: Session = {
      id: crypto.randomUUID(),
      view,
      started: new Promise<boolean>(resolve => { resolveStarted = resolve }),
      stopping: false,
      ended: false,
      completion: null,
      backendDone: new Promise<void>(resolve => { resolveBackendDone = resolve }),
      resolveBackendDone: () => resolveBackendDone(),
    }
    session = s
    isActive.value = true
    startDictationUi(view)
    setActiveRecording(s.id, () => stop())
    try {
      await startDictation(resolveDictationLanguage(getLanguage(), i18n.global.locale.value), event => onEvent(s, event))
      resolveStarted(true)
    } catch (error) {
      resolveStarted(false)
      finish(s)
      toastError(START_ERROR_KEYS[dictationErrorCode(error)] ?? 'dictation.errors.startFailed')
    }
  }

  function stop(): Promise<void> {
    const s = session
    if (!s) return Promise.resolve()
    if (s.completion) return s.completion
    s.stopping = true
    s.completion = (async () => {
      if (!await s.started) return
      try {
        await stopDictation()
        let timer: ReturnType<typeof setTimeout> | undefined
        await Promise.race([s.backendDone, new Promise<void>(resolve => { timer = setTimeout(resolve, STOPPED_EVENT_TIMEOUT_MS) })])
        clearTimeout(timer)
      } catch {
        dropBackend()
      } finally {
        finish(s)
      }
    })()
    return s.completion
  }

  async function cancel() {
    const s = session
    if (!s) return
    finish(s)
    if (await s.started) dropBackend()
  }

  async function toggle() {
    if (session) await stop()
    else await start()
  }

  const bindings: DictationEditorBindings = {
    toggle: () => { void toggle() },
    plugin: { onStop: () => { void stop() }, t },
    onEditorDestroy: () => { if (session) void cancel() },
  }

  return { bindings, toggle, stop, cancel, isActive }
}
