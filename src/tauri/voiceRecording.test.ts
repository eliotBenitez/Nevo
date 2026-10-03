import { beforeEach, describe, expect, it, vi } from 'vitest'

const invoke = vi.hoisted(() => vi.fn())
vi.mock('@tauri-apps/api/core', () => ({ invoke }))
vi.mock('../utils/logger', () => ({ appLogger: { error: vi.fn() } }))

import {
  cancelVoiceRecording,
  isVoiceRecordingSupported,
  startVoiceRecording,
  stopVoiceRecording,
  voiceRecordingErrorCode,
} from './voiceRecording'

describe('voice recording Tauri wrappers', () => {
  beforeEach(() => {
    invoke.mockReset()
    invoke.mockResolvedValue(undefined)
  })

  it('starts without sending any path', async () => {
    await startVoiceRecording()
    expect(invoke).toHaveBeenCalledWith('voice_recording_start', undefined)
  })

  it('stops with camelCase workspace path and label', async () => {
    invoke.mockResolvedValue({ src: '.nevo/assets/a.wav', name: 'R.wav', mime: 'audio/wav', size: 3, durationMs: 1200 })
    const asset = await stopVoiceRecording('/ws', 'Recording')
    expect(invoke).toHaveBeenCalledWith('voice_recording_stop', { workspacePath: '/ws', label: 'Recording' })
    expect(asset.durationMs).toBe(1200)
  })

  it('cancels', async () => {
    await cancelVoiceRecording()
    expect(invoke).toHaveBeenCalledWith('voice_recording_cancel', undefined)
  })

  it.each([
    ['permission_denied', 'permission_denied'],
    ['no_device', 'no_device'],
    ['already_recording', 'already_recording'],
    ['not_recording', 'not_recording'],
    ['unsupported', 'unsupported'],
    ['import_failed: disk full', 'import_failed'],
    ['recording_failed: boom', 'recording_failed'],
    [new Error('weird'), 'recording_failed'],
  ])('maps %s to %s', (error, code) => {
    expect(voiceRecordingErrorCode(error)).toBe(code)
  })

  it('reports support by platform', () => {
    document.documentElement.dataset.platform = 'android'
    expect(isVoiceRecordingSupported()).toBe(false)
    document.documentElement.dataset.platform = 'linux'
    expect(isVoiceRecordingSupported()).toBe(true)
    delete document.documentElement.dataset.platform
  })

  it('logs and rethrows command failures', async () => {
    invoke.mockRejectedValue('permission_denied')
    await expect(startVoiceRecording()).rejects.toBe('permission_denied')
  })
})
