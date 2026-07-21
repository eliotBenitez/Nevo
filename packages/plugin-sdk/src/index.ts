export * from './protocol'

import { PLUGIN_PROTOCOL_VERSION } from './protocol'
import type {
  JsonObject,
  JsonValue,
  PluginCapability,
  PluginContribution,
  PluginContributionKind,
  PluginEditorSnapshot,
  PluginHandlerResult,
} from './protocol'

export interface PluginNetworkPolicy {
  hosts: string[]
  methods: Array<'GET' | 'HEAD' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'>
}

export interface PluginMigrationInput {
  fromDataVersion: number
  storage: JsonObject
  nodes: JsonObject[]
}

export interface PluginMigrationResult {
  dataVersion: number
  storage: JsonObject
  nodes: JsonObject[]
}

export type PluginHandler<TInput extends JsonValue | null = JsonValue | null> = (
  input: TInput,
  context: { editor?: PluginEditorSnapshot; signal: AbortSignal },
) => PluginHandlerResult | Promise<PluginHandlerResult>

export interface PluginRegistrationDescriptor {
  id: string
  [key: string]: JsonValue
}

export interface PluginSetupApi {
  readonly pluginId: string
  readonly capabilities: ReadonlySet<PluginCapability>
  register(
    kind: PluginContributionKind,
    descriptor: PluginRegistrationDescriptor,
    handler?: PluginHandler,
  ): string | undefined
  command(descriptor: PluginRegistrationDescriptor, handler: PluginHandler): string
  keymap(descriptor: PluginRegistrationDescriptor, handler: PluginHandler): string
  slashItem(descriptor: PluginRegistrationDescriptor, handler: PluginHandler): string
  toolbarAction(descriptor: PluginRegistrationDescriptor, handler: PluginHandler): string
  schemaNode(descriptor: PluginRegistrationDescriptor): void
  schemaMark(descriptor: PluginRegistrationDescriptor): void
  blockType(descriptor: PluginRegistrationDescriptor, handler?: PluginHandler): string | undefined
  serializer(descriptor: PluginRegistrationDescriptor, handler: PluginHandler): string
  importer(descriptor: PluginRegistrationDescriptor, handler: PluginHandler): string
  workspaceView(descriptor: PluginRegistrationDescriptor, handler?: PluginHandler): string | undefined
  sidebarItem(descriptor: PluginRegistrationDescriptor, handler?: PluginHandler): string | undefined
  modal(descriptor: PluginRegistrationDescriptor, handler?: PluginHandler): string | undefined
  onEditorEvent(descriptor: PluginRegistrationDescriptor, handler: PluginHandler): string
  scheduling: {
    setTimeout(handler: PluginHandler, delayMs: number): Promise<string>
    setInterval(handler: PluginHandler, intervalMs: number): Promise<string>
    clear(scheduleId: string): Promise<void>
  }
  storage: {
    workspace: PluginStorage
    local: PluginStorage
  }
  settings: {
    get<T extends JsonValue = JsonValue>(key: string): Promise<T | null>
    set(key: string, value: JsonValue): Promise<void>
  }
  secrets: {
    get(key: string): Promise<string | null>
  }
  assets: {
    /** Store a base64 payload (≤512 KiB). Returns the content-addressed asset id. */
    write(dataBase64: string): Promise<string>
    /**
     * Store a base64 payload of any supported size (≤8 MiB), chunking large
     * binaries transparently. Returns the content-addressed asset id.
     */
    upload(dataBase64: string): Promise<string>
    /** Read a stored asset back as base64, or null when it is absent. */
    read(assetId: string): Promise<string | null>
    /** Remove a stored asset. */
    delete(assetId: string): Promise<void>
    /**
     * Mint a stable `nevoplugin-asset://` URL for an image asset, usable as an
     * `<img src>` inside a Tier 2 block frame. Requires `assets.read`.
     */
    url(assetId: string): Promise<string>
  }
  network: {
    fetch(request: {
      url: string
      method?: string
      headers?: Record<string, string>
      bodyBase64?: string
    }): Promise<{
      status: number
      headers: Record<string, string>
      bodyBase64: string
    }>
  }
  workspace: {
    invoke<T extends JsonValue = JsonValue>(
      commandId: string,
      args?: JsonObject,
    ): Promise<T>
  }
}

export interface PluginStorage {
  get<T extends JsonValue = JsonValue>(key: string): Promise<T | null>
  set(key: string, value: JsonValue): Promise<void>
  delete(key: string): Promise<void>
}

export interface NevoPluginDefinition {
  setup(api: PluginSetupApi): void | PluginContribution[] | Promise<void | PluginContribution[]>
  activate?(): void | Promise<void>
  deactivate?(): void | Promise<void>
  dispose?(): void | Promise<void>
  migrations?: Record<number, (input: PluginMigrationInput) => PluginMigrationResult | Promise<PluginMigrationResult>>
}

export function definePlugin(definition: NevoPluginDefinition): NevoPluginDefinition {
  return Object.freeze(definition)
}

export const ui = {
  element(
    tag: string,
    props: JsonObject = {},
    children: JsonValue[] = [],
  ): JsonObject {
    return { type: 'element', tag, props, children }
  },
  text(value: string): JsonObject {
    return { type: 'text', value }
  },
  attr(name: string): JsonObject {
    return { type: 'text', bind: `attrs.${name}` }
  },
  contentSlot(): JsonObject {
    return { type: 'contentSlot' }
  },
}

export const operations = {
  insertText(text: string): JsonObject {
    return { type: 'insertText', text }
  },
  insertNode(nodeType: string, attrs: JsonObject = {}): JsonObject {
    return { type: 'insertNode', nodeType, attrs }
  },
  setNodeAttrs(position: number | 'selection.from' | 'selection.to', attrs: JsonObject): JsonObject {
    return { type: 'setNodeAttrs', position, attrs }
  },
}

export interface BlockViewContext {
  attrs: JsonObject
  editable: boolean
  theme: string
  locale: string
}

export interface BlockViewApi {
  /** Subscribe to the node's attrs / theme / locale, delivered on load and on change. */
  onNode(listener: (context: BlockViewContext) => void): void
  /** Propose a node-scoped attr patch. Applied by the host only with `editor.write.self`. */
  patchAttrs(attrs: JsonObject): void
  /** Delegate privileged logic to the plugin's Worker handler. */
  invoke<T extends JsonValue = JsonValue>(handlerId: string, input?: JsonValue): Promise<T | null>
}

/**
 * Runtime for the iframe side of a Tier 2 block (`blockType({ frame })`). It runs
 * inside the sandboxed iframe — no host APIs, no network — and talks to the host
 * only through the validated postMessage bridge: it reads the node attrs, proposes
 * patches, and delegates privileged work to the Worker.
 */
export function defineBlockView(setup: (api: BlockViewApi) => void): void {
  const scope = globalThis as unknown as {
    parent?: { postMessage(message: unknown, targetOrigin: string): void }
    addEventListener(type: string, listener: (event: { data: unknown }) => void): void
  }
  const listeners = new Set<(context: BlockViewContext) => void>()
  const pending = new Map<string, {
    resolve: (value: JsonValue | null) => void
    reject: (reason: Error) => void
  }>()
  let sequence = 0

  const post = (message: Record<string, unknown>): void => {
    scope.parent?.postMessage({ protocolVersion: PLUGIN_PROTOCOL_VERSION, ...message }, '*')
  }

  scope.addEventListener('message', (event: { data: unknown }) => {
    const message = event.data as Record<string, unknown> | null
    if (!message || typeof message !== 'object' || message.protocolVersion !== PLUGIN_PROTOCOL_VERSION) return
    if (message.type === 'node') {
      const context: BlockViewContext = {
        attrs: (message.attrs as JsonObject) ?? {},
        editable: message.editable === true,
        theme: typeof message.theme === 'string' ? message.theme : 'light',
        locale: typeof message.locale === 'string' ? message.locale : 'en',
      }
      for (const listener of listeners) listener(context)
      return
    }
    if (message.type === 'invokeResult') {
      const payload = message.payload as {
        requestId?: string
        ok?: boolean
        result?: JsonValue
        error?: string
      } | null
      if (!payload || typeof payload.requestId !== 'string') return
      const entry = pending.get(payload.requestId)
      if (!entry) return
      pending.delete(payload.requestId)
      if (payload.ok) entry.resolve(payload.result ?? null)
      else entry.reject(new Error(payload.error ?? 'Plugin block invoke failed'))
    }
  })

  setup({
    onNode(listener) {
      listeners.add(listener)
    },
    patchAttrs(attrs) {
      post({ type: 'patch', payload: { attrs } })
    },
    invoke<T extends JsonValue = JsonValue>(handlerId: string, input: JsonValue = null): Promise<T | null> {
      const requestId = `bv-${++sequence}`
      post({ type: 'invoke', payload: { requestId, handlerId, input } })
      return new Promise<JsonValue | null>((resolve, reject) => {
        pending.set(requestId, { resolve, reject })
      }) as Promise<T | null>
    },
  })
  post({ type: 'ready' })
}
