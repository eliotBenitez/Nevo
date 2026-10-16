import { invoke, Channel } from '@tauri-apps/api/core'
import type { TranscriptionLanguage } from '../core/media/transcriptionLanguage'
import { appLogger } from '../utils/logger'

export type DictationEvent =
  | { kind: 'partial'; text: string }
  | { kind: 'final'; text: string }
  | { kind: 'level'; rms: number }
  | { kind: 'error'; code: string }
  | { kind: 'stopped' }

export type DictationErrorCode =
  | 'audio_language_unsupported'
  | 'model_unavailable'
  | 'already_recording'
  | 'transcription_busy'
  | 'no_device'
  | 'permission_denied'
  | 'unsupported'
  | 'not_recording'
  | 'recording_failed'

const EXACT_CODES: DictationErrorCode[] = [
  'audio_language_unsupported',
  'model_unavailable',
  'already_recording',
  'transcription_busy',
  'no_device',
  'permission_denied',
  'unsupported',
  'not_recording',
]

async function invokeDictation<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(command, args)
  } catch (error) {
    await appLogger.error({ source: 'frontend.invoke', event: command, message: 'Tauri command failed', error })
    throw error
  }
}

export function isDictationSupported(): boolean {
  if (typeof document === 'undefined') return false
  const platform = document.documentElement.dataset.platform
  return platform === 'windows' || platform === 'macos' || platform === 'linux'
}

export function startDictation(language: TranscriptionLanguage, onEvent: (e: DictationEvent) => void): Promise<void> {
  const channel = new Channel<DictationEvent>()
  channel.onmessage = onEvent
  return invokeDictation<void>('dictation_start', { language: language === 'auto' ? null : language, onEvent: channel })
}

export function stopDictation(): Promise<void> {
  return invokeDictation<void>('dictation_stop')
}

export function cancelDictation(): Promise<void> {
  return invokeDictation<void>('dictation_cancel')
}

export function dictationErrorCode(error: unknown): DictationErrorCode {
  const message = typeof error === 'string' ? error : error instanceof Error ? error.message : ''
  return EXACT_CODES.find(code => code === message) ?? 'recording_failed'
}
