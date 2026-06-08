import type {
  NevoEditorCapability,
  NevoEditorContext,
  NevoEditorEventBus,
  NevoEditorEventMap,
  NevoEditorPluginManifest,
  NevoEditorRegistries,
} from '../../types/editor-plugin'

export function buildPluginContext(
  manifest: NevoEditorPluginManifest,
  storage: Map<string, Map<string, unknown>>,
  registries: NevoEditorRegistries,
  emit: <K extends keyof NevoEditorEventMap>(event: K, payload: NevoEditorEventMap[K]) => void,
  on: <K extends keyof NevoEditorEventMap>(event: K, listener: (payload: NevoEditorEventMap[K]) => void) => () => void,
): NevoEditorContext {
  const ensureCapability = (capability: NevoEditorCapability) => {
    if (!manifest.editorCapabilities.includes(capability)) {
      throw new Error(`Plugin ${manifest.id} requires capability ${capability}`)
    }
  }

  const getStorageBucket = (): Map<string, unknown> => {
    const existing = storage.get(manifest.id)
    if (existing) return existing
    const created = new Map<string, unknown>()
    storage.set(manifest.id, created)
    return created
  }

  const eventBus: NevoEditorEventBus = {
    emit: (event, payload) => { ensureCapability('editor.write'); emit(event, payload) },
    on: (event, listener) => on(event, listener),
  }

  return {
    pluginId: manifest.id,
    capabilities: new Set(manifest.editorCapabilities),
    registerNode: (name, spec) => {
      ensureCapability('editor.write')
      if (registries.nodes.has(name)) throw new Error(`Node already registered: ${name}`)
      registries.nodes.set(name, spec)
    },
    registerMark: (name, spec) => {
      ensureCapability('editor.write')
      if (registries.marks.has(name)) throw new Error(`Mark already registered: ${name}`)
      registries.marks.set(name, spec)
    },
    registerCommand: (id, command) => {
      ensureCapability('editor.write')
      if (registries.commands.has(id)) throw new Error(`Command already registered: ${id}`)
      registries.commands.set(id, command)
    },
    registerKeymap: (priority, bindings) => {
      ensureCapability('editor.write')
      registries.keymaps.push({ priority, bindings, pluginId: manifest.id })
    },
    registerSlashItem: (item) => {
      ensureCapability('editor.write')
      if (registries.slashItems.has(item.id)) throw new Error(`Slash item already registered: ${item.id}`)
      registries.slashItems.set(item.id, item)
    },
    registerNodeView: (nodeName, nodeView) => {
      ensureCapability('editor.write')
      if (registries.nodeViews.has(nodeName)) throw new Error(`NodeView already registered for node: ${nodeName}`)
      registries.nodeViews.set(nodeName, nodeView)
    },
    registerDecorationProvider: (id, provider) => {
      ensureCapability('editor.write')
      if (registries.decorationProviders.has(id)) throw new Error(`Decoration provider already registered: ${id}`)
      registries.decorationProviders.set(id, provider)
    },
    registerToolbarAction: (action) => {
      ensureCapability('editor.write')
      if (registries.toolbarActions.has(action.id)) throw new Error(`Toolbar action already registered: ${action.id}`)
      registries.toolbarActions.set(action.id, action)
    },
    eventBus,
    storage: {
      get: <T>(key: string) => getStorageBucket().get(key) as T | undefined,
      set: (key, value) => { getStorageBucket().set(key, value) },
      delete: (key) => { getStorageBucket().delete(key) },
    },
  }
}
