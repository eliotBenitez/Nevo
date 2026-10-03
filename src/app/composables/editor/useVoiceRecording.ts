import { i18n } from '../../../i18n'
import {
  getVoiceRecordingPlaceholder,
  removeVoiceRecordingPlaceholder,
  replaceVoiceRecordingPlaceholder,
  setVoiceRecordingPlaceholderPhase,
  showVoiceRecordingPlaceholder,
  type VoiceRecordingPlaceholderOptions,
} from '../../../editor-core/plugins/voice-recording-placeholder'
import { clearActiveRecording, hasActiveRecording, setActiveRecording } from '../../../core/voice-recording/activeRecording'
import {
  cancelVoiceRecording,
  startVoiceRecording,
  stopVoiceRecording,
  voiceRecordingErrorCode,
  type RecordedAudioAsset,
} from '../../../tauri/voiceRecording'
import { useToast } from '../../../ui/composables/useToast'
import type { EditorCore } from './useEditorCore'

export interface VoiceRecordingEditorBindings {
  request: () => void
  placeholder: Omit<VoiceRecordingPlaceholderOptions, 't'>
  onEditorDestroy: () => void
}

const START_ERROR_KEYS: Record<string, string> = {
  permission_denied: 'voiceRecording.errors.permissionDenied',
  no_device: 'voiceRecording.errors.noDevice',
  already_recording: 'voiceRecording.errors.alreadyRecording',
  unsupported: 'voiceRecording.errors.unsupported',
}

/**
 * Owns one recording session at a time for a single editor instance:
 * Start shows a placeholder widget and kicks off native capture; Stop asks
 * the backend to import the temp recording into the workspace asset store
 * and swaps the placeholder for an audio `media_block`; Cancel discards it.
 * `setActiveRecording`/`finalizeActiveRecording` (src/core/voice-recording)
 * let navigation/app-close code finish an in-progress recording without
 * importing editor internals.
 */
export function useVoiceRecording(
  core: EditorCore,
  getWorkspacePath: () => string | null,
  onOverlaysUpdate: () => void = () => {},
) {
  const { showToast } = useToast()
  const t = (key: string) => i18n.global.t(key)
  // `started` resolves once the native start() call settles: true on success,
  // false on failure. stop()/cancel() await it before touching the recording
  // so a Stop/Cancel/finalize that races a still-pending startVoiceRecording()
  // can't tell the backend to stop a recording slot that hasn't started yet
  // (the Rust side answers `not_recording` for that and leaves the mic armed
  // with nothing left tracking it).
  let session: { id: string, startedAt: number, stopping: boolean, started: Promise<boolean>, completion: Promise<void> | null } | null = null

  function toastError(key: string) {
    showToast({ message: t(key), variant: 'error' })
  }

  function mediaAttrs(asset: RecordedAudioAsset) {
    return {
      kind: 'audio',
      src: asset.src,
      name: asset.name,
      mime: asset.mime,
      size: asset.size,
      duration: asset.durationMs > 0 ? asset.durationMs / 1000 : null,
      poster: '',
    }
  }

  async function start() {
    const view = core.editorView
    if (!view) return
    if (hasActiveRecording() || session) {
      toastError('voiceRecording.errors.alreadyRecording')
      return
    }
    const id = crypto.randomUUID()
    let resolveStarted!: (ok: boolean) => void
    const started = new Promise<boolean>(resolve => { resolveStarted = resolve })
    session = { id, startedAt: Date.now(), stopping: false, started, completion: null }
    showVoiceRecordingPlaceholder(view, id)
    setActiveRecording(id, () => stop(id))
    try {
      await startVoiceRecording()
      if (session?.id === id && !session.stopping) session.startedAt = Date.now()
      resolveStarted(true)
    } catch (error) {
      resolveStarted(false)
      // This catch is the sole owner of cleanup for a failed start, even when
      // a stop()/cancel() is concurrently awaiting `started` below — they see
      // `false` and just return.
      clearActiveRecording(id)
      if (session?.id === id) session = null
      if (core.editorView) removeVoiceRecordingPlaceholder(core.editorView, id)
      toastError(START_ERROR_KEYS[voiceRecordingErrorCode(error)] ?? 'voiceRecording.errors.startFailed')
    }
  }

  async function stop(id: string) {
    if (!session || session.id !== id) return
    if (session.completion) return session.completion
    if (session.stopping) return
    const current = session
    current.stopping = true
    current.completion = (async () => {
      const startedOk = await current.started
      if (!startedOk) return
      const workspacePath = getWorkspacePath()
      if (core.editorView) setVoiceRecordingPlaceholderPhase(core.editorView, id, 'saving')
      try {
        if (!workspacePath) {
          await cancelVoiceRecording()
          if (core.editorView) removeVoiceRecordingPlaceholder(core.editorView, id)
          return
        }
        const asset = await stopVoiceRecording(workspacePath, t('voiceRecording.fileLabel'))
        const view = core.editorView
        const mediaType = view?.state.schema.nodes.media_block
        const inserted = view && mediaType
          ? replaceVoiceRecordingPlaceholder(view, id, mediaType.create(mediaAttrs(asset)))
          : false
        if (inserted) onOverlaysUpdate()
        else showToast({ message: t('voiceRecording.savedNotInserted'), variant: 'info' })
      } catch (error) {
        if (core.editorView) removeVoiceRecordingPlaceholder(core.editorView, id)
        toastError(voiceRecordingErrorCode(error) === 'import_failed'
          ? 'voiceRecording.errors.saveFailed'
          : 'voiceRecording.errors.stopFailed')
      } finally {
        clearActiveRecording(id)
        if (session?.id === id) session = null
      }
    })()
    return current.completion
  }

  async function cancel(id: string) {
    if (!session || session.id !== id) return
    if (session.completion) return session.completion
    if (session.stopping) return
    const current = session
    current.stopping = true
    current.completion = (async () => {
      const startedOk = await current.started
      if (!startedOk) return
      try {
        await cancelVoiceRecording()
      } catch {
        // The temp file is left in the cache dir; nothing references it.
      } finally {
        if (core.editorView) removeVoiceRecordingPlaceholder(core.editorView, id)
        clearActiveRecording(id)
        if (session?.id === id) session = null
      }
    })()
    return current.completion
  }

  const bindings: VoiceRecordingEditorBindings = {
    request: () => { void start() },
    placeholder: {
      onStop: id => { void stop(id) },
      onCancel: id => { void cancel(id) },
      getElapsedMs: id => (session?.id === id ? Date.now() - session.startedAt : 0),
    },
    // Safety net only: navigation/app-close hooks finalize earlier via
    // finalizeActiveRecording(). Here the view is going away, so the block
    // cannot be inserted — stop() reports "saved to assets, not inserted".
    onEditorDestroy: () => {
      if (!session || session.stopping) return
      const id = session.id
      const view = core.editorView
      if (view && getVoiceRecordingPlaceholder(view.state)?.id === id) removeVoiceRecordingPlaceholder(view, id)
      void stop(id)
    },
  }

  return { bindings, start, stop, cancel }
}
