import { invoke } from '@tauri-apps/api/core'
import type { AudioTranscriptSegment } from '../core/media/audioTranscript'
import type { TranscriptionLanguage } from '../core/media/transcriptionLanguage'
import { appLogger } from '../utils/logger'

export function isTranscriptionSupported(): boolean {
  if (typeof document === 'undefined') return false
  const platform = document.documentElement.dataset.platform
  return platform === 'windows' || platform === 'macos' || platform === 'linux'
}

export async function transcribeAudio(src: string, language: TranscriptionLanguage = 'auto'): Promise<AudioTranscriptSegment[]> {
  try {
    return await invoke<AudioTranscriptSegment[]>('transcribe_audio', { src, language })
  } catch (error) {
    await appLogger.error({ source: 'frontend.invoke', event: 'transcribe_audio', message: 'Local transcription failed', error })
    throw error
  }
}
