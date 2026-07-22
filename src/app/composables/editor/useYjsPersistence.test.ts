import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type * as Y from 'yjs'
import { createYjsPersistence } from './useYjsPersistence'
import { collabCommands } from '../../../tauri/commands'

vi.mock('../../../tauri/commands', () => ({
  collabCommands: { saveYjsState: vi.fn().mockResolvedValue(undefined) },
}))
vi.mock('../../../editor-core/collaboration', () => ({
  encodeYDocState: () => new Uint8Array([1, 2, 3]),
}))

const saveYjsState = vi.mocked(collabCommands.saveYjsState)

interface FakeYdoc {
  on: (event: string, handler: () => void) => void
  off: (event: string, handler: () => void) => void
  emitUpdate: () => void
  handlerCount: () => number
}

function fakeYdoc(): FakeYdoc {
  const handlers = new Set<() => void>()
  return {
    on: (_event, handler) => handlers.add(handler),
    off: (_event, handler) => handlers.delete(handler),
    emitUpdate: () => handlers.forEach((handler) => handler()),
    handlerCount: () => handlers.size,
  }
}

describe('createYjsPersistence', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    saveYjsState.mockClear()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('debounces and coalesces saves after Y.Doc updates', () => {
    const persistence = createYjsPersistence()
    const ydoc = fakeYdoc()
    persistence.attach(ydoc as unknown as Y.Doc, '/ws', 'note-1', () => true)

    ydoc.emitUpdate()
    ydoc.emitUpdate()
    expect(saveYjsState).not.toHaveBeenCalled()

    vi.advanceTimersByTime(2000)
    expect(saveYjsState).toHaveBeenCalledTimes(1)
    expect(saveYjsState).toHaveBeenCalledWith('/ws', 'note-1', new Uint8Array([1, 2, 3]))
  })

  it('flushes a pending save and detaches the handler on teardown', () => {
    const persistence = createYjsPersistence()
    const ydoc = fakeYdoc()
    persistence.attach(ydoc as unknown as Y.Doc, '/ws', 'note-1', () => true)

    ydoc.emitUpdate()
    persistence.teardown()

    // The pending edit is written immediately instead of being dropped with the
    // cancelled timer.
    expect(saveYjsState).toHaveBeenCalledTimes(1)
    expect(ydoc.handlerCount()).toBe(0)

    // No further writes after teardown even once the old debounce window elapses.
    vi.advanceTimersByTime(2000)
    expect(saveYjsState).toHaveBeenCalledTimes(1)
  })

  it('does not write a redundant save on teardown when nothing is pending', () => {
    const persistence = createYjsPersistence()
    const ydoc = fakeYdoc()
    persistence.attach(ydoc as unknown as Y.Doc, '/ws', 'note-1', () => true)

    persistence.teardown()
    expect(saveYjsState).not.toHaveBeenCalled()
  })

  it('skips the write when the doc is no longer current', () => {
    const persistence = createYjsPersistence()
    const ydoc = fakeYdoc()
    persistence.attach(ydoc as unknown as Y.Doc, '/ws', 'note-1', () => false)

    ydoc.emitUpdate()
    vi.advanceTimersByTime(2000)
    expect(saveYjsState).not.toHaveBeenCalled()
  })

  it('flushNow persists immediately and clears the pending timer', async () => {
    const persistence = createYjsPersistence()
    const ydoc = fakeYdoc()
    persistence.attach(ydoc as unknown as Y.Doc, '/ws', 'note-1', () => true)

    ydoc.emitUpdate()
    await persistence.flushNow()
    expect(saveYjsState).toHaveBeenCalledTimes(1)

    // The armed timer was cancelled, so it does not fire a second write.
    vi.advanceTimersByTime(2000)
    expect(saveYjsState).toHaveBeenCalledTimes(1)
  })
})
