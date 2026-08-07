import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as Y from 'yjs'
import { CloudSession } from './session'
import type { OfflineDocCache } from './offlineCache'
import { generateSessionKey } from '../../../editor-core/collaboration/encryption'

// The session opens a CloudProvider, which needs a WebSocket. These tests are
// about local durability, so the socket never connects — exactly the offline
// case they are meant to cover.
class SilentWebSocket {
  static instances: SilentWebSocket[] = []
  static readonly OPEN = 1
  readyState = 0
  binaryType = ''
  onopen: (() => void) | null = null
  onclose: (() => void) | null = null
  onerror: (() => void) | null = null
  onmessage: ((event: MessageEvent<ArrayBuffer>) => void) | null = null
  constructor(readonly url: string) { SilentWebSocket.instances.push(this) }
  send(): void {}
  close(): void {}
}

function memoryCache(): OfflineDocCache & { entries: Map<string, Uint8Array>; pruned: number[] } {
  const entries = new Map<string, Uint8Array>()
  const pruned: number[] = []
  return {
    entries,
    pruned,
    load: async roomCode => entries.get(roomCode) ?? null,
    save: async (roomCode, bytes) => { entries.set(roomCode, bytes) },
    remove: async (roomCode) => { entries.delete(roomCode) },
    prune: async (maxAgeMs) => { pruned.push(maxAgeMs) },
  }
}

describe('CloudSession offline cache', () => {
  let key: CryptoKey

  beforeEach(async () => {
    SilentWebSocket.instances = []
    vi.stubGlobal('WebSocket', SilentWebSocket as unknown as typeof WebSocket)
    key = await generateSessionKey()
  })

  afterEach(() => {
    // Restore unconditionally: a test that fails before its own cleanup would
    // otherwise leak fake timers into every test after it.
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  /** Lets a fire-and-forget save (the one destroy() starts) settle. */
  const settle = () => new Promise(resolve => setTimeout(resolve, 10))

  function open(cache: OfflineDocCache, roomCode = 'room-1') {
    return new CloudSession({
      roomCode,
      key,
      getToken: async () => 'token',
      wsBase: 'ws://relay',
      cache,
    })
  }

  it('restores the document from cache when the relay is unreachable', async () => {
    const cache = memoryCache()

    const first = open(cache)
    first.ydoc.getMap('m').set('note', 'written offline')
    await first.flushCache()
    first.destroy()

    expect(cache.entries.has('room-1')).toBe(true)

    // A fresh session — as after an app restart, still offline.
    const second = open(cache)
    await second.whenSynced(50)
    expect(second.ydoc.getMap('m').get('note')).toBe('written offline')
    second.destroy()
  })

  it('writes nothing readable to the cache', async () => {
    const cache = memoryCache()
    const session = open(cache)
    session.ydoc.getMap('m').set('secret', 'plaintext-marker')
    await session.flushCache()
    session.destroy()

    const stored = cache.entries.get('room-1')!
    expect(new TextDecoder().decode(stored)).not.toContain('plaintext-marker')
  })

  it('keeps each room in its own cache entry', async () => {
    const cache = memoryCache()
    const a = open(cache, 'room-a')
    a.ydoc.getMap('m').set('which', 'a')
    await a.flushCache()
    a.destroy()

    const b = open(cache, 'room-b')
    await b.whenSynced(50)
    expect(b.ydoc.getMap('m').get('which')).toBeUndefined()
    b.destroy()
    await settle()

    expect([...cache.entries.keys()].sort()).toEqual(['room-a', 'room-b'])
  })

  it('starts empty and drops a cache entry it cannot decrypt', async () => {
    const cache = memoryCache()
    cache.entries.set('room-1', new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]))

    const session = open(cache)
    await session.whenSynced(50)

    expect(session.ydoc.getMap('m').size).toBe(0)
    expect(cache.entries.has('room-1')).toBe(false)
    session.destroy()
  })

  it('debounces cache writes rather than saving on every keystroke', async () => {
    vi.useFakeTimers()
    const cache = memoryCache()
    const saves: number[] = []
    const counting: OfflineDocCache = { ...cache, save: async (r, b) => { saves.push(1); await cache.save(r, b) } }

    const session = open(counting)
    for (let i = 0; i < 5; i++) session.ydoc.getMap('m').set(`k${i}`, i)
    expect(saves).toHaveLength(0)

    await vi.advanceTimersByTimeAsync(1100)
    await vi.waitFor(() => expect(saves).toHaveLength(1))

    session.destroy()
  })

  it('survives a cache that always fails', async () => {
    const failing: OfflineDocCache = {
      load: async () => { throw new Error('quota') },
      save: async () => { throw new Error('quota') },
      remove: async () => { throw new Error('quota') },
      prune: async () => {},
    }

    const session = open(failing)
    session.ydoc.getMap('m').set('note', 'still editable')
    await expect(session.flushCache()).resolves.toBeUndefined()
    await expect(session.whenSynced(50)).resolves.toBeUndefined()
    expect(session.ydoc.getMap('m').get('note')).toBe('still editable')
    session.destroy()
  })

  it('does not hydrate into a session that was destroyed first', async () => {
    const cache = memoryCache()
    const seed = new Y.Doc()
    seed.getMap('m').set('note', 'cached')
    const first = open(cache)
    Y.applyUpdate(first.ydoc, Y.encodeStateAsUpdate(seed))
    await first.flushCache()
    first.destroy()
    seed.destroy()

    const second = open(cache)
    second.destroy() // torn down before hydration resolves
    await settle()
    // No throw from applying an update to a destroyed doc is the assertion.
    expect(cache.entries.has('room-1')).toBe(true)
  })
})
