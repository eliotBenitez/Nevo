import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent } from 'vue'
import { mount } from '@vue/test-utils'
import { getEditorSession } from '../../../core/document-session/editorSessionRegistry'
import { useNotebookPersistence } from './useNotebookPersistence'

function mountPersistence(options: Parameters<typeof useNotebookPersistence>[0]) {
  let session!: ReturnType<typeof useNotebookPersistence>
  const wrapper = mount(defineComponent({
    setup() {
      session = useNotebookPersistence(options)
      return () => null
    },
  }))
  return { session, wrapper }
}

describe('useNotebookPersistence', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('registers the live flush handle and does not save on mount', async () => {
    vi.useFakeTimers()
    const flushInput = vi.fn()
    const flushDurably = vi.fn().mockResolvedValue({ ok: true })
    const { session, wrapper } = mountPersistence({
      noteId: 'note-1',
      workspacePath: '/workspace',
      isCurrent: () => true,
      flushInput,
      suspendInput: vi.fn(),
      flushDurably,
      onError: vi.fn(),
    })

    expect(getEditorSession('note-1')?.flushContent).toBeDefined()
    await vi.advanceTimersByTimeAsync(2_500)
    expect(flushDurably).not.toHaveBeenCalled()

    session.markChanged()
    await vi.advanceTimersByTimeAsync(300)
    expect(flushInput).not.toHaveBeenCalled()
    expect(flushDurably).toHaveBeenCalledTimes(1)
    expect(flushDurably).toHaveBeenCalledWith({ flushEditorSession: false })
    await session.flushNow()
    expect(flushInput).toHaveBeenCalledOnce()
    expect(flushDurably).toHaveBeenCalledTimes(2)
    wrapper.unmount()
  })

  it('caps continuous edits at two seconds and suspends pending writes', async () => {
    vi.useFakeTimers()
    const flushDurably = vi.fn().mockResolvedValue({ ok: true })
    const suspendInput = vi.fn()
    const { session, wrapper } = mountPersistence({
      noteId: 'note-2',
      workspacePath: '/workspace',
      isCurrent: () => true,
      flushInput: vi.fn(),
      suspendInput,
      flushDurably,
      onError: vi.fn(),
    })

    session.markChanged()
    for (let elapsed = 0; elapsed < 2_000; elapsed += 250) {
      await vi.advanceTimersByTimeAsync(250)
      if (elapsed < 1_500) session.markChanged()
    }
    expect(flushDurably).toHaveBeenCalledTimes(1)
    wrapper.unmount()

    session.markChanged()
    session.suspend()
    await vi.advanceTimersByTimeAsync(2_500)
    expect(suspendInput).toHaveBeenCalledTimes(1)
    expect(flushDurably).toHaveBeenCalledTimes(1)
  })
})
