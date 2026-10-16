import { computed, ref } from 'vue'
import { i18n } from '../../../i18n'
import {
  cancelSpeechModelDownload,
  deleteSpeechModel,
  downloadSpeechModel,
  listSpeechModels,
  selectSpeechModel,
  speechModelErrorCode,
  type SpeechModelErrorCode,
  type SpeechModelId,
  type SpeechModelInfo,
} from '../../../tauri/speechModels'
import { useToast } from '../../../ui/composables/useToast'

// Empty key means the failure is expected and must stay silent.
const ERROR_KEYS: Record<SpeechModelErrorCode, string> = {
  unknown_model: 'settings.editor.speechModel.errors.generic',
  model_bundled: 'settings.editor.speechModel.errors.generic',
  model_not_installed: 'settings.editor.speechModel.errors.generic',
  transcription_busy: 'settings.editor.speechModel.errors.busy',
  download_in_progress: 'settings.editor.speechModel.errors.inProgress',
  download_cancelled: '',
  integrity_failed: 'settings.editor.speechModel.errors.integrity',
  download_failed: 'settings.editor.speechModel.errors.download',
}

// Module scope: a download outlives the settings panel, so reopening it must show its progress.
const models = ref<SpeechModelInfo[]>([])
const downloadingId = ref<SpeechModelId | null>(null)
const progress = ref(0)
const pending = ref(false)
const busy = computed(() => pending.value || downloadingId.value !== null)

export function useSpeechModels() {
  const { showToast } = useToast()

  function reportError(error: unknown) {
    const key = ERROR_KEYS[speechModelErrorCode(error)]
    if (key) showToast({ message: i18n.global.t(key), variant: 'error' })
  }

  async function refresh() {
    try {
      models.value = await listSpeechModels()
    } catch (error) {
      reportError(error)
    }
  }

  async function download(id: SpeechModelId) {
    if (busy.value) return
    downloadingId.value = id
    progress.value = 0
    try {
      await downloadSpeechModel(id, p => {
        progress.value = p.total > 0 ? Math.min(1, p.received / p.total) : 0
      })
    } catch (error) {
      reportError(error)
    } finally {
      downloadingId.value = null
      await refresh()
    }
  }

  async function cancel() {
    try {
      await cancelSpeechModelDownload()
    } catch (error) {
      reportError(error)
    }
  }

  async function mutate(action: () => Promise<void>) {
    if (busy.value) return
    pending.value = true
    try {
      await action()
    } catch (error) {
      reportError(error)
    } finally {
      pending.value = false
      await refresh()
    }
  }

  const select = (id: SpeechModelId) => mutate(() => selectSpeechModel(id))
  const remove = (id: SpeechModelId) => mutate(() => deleteSpeechModel(id))

  return { models, downloadingId, progress, busy, refresh, download, cancel, select, remove }
}
