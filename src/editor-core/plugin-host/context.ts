import type { EditorView } from 'prosemirror-view'
import { NodeSelection, TextSelection } from 'prosemirror-state'
import type {
  NevoEditorCapability,
  NevoEditorContext,
  NevoEditorEventBus,
  NevoEditorEventMap,
  NevoEditorPluginManifest,
  NevoPluginCapability,
  NevoEditorRegistries,
  NevoUiCapability,
} from '../../types/editor-plugin'
import { makeBlockNodeView } from './blockNodeView'
import { assertWorkspaceCommandCapability } from './capabilities'

export function buildPluginContext(
  manifest: NevoEditorPluginManifest,
  storage: Map<string, Map<string, unknown>>,
  registries: NevoEditorRegistries,
  emit: <K extends keyof NevoEditorEventMap>(event: K, payload: NevoEditorEventMap[K]) => void,
  on: <K extends keyof NevoEditorEventMap>(event: K, listener: (payload: NevoEditorEventMap[K]) => void) => () => void,
  requestNodeEdit: (view: EditorView, position: number, anchorRect?: DOMRect) => void,
  runtime: {
    invoke?: <T = unknown>(commandId: string, args?: Record<string, unknown>) => Promise<T>
    openRoute?: (route: string) => void
    backToWorkspace?: () => void
    t?: (key: string, params?: Record<string, unknown>) => string
    getPluginSetting?: <T = unknown>(pluginId: string, key: string) => T | undefined
    setPluginSetting?: (pluginId: string, key: string, value: unknown) => void
  } = {},
): NevoEditorContext {
  const ensureCapability = (capability: NevoEditorCapability) => {
    if (!manifest.editorCapabilities.includes(capability)) {
      throw new Error(`Plugin ${manifest.id} requires capability ${capability}`)
    }
  }
  const ensureUiCapability = (capability: NevoUiCapability) => {
    if (!(manifest.uiCapabilities ?? []).includes(capability)) {
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

  const context: NevoEditorContext = {
    pluginId: manifest.id,
    capabilities: new Set<NevoPluginCapability>([
      ...manifest.editorCapabilities,
      ...(manifest.uiCapabilities ?? []),
      ...(manifest.workspaceCapabilities ?? []),
    ]),
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
    registerWorkspaceView: (view) => {
      ensureUiCapability('workspace.view.register')
      if (registries.workspaceViews.has(view.id)) throw new Error(`Workspace view already registered: ${view.id}`)
      registries.workspaceViews.set(view.id, { ...view, pluginId: manifest.id })
    },
    registerSidebarItem: (item) => {
      ensureUiCapability('workspace.view.register')
      if (registries.sidebarItems.has(item.id)) throw new Error(`Sidebar item already registered: ${item.id}`)
      registries.sidebarItems.set(item.id, { ...item, pluginId: manifest.id })
    },
    registerModal: (modal) => {
      ensureUiCapability('workspace.view.register')
      if (registries.modals.has(modal.id)) throw new Error(`Modal already registered: ${modal.id}`)
      registries.modals.set(modal.id, { ...modal, pluginId: manifest.id })
    },
    registerNodeView: (nodeName, nodeView) => {
      ensureCapability('editor.write')
      if (registries.nodeViews.has(nodeName)) throw new Error(`NodeView already registered for node: ${nodeName}`)
      registries.nodeViews.set(nodeName, nodeView)
    },
    registerDecorationProvider: (id, provider, options) => {
      ensureCapability('editor.write')
      if (registries.decorationProviders.has(id)) throw new Error(`Decoration provider already registered: ${id}`)
      registries.decorationProviders.set(id, { provider, dependsOnSelection: options?.dependsOnSelection ?? false })
    },
    registerToolbarAction: (action) => {
      ensureCapability('editor.write')
      if (registries.toolbarActions.has(action.id)) throw new Error(`Toolbar action already registered: ${action.id}`)
      registries.toolbarActions.set(action.id, action)
    },
    registerNodeSerializer: (nodeName, serializer) => {
      ensureCapability('editor.write')
      if (registries.nodeSerializers.has(nodeName)) throw new Error(`Node serializer already registered: ${nodeName}`)
      registries.nodeSerializers.set(nodeName, serializer)
    },
    registerNodeImporter: (importer) => {
      ensureCapability('editor.write')
      if (registries.nodeImporters.has(importer.fencedLang)) throw new Error(`Node importer already registered for lang: ${importer.fencedLang}`)
      registries.nodeImporters.set(importer.fencedLang, importer)
    },
    registerNodePopover: (nodeName, config) => {
      ensureCapability('editor.write')
      if (registries.nodePopovers.has(nodeName)) throw new Error(`Node popover already registered: ${nodeName}`)
      registries.nodePopovers.set(nodeName, config)
    },
    requestNodeEdit: (view, position, anchorRect) => {
      requestNodeEdit(view, position, anchorRect)
    },
    registerBlockType: (config) => {
      ensureCapability('editor.write')
      context.registerNode(config.name, config.schema)
      context.registerNodeView(config.name, makeBlockNodeView(config, context))
      if (config.popover) context.registerNodePopover(config.name, config.popover)
      if (config.serialize) context.registerNodeSerializer(config.name, config.serialize)
      if (config.importer) context.registerNodeImporter(config.importer)
      if (config.slashItem) {
        const { defaultAttrs, ...slashRest } = config.slashItem
        context.registerSlashItem({
          ...slashRest,
          run: ({ state, dispatch }) => {
            const nodeType = state.schema.nodes[config.name]
            if (!nodeType) return
            const node = nodeType.createAndFill(defaultAttrs ?? null) ?? nodeType.create(defaultAttrs ?? null)
            let tr = state.tr.replaceSelectionWith(node, false)
            const insertPos = tr.mapping.map(state.selection.from)
            if (node.isLeaf) {
              tr = tr.setSelection(NodeSelection.create(tr.doc, insertPos))
            } else {
              const inside = Math.min(insertPos + 1, tr.doc.content.size)
              tr = tr.setSelection(TextSelection.create(tr.doc, inside))
            }
            dispatch(tr.scrollIntoView())
          },
        })
      }
    },
    eventBus,
    storage: {
      get: <T>(key: string) => getStorageBucket().get(key) as T | undefined,
      set: (key, value) => { getStorageBucket().set(key, value) },
      delete: (key) => { getStorageBucket().delete(key) },
    },
    settings: {
      get: <T = unknown>(key: string) => runtime.getPluginSetting?.<T>(manifest.id, key),
      set: (key, value) => { runtime.setPluginSetting?.(manifest.id, key, value) },
    },
    workspace: {
      invoke: async <T = unknown>(commandId: string, args?: Record<string, unknown>) => {
        assertWorkspaceCommandCapability(manifest, commandId)
        if (!runtime.invoke) throw new Error('Workspace invoke runtime is not available')
        return runtime.invoke<T>(commandId, args)
      },
    },
    navigation: {
      open: (route) => {
        ensureUiCapability('workspace.navigation')
        runtime.openRoute?.(route)
      },
      backToWorkspace: () => {
        ensureUiCapability('workspace.navigation')
        runtime.backToWorkspace?.()
      },
    },
    i18n: {
      t: (key, params) => runtime.t?.(key, params) ?? key,
    },
  }

  return context
}
