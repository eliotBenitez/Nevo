const REVOKED_SANDBOX_GLOBALS = [
  'BroadcastChannel',
  'EventSource',
  'Notification',
  'RTCPeerConnection',
  'SharedWorker',
  'WebSocketStream',
  'WebSocket',
  'WebTransport',
  'Worker',
  'XMLHttpRequest',
  'caches',
  'cookieStore',
  'fetch',
  'importScripts',
  'indexedDB',
  'navigator',
  'postMessage',
  'requestAnimationFrame',
  'setInterval',
  'setTimeout',
  'webkitRTCPeerConnection',
] as const

function findPropertyOwner(scope: object, name: string): object {
  let owner: object | null = scope
  while (owner && !Object.prototype.hasOwnProperty.call(owner, name)) {
    owner = Object.getPrototypeOf(owner) as object | null
  }
  return owner ?? scope
}

export function lockDownSandboxGlobals(scope: object): void {
  for (const name of REVOKED_SANDBOX_GLOBALS) {
    const owner = findPropertyOwner(scope, name)
    const descriptor = Object.getOwnPropertyDescriptor(owner, name)
    const revoked = Reflect.defineProperty(owner, name, {
      value: undefined,
      writable: false,
      enumerable: descriptor?.enumerable ?? false,
      configurable: false,
    })
    if (!revoked || Reflect.get(scope, name) !== undefined) {
      throw new Error(`Sandbox could not revoke global ${name}`)
    }
  }
}
