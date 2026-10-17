import {
  PLUGIN_PROTOCOL_LIMITS,
  type JsonValue,
  type NevoPluginDefinition,
  type PluginCapability,
  type PluginContribution,
  type PluginContributionKind,
  type PluginHandler,
  type PluginRegistrationDescriptor,
  type PluginSetupApi,
  type PluginStorage,
} from './index'

export interface TestPluginHostResult {
  contributions: PluginContribution[]
  invoke(
    handlerId: string,
    input?: JsonValue | null,
    editor?: import('./protocol').PluginEditorSnapshot,
  ): Promise<JsonValue | null>
}

export async function createTestPluginHost(
  pluginId: string,
  definition: NevoPluginDefinition,
  capabilities: PluginCapability[] = [],
): Promise<TestPluginHostResult> {
  const contributions: PluginContribution[] = []
  const handlers = new Map<string, PluginHandler>()
  let sequence = 0
  const register = (
    kind: PluginContributionKind,
    descriptor: PluginRegistrationDescriptor,
    handler?: PluginHandler,
  ) => {
    if (!descriptor.id.startsWith(`${pluginId}.`)) {
      throw new Error(`Contribution id must be namespaced under ${pluginId}`)
    }
    const handlerId = handler ? `h${++sequence}` : undefined
    if (handlerId && handler) handlers.set(handlerId, handler)
    contributions.push({
      kind,
      id: descriptor.id,
      ...(handlerId ? { handlerId } : {}),
      descriptor: descriptor as unknown as Record<string, JsonValue>,
    })
    if (contributions.length > PLUGIN_PROTOCOL_LIMITS.registrations) {
      throw new Error('Plugin registration limit exceeded')
    }
    return handlerId
  }
  const handlerRegistration = (kind: PluginContributionKind) =>
    (descriptor: PluginRegistrationDescriptor, handler: PluginHandler) =>
      register(kind, descriptor, handler) as string
  const optionalRegistration = (kind: PluginContributionKind) =>
    (descriptor: PluginRegistrationDescriptor, handler?: PluginHandler) =>
      register(kind, descriptor, handler)
  const workspaceStorage = new Map<string, JsonValue>()
  const localStorage = new Map<string, JsonValue>()
  const storage = (values: Map<string, JsonValue>): PluginStorage => ({
    async get<T extends JsonValue = JsonValue>(key: string): Promise<T | null> {
      return (values.get(key) as T | undefined) ?? null
    },
    async set(key: string, value: JsonValue) {
      values.set(key, value)
    },
    async delete(key: string) {
      values.delete(key)
    },
  })
  const api: PluginSetupApi = {
    pluginId,
    capabilities: new Set(capabilities),
    register,
    command: handlerRegistration('command'),
    keymap: handlerRegistration('keymap'),
    slashItem: handlerRegistration('slashItem'),
    toolbarAction: handlerRegistration('toolbarAction'),
    schemaNode: descriptor => { register('schemaNode', descriptor) },
    schemaMark: descriptor => { register('schemaMark', descriptor) },
    blockType: optionalRegistration('blockType'),
    serializer: handlerRegistration('serializer'),
    importer: handlerRegistration('importer'),
    workspaceView: optionalRegistration('workspaceView'),
    sidebarItem: optionalRegistration('sidebarItem'),
    modal: optionalRegistration('modal'),
    onEditorEvent: handlerRegistration('editorEvent'),
    scheduling: {
      async setTimeout(handler) {
        const handlerId = `h${++sequence}`
        handlers.set(handlerId, handler)
        return `schedule:${handlerId}`
      },
      async setInterval(handler) {
        const handlerId = `h${++sequence}`
        handlers.set(handlerId, handler)
        return `schedule:${handlerId}`
      },
      async clear() {},
    },
    storage: {
      workspace: storage(workspaceStorage),
      local: storage(localStorage),
    },
    settings: {
      async get() { return null },
      async set() {},
    },
    secrets: {
      async get() { return null },
    },
    assets: {
      async write() {
        throw new Error('Assets are not configured in the test host')
      },
      async upload() {
        throw new Error('Assets are not configured in the test host')
      },
      async read() { return null },
      async delete() {},
      async url() {
        throw new Error('Assets are not configured in the test host')
      },
    },
    network: {
      async fetch() {
        throw new Error('Network is not configured in the test host')
      },
    },
    workspace: {
      async invoke() {
        throw new Error('Workspace commands are not configured in the test host')
      },
    },
  }
  const returned = await definition.setup(api)
  if (returned) contributions.push(...returned)

  return {
    contributions,
    async invoke(handlerId, input = null, editor) {
      const handler = handlers.get(handlerId)
      if (!handler) throw new Error(`Unknown handler: ${handlerId}`)
      return await handler(input, {
        ...(editor ? { editor } : {}),
        signal: new AbortController().signal,
      }) as JsonValue | null
    },
  }
}
