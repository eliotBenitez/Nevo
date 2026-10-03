import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { clearActiveRecording, setActiveRecording } from '../core/voice-recording/activeRecording'
import { useNoteStore } from '../stores/note'
import { useWorkspaceStore } from '../stores/workspace'
import { finalizeRecordingBeforeNavigation, router } from './index'

describe('finalizeRecordingBeforeNavigation', () => {
  beforeEach(() => setActivePinia(createPinia()))

  afterEach(() => {
    clearActiveRecording('voice-recording-test')
    vi.restoreAllMocks()
  })

  it('finalizes an in-progress voice recording', async () => {
    const finalize = vi.fn().mockResolvedValue(undefined)
    setActiveRecording('voice-recording-test', finalize)

    await finalizeRecordingBeforeNavigation()

    expect(finalize).toHaveBeenCalledTimes(1)
  })

  it('is a no-op when no recording is active', async () => {
    await expect(finalizeRecordingBeforeNavigation()).resolves.toBeUndefined()
  })

  it('is registered as a router navigation guard, so a real navigation finalizes it', async () => {
    const finalize = vi.fn().mockResolvedValue(undefined)
    setActiveRecording('voice-recording-test', finalize)

    await router.push('/workspace/settings')

    expect(finalize).toHaveBeenCalledTimes(1)
  })

  it('keeps a notebook route mounted when durable flush reports a pending revision', async () => {
    setActivePinia(createPinia())
    const workspaceStore = useWorkspaceStore()
    workspaceStore.activeHandle = { kind: 'local', path: '/notebook-route-guard' }
    await router.replace('/workspace')
    await router.push('/workspace/note/pending-notebook')
    const noteStore = useNoteStore()
    noteStore.activeNote = {
      id: 'pending-notebook',
      title: 'Pending notebook',
      icon: '📄',
      folderId: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      content: { type: 'doc', content: [{ type: 'paragraph' }] },
      documentKind: 'notebook',
      notebook: { version: 1, pages: [{ id: 'p', width: 595.28, height: 841.89, paper: { kind: 'plain' }, objects: [] }] },
    }
    const flush = vi.spyOn(noteStore, 'flushDurably').mockResolvedValue({ ok: false, error: new Error('pending input') })
    await router.push('/workspace/note/pending-notebook/history')

    expect(flush).toHaveBeenCalledTimes(1)
    expect(router.currentRoute.value.path).toBe('/workspace/note/pending-notebook')
  })
})
