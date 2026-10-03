import { afterEach, describe, expect, it, vi } from 'vitest'
import { EditorPluginHost } from '../plugin-host'
import * as sandbox from '../plugin-host/sandbox'
import type { NevoEditorPluginManifest, NevoEditorPluginModule } from '../../types/editor-plugin'

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>(done => { resolve = done })
  return { promise, resolve }
}

function manifest(id: string, priority = 0): NevoEditorPluginManifest {
  return {
    id,
    name: id,
    version: '1.0.0',
    enabled: true,
    entryPoint: 'index.js',
    apiVersion: '2.0.0',
    executionMode: 'sandboxed-worker',
    capabilities: ['editor.write'],
    editorCapabilities: [],
    uiCapabilities: [],
    workspaceCapabilities: [],
    priority,
  }
}

function createHost(manifests: NevoEditorPluginManifest[], activate: (id: string) => Promise<void>) {
  const registered: string[] = []
  vi.spyOn(sandbox, 'loadSandboxedPluginDefinition').mockImplementation(async plugin => {
    registered.push(plugin.id)
    return {
      definition: { contributions: [{
        kind: 'slashItem',
        id: `${plugin.id}.action`,
        descriptor: { title: plugin.id },
      }] },
      session: {
        activate: () => activate(plugin.id),
        dispose: async () => {},
      } as unknown as sandbox.SandboxedPluginSession,
    }
  })
  const host = new EditorPluginHost({ workspacePath: '/workspace', manifests, nevoVersion: '1.0.0' })
  return { host, registered }
}

vi.mock('../../utils/workspaceAssetUrl', () => ({
  workspaceAssetUrl: (path: string) => `nevoasset://${path}`,
}))

afterEach(() => vi.restoreAllMocks())

describe('plugin host startup', () => {
  it('overlaps sandbox activation only after ordered registration and waits for every activation', async () => {
    const slow = deferred()
    const fast = deferred()
    const started: string[] = []
    const { host, registered } = createHost([
      manifest('plugin.zeta'),
      manifest('plugin.beta', 10),
      manifest('plugin.alpha', 10),
      { ...manifest('plugin.disabled', 100), enabled: false },
    ], async id => {
      expect(registered).toEqual(['plugin.alpha', 'plugin.beta', 'plugin.zeta'])
      started.push(id)
      await (id === 'plugin.alpha' ? slow.promise : fast.promise)
    })
    const finished = vi.fn()
    const initializing = host.initialize().then(finished)
    try {
      await vi.waitFor(() => expect(started).toEqual(['plugin.alpha', 'plugin.beta', 'plugin.zeta']))
      expect(host.listSlashItems().map(item => item.id)).toEqual([
        'plugin.alpha.action', 'plugin.beta.action', 'plugin.zeta.action',
      ])
      fast.resolve()
      await fast.promise
      expect(finished).not.toHaveBeenCalled()
    } finally {
      slow.resolve()
      fast.resolve()
      await initializing
      await host.dispose()
    }
    expect(finished).toHaveBeenCalledOnce()
    expect(host.errors).toEqual([])
  })

  it('runs sandbox activations in parallel and trusted ones sequentially afterwards', async () => {
    const before = deferred()
    const trusted = deferred()
    const started: string[] = []
    const { host } = createHost([
      manifest('plugin.before', 30),
      { ...manifest('plugin.trusted', 20), executionMode: undefined, apiVersion: '1.0.0', editorCapabilities: ['editor.write'] },
      manifest('plugin.after', 10),
    ], async id => {
      started.push(id)
      if (id === 'plugin.before') await before.promise
    })
    const loader = host as unknown as { loadPluginModule: () => Promise<NevoEditorPluginModule> }
    vi.spyOn(loader, 'loadPluginModule').mockResolvedValue({ default: {
      onActivate: async context => {
        started.push('plugin.trusted')
        await trusted.promise
        context.registerSlashItem({ id: 'plugin.trusted.action', title: 'Trusted', run: () => {} })
      },
    } })
    const initializing = host.initialize()
    try {
      await vi.waitFor(() => expect(started).toContain('plugin.before'))
      expect(started).toEqual(['plugin.before', 'plugin.after'])
      before.resolve()
      await vi.waitFor(() => expect(started).toContain('plugin.trusted'))
      trusted.resolve()
      await initializing
      expect(started).toEqual(['plugin.before', 'plugin.after', 'plugin.trusted'])
      expect(host.listSlashItems().map(item => item.id)).toContain('plugin.trusted.action')
      expect(host.errors).toEqual([])
    } finally {
      before.resolve()
      trusted.resolve()
      await initializing
      await host.dispose()
    }
  })

  it('isolates activation failures and still waits for healthy plugins', async () => {
    const healthy = deferred()
    const started: string[] = []
    const { host } = createHost([manifest('plugin.failed'), manifest('plugin.healthy')], async id => {
      started.push(id)
      if (id === 'plugin.failed') throw new Error('activation unavailable')
      await healthy.promise
    })
    const activated: string[] = []
    host.on('pluginActivated', ({ pluginId }) => activated.push(pluginId))
    const initializing = host.initialize()
    try {
      await vi.waitFor(() => expect(started).toHaveLength(2))
      healthy.resolve()
      await initializing
      expect(activated).toEqual(['plugin.healthy'])
      expect(host.errors).toEqual(['Plugin plugin.failed activation failed: activation unavailable'])
    } finally {
      healthy.resolve()
      await initializing
      await host.dispose()
    }
  })
})
