import { describe, expect, it, vi } from 'vitest'
import { registerEditorPersistence, suspendEditorPersistence, getEditorSession } from './editorSessionRegistry'
import type { EditorPersistenceHandle } from './editorSessionRegistry'

function handle(overrides: Partial<EditorPersistenceHandle> = {}): EditorPersistenceHandle {
  return {
    suspend: vi.fn(),
    flushContent: vi.fn(),
    ...overrides,
  }
}

describe('editorSessionRegistry', () => {
  it('suspends the registered handle for a note', () => {
    const suspend = vi.fn()
    registerEditorPersistence('note-1', handle({ suspend }))

    suspendEditorPersistence('note-1')

    expect(suspend).toHaveBeenCalledTimes(1)
  })

  it('is a no-op for a note with no registered editor', () => {
    expect(() => suspendEditorPersistence('unknown-note')).not.toThrow()
  })

  it('a stale unregister does not remove a newer registration for the same id', () => {
    const first = vi.fn()
    const second = vi.fn()
    const unregisterFirst = registerEditorPersistence('note-2', handle({ suspend: first }))
    registerEditorPersistence('note-2', handle({ suspend: second }))

    unregisterFirst()

    suspendEditorPersistence('note-2')
    expect(second).toHaveBeenCalledTimes(1)
    expect(first).not.toHaveBeenCalled()
  })

  it('unregister removes the entry when it is still the current one', () => {
    const suspend = vi.fn()
    const unregister = registerEditorPersistence('note-3', handle({ suspend }))

    unregister()
    suspendEditorPersistence('note-3')

    expect(suspend).not.toHaveBeenCalled()
  })

  describe('getEditorSession', () => {
    it('returns the registered handle for a note', () => {
      const flushContent = vi.fn()
      const session = handle({ flushContent })
      registerEditorPersistence('note-4', session)

      expect(getEditorSession('note-4')).toBe(session)
      getEditorSession('note-4')?.flushContent()
      expect(flushContent).toHaveBeenCalledTimes(1)
    })

    it('returns undefined for a note with no registered editor', () => {
      expect(getEditorSession('unknown-note')).toBeUndefined()
    })

    it('reflects unregistration', () => {
      const unregister = registerEditorPersistence('note-5', handle())
      unregister()

      expect(getEditorSession('note-5')).toBeUndefined()
    })
  })
})
