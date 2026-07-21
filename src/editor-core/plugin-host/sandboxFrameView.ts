import type { Node as PMNode } from 'prosemirror-model'
import type { EditorView, NodeView } from 'prosemirror-view'
import type { SandboxedPluginSession } from './sandbox'

const FRAME_PROTOCOL_VERSION = '2.0'
const MAX_FRAME_PAYLOAD_BYTES = 256 * 1024
const MAX_FRAME_TYPE_LENGTH = 120
const FRAME_URL_PATTERN = /^nevoplugin:\/\/[a-f0-9]{32}\/[A-Za-z0-9._/-]+$/i

export interface SandboxFrameNodeViewOptions {
  pluginId: string
  nodeName: string
  frameUrl: string
  session: SandboxedPluginSession
  /** True only when the plugin holds `editor.write.self`; a read-only frame renders but cannot patch. */
  editable: boolean
  locale: () => string
  theme: () => 'light' | 'dark'
  /** Host-owned, node-scoped attr write. Returns false when rejected. */
  applyPatch: (view: EditorView, pos: number, patch: Record<string, unknown>) => boolean
  onError: (error: unknown) => void
}

/**
 * NodeView for a Tier 2 interactive block: the plugin's view bundle runs inside a
 * `sandbox="allow-scripts"` iframe loaded from `nevoplugin://`, isolated from the
 * host page and network. The node's attrs are the single source of truth — the
 * iframe receives them (`node` message) and proposes patches (`patch` message),
 * which the host applies as a node-scoped transaction after capability and JSON
 * validation. The iframe never touches the document or host APIs directly; logic
 * that needs capabilities is delegated to the Worker via `invoke`.
 */
export function createSandboxFrameNodeView(
  options: SandboxFrameNodeViewOptions,
): (node: PMNode, view: EditorView, getPos: () => number | undefined) => NodeView {
  if (!FRAME_URL_PATTERN.test(options.frameUrl) || options.frameUrl.includes('..')) {
    throw new Error('Sandbox block frame URL is invalid')
  }
  return (node, view, getPos) => {
    const dom = document.createElement('div')
    dom.className = `nv-plugin-block nv-plugin-block--${options.nodeName}`
    dom.dataset.nevoPluginNode = options.nodeName
    dom.dataset.nevoPlugin = options.pluginId

    const iframe = document.createElement('iframe')
    iframe.className = 'nv-plugin-block__frame'
    iframe.setAttribute('sandbox', 'allow-scripts')
    iframe.setAttribute('referrerpolicy', 'no-referrer')
    iframe.setAttribute('title', options.pluginId)
    iframe.src = options.frameUrl
    dom.append(iframe)

    let currentNode = node
    let lastSentAttrsKey = ''

    const post = (message: Record<string, unknown>): void => {
      iframe.contentWindow?.postMessage(
        { protocolVersion: FRAME_PROTOCOL_VERSION, ...message },
        '*',
      )
    }

    const sendNode = (force = false): void => {
      const key = JSON.stringify(currentNode.attrs)
      if (!force && key === lastSentAttrsKey) return
      lastSentAttrsKey = key
      post({
        type: 'node',
        attrs: currentNode.attrs,
        editable: options.editable,
        theme: options.theme(),
        locale: options.locale(),
      })
    }

    const onMessage = (event: MessageEvent): void => {
      if (event.source !== iframe.contentWindow) return
      const message = event.data as Record<string, unknown> | null
      if (!message || typeof message !== 'object') return
      if (message.protocolVersion !== FRAME_PROTOCOL_VERSION) return
      if (typeof message.type !== 'string' || message.type.length > MAX_FRAME_TYPE_LENGTH) return
      let encoded: string
      try {
        encoded = JSON.stringify(message.payload ?? null)
      } catch {
        return
      }
      if (new TextEncoder().encode(encoded).byteLength > MAX_FRAME_PAYLOAD_BYTES) return

      if (message.type === 'ready') {
        sendNode(true)
        return
      }
      if (message.type === 'patch') {
        const payload = message.payload
        const patch = payload && typeof payload === 'object' && !Array.isArray(payload)
          ? (payload as { attrs?: unknown }).attrs
          : undefined
        if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return
        const pos = getPos()
        if (typeof pos !== 'number') return
        options.applyPatch(view, pos, patch as Record<string, unknown>)
        return
      }
      if (message.type === 'invoke') {
        const payload = message.payload as { requestId?: unknown; handlerId?: unknown; input?: unknown } | null
        if (!payload || typeof payload !== 'object') return
        const requestId = typeof payload.requestId === 'string' ? payload.requestId : ''
        const handlerId = typeof payload.handlerId === 'string' ? payload.handlerId : ''
        if (!requestId || !handlerId) return
        void options.session.invoke(handlerId, payload.input ?? null)
          .then(result => post({
            type: 'invokeResult',
            payload: { requestId, ok: true, result: result ?? null },
          }))
          .catch((error) => {
            options.onError(error)
            post({
              type: 'invokeResult',
              payload: {
                requestId,
                ok: false,
                error: error instanceof Error ? error.message : String(error),
              },
            })
          })
      }
    }

    const onLoad = (): void => sendNode(true)
    globalThis.addEventListener('message', onMessage)
    iframe.addEventListener('load', onLoad)

    return {
      dom,
      update(nextNode) {
        if (nextNode.type.name !== options.nodeName) return false
        currentNode = nextNode
        sendNode()
        return true
      },
      ignoreMutation() {
        return true
      },
      destroy() {
        globalThis.removeEventListener('message', onMessage)
        iframe.removeEventListener('load', onLoad)
      },
    }
  }
}
