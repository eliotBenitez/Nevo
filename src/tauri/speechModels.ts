import { invoke, Channel } from '@tauri-apps/api/core'
import { appLogger } from '../utils/logger'

export type SpeechModelId = 'base' | 'small' | 'turbo'

export interface SpeechModelInfo {
  id: SpeechModelId
  bytes: number
  installed: boolean
  active: boolean
  bundled: boolean
}

export interface SpeechModelProgress {
  received: number
  total: number
}

export type SpeechModelErrorCode =
  | 'unknown_model'
  | 'model_bundled'
  | 'model_not_installed'
  | 'transcription_busy'
  | 'download_in_progress'
  | 'download_cancelled'
  | 'integrity_failed'
  | 'download_failed'

const EXACT_CODES: SpeechModelErrorCode[] = [
  'unknown_model',
  'model_bundled',
  'model_not_installed',
  'transcription_busy',
  'download_in_progress',
  'download_cancelled',
  'integrity_failed',
]

async function invokeSpeechModel<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(command, args)
  } catch (error) {
    await appLogger.error({ source: 'frontend.invoke', event: command, message: 'Tauri command failed', error })
    throw error
  }
}

export function listSpeechModels(): Promise<SpeechModelInfo[]> {
  return invokeSpeechModel<SpeechModelInfo[]>('speech_models_list')
}

export function downloadSpeechModel(id: SpeechModelId, onProgress: (p: SpeechModelProgress) => void): Promise<void> {
  const channel = new Channel<SpeechModelProgress>()
  channel.onmessage = onProgress
  return invokeSpeechModel<void>('speech_model_download', { id, onProgress: channel })
}

export function cancelSpeechModelDownload(): Promise<void> {
  return invokeSpeechModel<void>('speech_model_cancel_download')
}

export function selectSpeechModel(id: SpeechModelId): Promise<void> {
  return invokeSpeechModel<void>('speech_model_select', { id })
}

export function deleteSpeechModel(id: SpeechModelId): Promise<void> {
  return invokeSpeechModel<void>('speech_model_delete', { id })
}

export function speechModelErrorCode(error: unknown): SpeechModelErrorCode {
  const message = typeof error === 'string' ? error : error instanceof Error ? error.message : ''
  return EXACT_CODES.find(code => code === message) ?? 'download_failed'
}
