import { afterEach, describe, expect, it, vi } from 'vitest'
import { invoke } from '@tauri-apps/api/core'
import { isTranscriptionSupported, transcribeAudio } from './transcription'

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }))
vi.mock('../utils/logger', () => ({ appLogger: { error: vi.fn() } }))

describe('local transcription IPC', () => {
  afterEach(() => {
    vi.clearAllMocks()
    delete document.documentElement.dataset.platform
  })

  it('sends only the workspace-relative asset src and returns segments', async () => {
    const result = [{ start: 0, end: 2, text: 'Hello' }]
    vi.mocked(invoke).mockResolvedValue(result)
    await expect(transcribeAudio('.nevo/assets/recording.wav')).resolves.toEqual(result)
    expect(invoke).toHaveBeenCalledWith('transcribe_audio', { src: '.nevo/assets/recording.wav', language: 'auto' })
  })

  it('passes a selected language for music with vocals', async () => {
    vi.mocked(invoke).mockResolvedValue([])
    await transcribeAudio('.nevo/assets/song.mp3', 'ru')
    expect(invoke).toHaveBeenCalledWith('transcribe_audio', { src: '.nevo/assets/song.mp3', language: 'ru' })
  })

  it('advertises transcription only on supported desktop platforms', () => {
    expect(isTranscriptionSupported()).toBe(false)
    document.documentElement.dataset.platform = 'web'
    expect(isTranscriptionSupported()).toBe(false)
    document.documentElement.dataset.platform = 'android'
    expect(isTranscriptionSupported()).toBe(false)
    document.documentElement.dataset.platform = 'windows'
    expect(isTranscriptionSupported()).toBe(true)
    document.documentElement.dataset.platform = 'macos'
    expect(isTranscriptionSupported()).toBe(true)
    document.documentElement.dataset.platform = 'linux'
    expect(isTranscriptionSupported()).toBe(true)
  })
})
