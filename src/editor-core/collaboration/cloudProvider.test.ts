import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as Y from 'yjs'
import { Awareness } from 'y-protocols/awareness'
import { CloudProvider } from './cloudProvider'
import { encryptBytes, decryptBytes, generateSessionKey } from './encryption'

const MSG_SYNC_DONE = 0x00
const MSG_FULL_STATE = 0x01
const MSG_UPDATE = 0x02

// Minimal WebSocket stand-in: records the URL it was constructed with, captures
// what the provider sends, and lets the test drive open/message/close. jsdom
// has no WebSocket implementation.
class FakeWebSocket {
  static instances: FakeWebSocket[] = []
  static readonly OPEN = 1
  static readonly CLOSED = 3

  readyState = 0
  binaryType = ''
  sent: Uint8Array[] = []
  onopen: (() => void) | null = null
  onclose: (() => void) | null = null
  onerror: (() => void) | null = null
  onmessage: ((event: MessageEvent<ArrayBuffer>) => void) | null = null

  constructor(readonly url: string) {
    FakeWebSocket.instances.push(this)
  }

  send(data: Uint8Array): void { this.sent.push(data) }
  close(): void { this.readyState = FakeWebSocket.CLOSED }

  open(): void {
    this.readyState = FakeWebSocket.OPEN
    this.onopen?.()
  }

  /** Deliver one framed relay message (type byte + payload). */
  deliver(type: number, payload: Uint8Array = new Uint8Array()): void {
    const frame = new Uint8Array(1 + payload.length)
    frame[0] = type
    frame.set(payload, 1)
    this.onmessage?.({ data: frame.buffer } as MessageEvent<ArrayBuffer>)
  }

  /** Simulate the relay rejecting the upgrade (e.g. an expired token). */
  rejectUpgrade(): void {
    this.readyState = FakeWebSocket.CLOSED
    this.onerror?.()
    this.onclose?.()
  }
}

describe('CloudProvider url factory', () => {
  let key: CryptoKey
  let ydoc: Y.Doc
  let awareness: Awareness
  let provider: CloudProvider | null = null

  beforeEach(async () => {
    FakeWebSocket.instances = []
    vi.stubGlobal('WebSocket', FakeWebSocket as unknown as typeof WebSocket)
    vi.useFakeTimers()
    key = await generateSessionKey()
    ydoc = new Y.Doc()
    awareness = new Awareness(ydoc)
  })

  afterEach(() => {
    provider?.destroy()
    provider = null
    awareness.destroy()
    ydoc.destroy()
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('re-resolves the url on every reconnect so an expired token is replaced', async () => {
    let issued = 0
    provider = new CloudProvider({
      ydoc,
      awareness,
      key,
      wsUrl: () => `ws://relay/ws/room?token=token-${++issued}`,
    })

    // The factory is async, so the first socket appears after a microtask flush.
    await vi.waitFor(() => expect(FakeWebSocket.instances).toHaveLength(1))
    expect(FakeWebSocket.instances[0].url).toBe('ws://relay/ws/room?token=token-1')

    FakeWebSocket.instances[0].rejectUpgrade()
    await vi.advanceTimersByTimeAsync(1000)

    await vi.waitFor(() => expect(FakeWebSocket.instances).toHaveLength(2))
    expect(FakeWebSocket.instances[1].url).toBe('ws://relay/ws/room?token=token-2')
  })

  it('retries with backoff when the url factory throws instead of giving up', async () => {
    let attempts = 0
    provider = new CloudProvider({
      ydoc,
      awareness,
      key,
      wsUrl: () => {
        attempts++
        if (attempts === 1) throw new Error('refresh failed')
        return 'ws://relay/ws/room?token=recovered'
      },
    })

    await vi.waitFor(() => expect(attempts).toBe(1))
    expect(FakeWebSocket.instances).toHaveLength(0)
    expect(provider.status).toBe('error')

    await vi.advanceTimersByTimeAsync(1000)
    await vi.waitFor(() => expect(FakeWebSocket.instances).toHaveLength(1))
    expect(FakeWebSocket.instances[0].url).toBe('ws://relay/ws/room?token=recovered')
  })

  it('still accepts a plain string url (legacy anonymous rooms)', async () => {
    provider = new CloudProvider({ ydoc, awareness, key, wsUrl: 'ws://relay/ws/ABC123' })
    await vi.waitFor(() => expect(FakeWebSocket.instances).toHaveLength(1))
    expect(FakeWebSocket.instances[0].url).toBe('ws://relay/ws/ABC123')
  })

  // Regression: a client that could not decrypt part of the relay's history
  // used to push its (incomplete) full state anyway, and the relay replaces its
  // stored state on MSG_FULL_STATE — permanently deleting the unread content.
  describe('sync completion', () => {
    async function connectAndSync(options: { corruptHistory: boolean }) {
      const integrityErrors: number[] = []
      const provider = new CloudProvider({
        ydoc,
        awareness,
        key,
        wsUrl: 'ws://relay/ws/room',
        onIntegrityError: () => integrityErrors.push(1),
      })
      await vi.waitFor(() => expect(FakeWebSocket.instances).toHaveLength(1))
      const socket = FakeWebSocket.instances[0]
      socket.open()

      // One readable update from the relay...
      const peer = new Y.Doc()
      peer.getMap('m').set('fromRelay', true)
      socket.deliver(MSG_UPDATE, await encryptBytes(key, Y.encodeStateAsUpdate(peer)))
      peer.destroy()

      // ...and, in the corrupt case, one this client cannot read.
      if (options.corruptHistory) {
        socket.deliver(MSG_UPDATE, new Uint8Array([9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9]))
      }

      socket.deliver(MSG_SYNC_DONE)
      // Decryption is async, so sync completes a few microtasks later. The
      // socket also carries awareness traffic; callers filter by message type.
      await vi.waitFor(() => expect(['connected', 'degraded']).toContain(provider.status))
      return { provider, socket, integrityErrors }
    }

    it('pushes a compacting full state when the whole history was readable', async () => {
      const { provider, socket } = await connectAndSync({ corruptHistory: false })

      expect(socket.sent.some(msg => msg[0] === MSG_FULL_STATE)).toBe(true)
      expect(provider.status).toBe('connected')
      provider.destroy()
    })

    it('never pushes a full state after a decryption failure', async () => {
      const { provider, socket, integrityErrors } = await connectAndSync({ corruptHistory: true })

      expect(socket.sent.some(msg => msg[0] === MSG_FULL_STATE)).toBe(false)
      expect(provider.status).toBe('degraded')
      expect(integrityErrors).toHaveLength(1)
      provider.destroy()
    })

    it('still delivers local state as an additive update when degraded', async () => {
      // Content authored before the socket synced — the offline-edit case.
      ydoc.getMap('m').set('writtenLocally', 'keep me')

      const { provider, socket } = await connectAndSync({ corruptHistory: true })
      const pushed = socket.sent.find(msg => msg[0] === MSG_UPDATE)
      expect(pushed).toBeDefined()

      const merged = new Y.Doc()
      Y.applyUpdate(merged, await decryptBytes(key, pushed!.slice(1)))
      expect(merged.getMap('m').get('writtenLocally')).toBe('keep me')

      merged.destroy()
      provider.destroy()
    })
  })

  it('does not open a socket when destroyed while the url is resolving', async () => {
    let release: (url: string) => void = () => {}
    provider = new CloudProvider({
      ydoc,
      awareness,
      key,
      wsUrl: () => new Promise<string>((resolve) => { release = resolve }),
    })

    provider.destroy()
    release('ws://relay/ws/room?token=late')
    await vi.advanceTimersByTimeAsync(10)

    expect(FakeWebSocket.instances).toHaveLength(0)
  })
})
