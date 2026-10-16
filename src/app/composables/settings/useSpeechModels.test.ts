import { beforeEach, describe, expect, it, vi } from 'vitest'

const { showToast } = vi.hoisted(() => ({ showToast: vi.fn() }))

vi.mock('../../../ui/composables/useToast', () => ({ useToast: () => ({ showToast }) }))
vi.mock('../../../i18n', () => ({ i18n: { global: { t: (key: string) => key } } }))
vi.mock('../../../tauri/speechModels', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../tauri/speechModels')>()),
  listSpeechModels: vi.fn(),
  downloadSpeechModel: vi.fn(),
  cancelSpeechModelDownload: vi.fn(),
  selectSpeechModel: vi.fn(),
  deleteSpeechModel: vi.fn(),
}))

import * as api from '../../../tauri/speechModels'
import { useSpeechModels } from './useSpeechModels'

const list = [{ id: 'base', bytes: 1, installed: true, active: true, bundled: true }] as api.SpeechModelInfo[]

describe('useSpeechModels', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(api.listSpeechModels).mockResolvedValue(list)
  })

  it('tracks progress as a 0..1 fraction and refreshes after download', async () => {
    vi.mocked(api.downloadSpeechModel).mockImplementation(async (_id, onProgress) => {
      onProgress({ received: 25, total: 100 })
    })
    const m = useSpeechModels()
    const p = m.download('small')
    expect(m.downloadingId.value).toBe('small')
    await p
    expect(m.downloadingId.value).toBeNull()
    expect(m.models.value).toEqual(list)
    expect(m.progress.value).toBe(0.25)
    expect(showToast).not.toHaveBeenCalled()
  })

  it('keeps cancelled downloads silent but toasts other failures', async () => {
    const m = useSpeechModels()
    vi.mocked(api.downloadSpeechModel).mockRejectedValue('download_cancelled')
    await m.download('small')
    expect(showToast).not.toHaveBeenCalled()
    vi.mocked(api.downloadSpeechModel).mockRejectedValue('integrity_failed')
    await m.download('small')
    expect(showToast).toHaveBeenCalledWith({ message: 'settings.editor.speechModel.errors.integrity', variant: 'error' })
  })

  it('selects and removes with a re-list, toasting busy errors', async () => {
    const m = useSpeechModels()
    await m.select('small')
    await m.remove('small')
    expect(api.selectSpeechModel).toHaveBeenCalledWith('small')
    expect(api.deleteSpeechModel).toHaveBeenCalledWith('small')
    expect(api.listSpeechModels).toHaveBeenCalledTimes(2)
    vi.mocked(api.selectSpeechModel).mockRejectedValue('transcription_busy')
    await m.select('turbo')
    expect(showToast).toHaveBeenCalledWith({ message: 'settings.editor.speechModel.errors.busy', variant: 'error' })
  })
})
