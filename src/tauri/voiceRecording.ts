import { invoke } from '@tauri-apps/api/core'
import { appLogger } from '../utils/logger'

export interface RecordedAudioAsset {
  src: string
  name: string
  mime: string
  size: number
  durationMs: number
}

export type VoiceRecordingErrorCode =
  | 'permission_denied'
  | 'no_device'
  | 'already_recording'
  | 'not_recording'
  | 'unsupported'
  | 'import_failed'
  | 'recording_failed'

const EXACT_CODES: VoiceRecordingErrorCode[] = [
  'permission_denied',
  'no_device',
  'already_recording',
  'not_recording',
  'unsupported',
]

async function invokeVoice<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(command, args)
  } catch (error) {
    await appLogger.error({ source: 'frontend.invoke', event: command, message: 'Tauri command failed', error })
    throw error
  }
}

/**
 * Desktop-only: the loopback capture pipeline behind these commands is not
 * wired up on Android/iOS. `main.ts` stamps the resolved platform onto the
 * root element before mount (same signal as `src/tauri/mediaServer.ts`
 * `isMobileRuntime`), so this is a reliable synchronous check.
 */
export function isVoiceRecordingSupported(): boolean {
  if (typeof document === 'undefined') return false
  const platform = document.documentElement.dataset.platform
  return platform !== 'android' && platform !== 'ios'
}

export function startVoiceRecording(): Promise<void> {
  return invokeVoice<void>('voice_recording_start')
}

export function stopVoiceRecording(workspacePath: string, label: string): Promise<RecordedAudioAsset> {
  return invokeVoice<RecordedAudioAsset>('voice_recording_stop', { workspacePath, label })
}

export function cancelVoiceRecording(): Promise<void> {
  return invokeVoice<void>('voice_recording_cancel')
}

export function voiceRecordingErrorCode(error: unknown): VoiceRecordingErrorCode {
  const message = typeof error === 'string' ? error : ''
  const exact = EXACT_CODES.find(code => code === message)
  if (exact) return exact
  if (message.startsWith('import_failed')) return 'import_failed'
  return 'recording_failed'
}
