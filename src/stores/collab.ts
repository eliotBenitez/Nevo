import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import type { WebsocketProvider } from 'y-websocket'
import type { Awareness } from 'y-protocols/awareness'
import { collabCommands, type CollabServerInfo } from '../tauri/commands'
import { createWebSocketProvider, destroyWebSocketProvider } from '../editor-core/collaboration/yWebSocket'
import { CloudProvider } from '../editor-core/collaboration/cloudProvider'
import { generateSessionKey, exportKeyBase64, importKeyBase64 } from '../editor-core/collaboration/encryption'
import { initAwarenessUser } from '../editor-core/collaboration/yAwareness'
import { useAuthStore } from './auth'
import { useServerConfigStore } from './serverConfig'
import { useSharedStorageStore } from './sharedStorage'
import type * as Y from 'yjs'

export type CollabConnectionStatus = 'idle' | 'connecting' | 'syncing' | 'connected' | 'disconnected' | 'error'
export type CollabMode = 'local' | 'cloud'

// Override in settings later
const DEFAULT_RELAY_URL = 'http://localhost:8080'

export const useCollabStore = defineStore('collab', () => {
  const serverInfo = ref<CollabServerInfo | null>(null)
  const isServerRunning = computed(() => serverInfo.value !== null)

  const cloudRoomCode = ref<string | null>(null)
  const cloudKeyBase64 = ref<string | null>(null)
  const mode = ref<CollabMode | null>(null)

  const connectionStatus = ref<CollabConnectionStatus>('idle')
  const sessionNoteId = ref<string | null>(null)
  const connectedPeers = ref(0)

  let _localProvider: WebsocketProvider | null = null
  let _cloudProvider: CloudProvider | null = null
  let _awareness: Awareness | null = null

  let _localAwarenessTarget: Awareness | null = null
  let _localAwarenessHandler: (() => void) | null = null
  let _cloudAwarenessTarget: Awareness | null = null
  let _cloudAwarenessHandler: (() => void) | null = null

  // Dependent stores captured synchronously while Pinia is active (resolving
  // them inside an async callback can throw "no active Pinia").
  const authStore = useAuthStore()
  const sharedStore = useSharedStorageStore()
  const serverCfg = useServerConfigStore()

  // --- Local (LAN) session ---

  async function startHosting(noteId: string, ydoc: Y.Doc, awareness: Awareness, port = 4444): Promise<CollabServerInfo> {
    const info = await collabCommands.startServer(port)
    serverInfo.value = info
    mode.value = 'local'
    await _connectLocalProvider(noteId, ydoc, awareness, info.url)
    return info
  }

  async function joinSession(noteId: string, ydoc: Y.Doc, awareness: Awareness, wsUrl: string): Promise<void> {
    mode.value = 'local'
    await _connectLocalProvider(noteId, ydoc, awareness, wsUrl)
  }

  // --- Shared-storage session (authenticated, server-persisted, E2E) ---

  /**
   * Connect a shared-storage document (note or manifest) to the relay. The room
   * code comes from the server; the doc is encrypted with the storage DEK and
   * the connection is authorized with the user's access token.
   */
  async function startStorageDocSession(
    storageId: string, roomCode: string, ydoc: Y.Doc, awareness: Awareness,
  ): Promise<void> {
    const key = await sharedStore.getDekKey(storageId)
    const token = authStore.accessToken ?? ''
    const wsUrl = `${serverCfg.wsBase}/ws/${roomCode}?token=${encodeURIComponent(token)}`

    mode.value = 'cloud'
    cloudRoomCode.value = roomCode
    _connectCloudProvider(roomCode, ydoc, awareness, wsUrl, key, authStore.user?.displayName || 'User')
  }

  // --- Cloud session ---

  async function startCloudSession(
    noteId: string,
    ydoc: Y.Doc,
    awareness: Awareness,
    relayUrl = DEFAULT_RELAY_URL,
  ): Promise<{ code: string; keyBase64: string; shareString: string }> {
    const res = await fetch(`${relayUrl}/api/v1/rooms`, { method: 'POST' })
    if (!res.ok) throw new Error(`Relay error: ${res.status}`)
    const { code } = await res.json() as { code: string }

    const key = await generateSessionKey()
    const keyBase64 = await exportKeyBase64(key)
    cloudRoomCode.value = code
    cloudKeyBase64.value = keyBase64
    mode.value = 'cloud'

    const wsUrl = relayUrl.replace(/^http/, 'ws') + `/ws/${code}`
    _connectCloudProvider(noteId, ydoc, awareness, wsUrl, key)

    return { code, keyBase64, shareString: `${code}#k=${keyBase64}` }
  }

  async function joinCloudSession(
    noteId: string,
    ydoc: Y.Doc,
    awareness: Awareness,
    shareString: string,
    relayUrl = DEFAULT_RELAY_URL,
  ): Promise<void> {
    const sepIdx = shareString.indexOf('#k=')
    if (sepIdx === -1) throw new Error('Invalid share code — expected CODE#k=KEY')
    const code = shareString.slice(0, sepIdx).trim().toUpperCase()
    const keyB64 = shareString.slice(sepIdx + 3).trim()

    const key = await importKeyBase64(keyB64)
    cloudRoomCode.value = code
    cloudKeyBase64.value = keyB64
    mode.value = 'cloud'

    const wsUrl = relayUrl.replace(/^http/, 'ws') + `/ws/${code}`
    _connectCloudProvider(noteId, ydoc, awareness, wsUrl, key)
  }

  async function leaveSession(): Promise<void> {
    _destroyLocalProvider()
    _destroyCloudProvider()
    connectionStatus.value = 'idle'
    sessionNoteId.value = null
    connectedPeers.value = 0
    mode.value = null
    _awareness = null
  }

  async function stopHosting(): Promise<void> {
    await leaveSession()
    if (serverInfo.value) {
      await collabCommands.stopServer()
      serverInfo.value = null
    }
    cloudRoomCode.value = null
    cloudKeyBase64.value = null
  }

  // --- Private helpers ---

  function _destroyLocalProvider(): void {
    if (_localAwarenessTarget && _localAwarenessHandler) {
      _localAwarenessTarget.off('change', _localAwarenessHandler)
    }
    _localAwarenessTarget = null
    _localAwarenessHandler = null
    if (_localProvider) { destroyWebSocketProvider(_localProvider); _localProvider = null }
  }

  function _destroyCloudProvider(): void {
    if (_cloudAwarenessTarget && _cloudAwarenessHandler) {
      _cloudAwarenessTarget.off('change', _cloudAwarenessHandler)
    }
    _cloudAwarenessTarget = null
    _cloudAwarenessHandler = null
    if (_cloudProvider) { _cloudProvider.destroy(); _cloudProvider = null }
  }

  async function _connectLocalProvider(
    noteId: string, ydoc: Y.Doc, awareness: Awareness, wsUrl: string,
  ): Promise<void> {
    _destroyLocalProvider()
    _destroyCloudProvider()
    connectionStatus.value = 'connecting'
    sessionNoteId.value = noteId
    _awareness = awareness
    initAwarenessUser(awareness, 'User')

    _localProvider = createWebSocketProvider({
      ydoc, noteId, wsUrl, awareness,
      onStatusChange: (s) => { connectionStatus.value = s },
    })
    const handler = () => {
      if (_localProvider) connectedPeers.value = _localProvider.awareness.getStates().size
    }
    _localAwarenessTarget = _localProvider.awareness
    _localAwarenessHandler = handler
    _localProvider.awareness.on('change', handler)
  }

  function _connectCloudProvider(
    noteId: string, ydoc: Y.Doc, awareness: Awareness, wsUrl: string, key: CryptoKey,
    userName = 'User',
  ): void {
    _destroyLocalProvider()
    _destroyCloudProvider()
    connectionStatus.value = 'connecting'
    sessionNoteId.value = noteId
    _awareness = awareness
    initAwarenessUser(awareness, userName)

    _cloudProvider = new CloudProvider({
      ydoc, awareness, wsUrl, key,
      onStatusChange: (s) => { connectionStatus.value = s as CollabConnectionStatus },
    })
    const handler = () => { connectedPeers.value = awareness.getStates().size }
    _cloudAwarenessTarget = awareness
    _cloudAwarenessHandler = handler
    awareness.on('change', handler)
  }

  function getProvider(): WebsocketProvider | null { return _localProvider }
  function getAwareness(): Awareness | null { return _awareness }

  return {
    serverInfo,
    isServerRunning,
    cloudRoomCode,
    cloudKeyBase64,
    mode,
    connectionStatus,
    sessionNoteId,
    connectedPeers,
    startHosting,
    joinSession,
    startCloudSession,
    joinCloudSession,
    startStorageDocSession,
    leaveSession,
    stopHosting,
    getProvider,
    getAwareness,
  }
})
