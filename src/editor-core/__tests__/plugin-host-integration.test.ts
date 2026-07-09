import { describe, expect, it, vi } from 'vitest'
import { TextSelection } from 'prosemirror-state'
import { EditorPluginHost } from '../plugin-host'
import { buildPluginContext } from '../plugin-host/context'
import { validateManifest } from '../plugin-host/utils'
import { createNevoEditorState } from '../state'
import { nevoBaseSchema } from '../schema'
import type { NevoEditorPluginManifest, NevoEditorRegistries } from '../../types/editor-plugin'
import type { BlockNode } from '../../types/note'

const emptyContent: BlockNode = {
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text: 'plugin test' }] }],
}

function manifest(patch: Partial<NevoEditorPluginManifest> = {}): NevoEditorPluginManifest {
  return {
    id: 'plugin.test',
    name: 'Plugin Test',
    version: '1.0.0',
    enabled: true,
    entryPoint: 'index.js',
    apiVersion: '1.0.0',
    editorCapabilities: ['editor.write'],
    uiCapabilities: [],
    workspaceCapabilities: [],
    ...patch,
  }
}

function registries(): NevoEditorRegistries {
  return {
    commands: new Map(),
    keymaps: [],
    slashItems: new Map(),
    workspaceViews: new Map(),
    sidebarItems: new Map(),
    modals: new Map(),
    toolbarActions: new Map(),
    nodeViews: new Map(),
    decorationProviders: new Map(),
    nodes: new Map(),
    marks: new Map(),
    nodeSerializers: new Map(),
    nodeImporters: new Map(),
    nodePopovers: new Map(),
    extraPlugins: [],
  }
}

describe('plugin host integration', () => {
  it('keeps core command priority over plugin command id collisions', () => {
    const host = new EditorPluginHost({
      workspacePath: null,
      manifests: [],
      nevoVersion: '1.0.0',
    })

    const pluginBold = vi.fn(() => false)
    host.registries.commands.set('core.bold', pluginBold)

    const setup = createNevoEditorState({
      schema: nevoBaseSchema,
      content: emptyContent,
      pluginHost: host,
    })

    let state = setup.state.apply(setup.state.tr.setSelection(TextSelection.create(setup.state.doc, 2, 8)))
    const boldCommand = setup.commands.get('core.bold')

    const applied = boldCommand?.(state, (transaction) => {
      state = state.apply(transaction)
    })

    expect(applied).toBe(true)
    expect(pluginBold).not.toHaveBeenCalled()
    const strong = state.schema.marks.strong
    expect(strong ? state.doc.rangeHasMark(2, 8, strong) : false).toBe(true)
  })

  it('orders keymaps by priority desc and plugin id asc', () => {
    const host = new EditorPluginHost({
      workspacePath: null,
      manifests: [],
      nevoVersion: '1.0.0',
    })

    host.registries.keymaps.push({ priority: 10, bindings: {}, pluginId: 'zeta' })
    host.registries.keymaps.push({ priority: 20, bindings: {}, pluginId: 'beta' })
    host.registries.keymaps.push({ priority: 20, bindings: {}, pluginId: 'alpha' })

    const ordered = host.getOrderedKeymaps()
    expect(ordered.map((entry) => entry.pluginId)).toEqual(['alpha', 'beta', 'zeta'])
  })

  it('merges core and plugin slash items', () => {
    const host = new EditorPluginHost({
      workspacePath: null,
      manifests: [],
      nevoVersion: '1.0.0',
    })

    host.registries.slashItems.set('plugin.custom', {
      id: 'plugin.custom',
      title: 'Plugin Action',
      run: () => {},
    })

    const setup = createNevoEditorState({
      schema: nevoBaseSchema,
      content: emptyContent,
      pluginHost: host,
    })

    const ids = setup.slashItems.map((item) => item.id)
    expect(ids).toContain('h1')
    expect(ids).toContain('plugin.custom')
  })

  it('rejects unknown UI and workspace capabilities', () => {
    expect(() => validateManifest(manifest({
      uiCapabilities: ['workspace.unknown' as never],
    }), '1.0.0')).toThrow('Unknown UI capability')
    expect(() => validateManifest(manifest({
      workspaceCapabilities: ['kanban.admin' as never],
    }), '1.0.0')).toThrow('Unknown workspace capability')
  })

  it('registers workspace UI only with workspace.view.register capability', () => {
    const registry = registries()
    const ctx = buildPluginContext(
      manifest({ uiCapabilities: ['workspace.view.register'] }),
      new Map(),
      registry,
      () => {},
      () => () => {},
      () => {},
    )

    ctx.registerWorkspaceView({ id: 'view', title: 'View', route: '/workspace/plugin/test', component: 'TestView' })
    ctx.registerSidebarItem({ id: 'side', title: 'Side', route: '/workspace/plugin/test' })
    ctx.registerModal({ id: 'modal', component: 'TestModal' })

    expect(registry.workspaceViews.get('view')?.pluginId).toBe('plugin.test')
    expect(registry.sidebarItems.get('side')?.pluginId).toBe('plugin.test')
    expect(registry.modals.get('modal')?.pluginId).toBe('plugin.test')
  })

  it('allows workspace.invoke only for commands covered by granular capabilities', async () => {
    const invoke = vi.fn(async () => ['board'])
    const runtimeInvoke = invoke as unknown as <T = unknown>(
      commandId: string,
      args?: Record<string, unknown>,
    ) => Promise<T>
    const ctx = buildPluginContext(
      manifest({ workspaceCapabilities: ['kanban.read'] }),
      new Map(),
      registries(),
      () => {},
      () => () => {},
      () => {},
      { invoke: runtimeInvoke },
    )

    await expect(ctx.workspace.invoke('kanban_list_boards')).resolves.toEqual(['board'])
    await expect(ctx.workspace.invoke('kanban_create_board')).rejects.toThrow('kanban.write')
    await expect(ctx.workspace.invoke('unknown_command')).rejects.toThrow('not exposed')
  })
})
