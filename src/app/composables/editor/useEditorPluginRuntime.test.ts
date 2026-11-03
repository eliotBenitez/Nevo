import { afterEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick, ref } from 'vue'
import type { EditorCore } from './useEditorCore'
import { createDefaultWorkspaceSettings } from '../../../utils/workspace-settings'
import { useEditorPluginRuntime } from './useEditorPluginRuntime'
import { i18n } from '../../../i18n'

const runtimeGuardMock = vi.hoisted(() => ({
  guard: null as null | { pause: () => Promise<void>; resume: () => Promise<void> },
  unregister: vi.fn(),
}))

vi.mock('../../../core/plugins/marketplaceRuntime', () => ({
  registerMarketplaceRuntimeGuard: vi.fn((guard) => {
    runtimeGuardMock.guard = guard
    return runtimeGuardMock.unregister
  }),
}))

const scopes: ReturnType<typeof effectScope>[] = []

function pluginHost() {
  return {
    getSandboxUiContributions: vi.fn(() => ({
      workspaceViews: [],
      sidebarItems: [],
      modals: [],
    })),
    deactivateAll: vi.fn(async () => undefined),
    dispose: vi.fn(async () => undefined),
    dispatchSandboxUiEvent: vi.fn(),
  }
}

async function flushRuntime() {
  await Promise.resolve()
  await Promise.resolve()
  await nextTick()
}

afterEach(() => {
  while (scopes.length) scopes.pop()?.stop()
  runtimeGuardMock.guard = null
  runtimeGuardMock.unregister.mockClear()
})

describe('useEditorPluginRuntime', () => {
  it('pauses and resumes around a marketplace transaction', async () => {
    const core = { pluginHost: null } as EditorCore
    const hosts = [pluginHost(), pluginHost()]
    const initPluginHost = vi.fn(async () => {
      core.pluginHost = (hosts.shift() ?? null) as EditorCore['pluginHost']
    })
    const setup = {
      initPluginHost,
      destroyEditorView: vi.fn(),
    }
    const reinitializeEditor = vi.fn(async () => undefined)
    const scope = effectScope()
    scopes.push(scope)
    const runtime = scope.run(() => useEditorPluginRuntime({
      core,
      editorSetup: setup,
      getWorkspacePath: () => '/workspace',
      getPluginManifests: () => [],
      getSettings: createDefaultWorkspaceSettings,
      flushPendingContent: vi.fn(),
      unmountNotePreload: vi.fn(),
      unmountBlockHandle: vi.fn(),
      closeEditorUi: vi.fn(),
      reinitializeEditor,
      emitContributions: vi.fn(),
    }))!
    await flushRuntime()
    runtime.startMarketplaceGuard()

    await runtimeGuardMock.guard?.pause()
    expect(runtime.paused.value).toBe(true)
    expect(core.pluginHost).toBeNull()

    await runtimeGuardMock.guard?.resume()
    expect(runtime.paused.value).toBe(false)
    expect(initPluginHost).toHaveBeenCalledTimes(2)
    expect(reinitializeEditor).toHaveBeenCalledTimes(2)
  })

  it('tears down a detached host only once', async () => {
    const host = pluginHost()
    const core = { pluginHost: host } as unknown as EditorCore
    const scope = effectScope()
    scopes.push(scope)
    const runtime = scope.run(() => useEditorPluginRuntime({
      core,
      editorSetup: {
        initPluginHost: vi.fn(async () => undefined),
        destroyEditorView: vi.fn(),
      },
      getWorkspacePath: () => '/workspace',
      getPluginManifests: () => [],
      getSettings: createDefaultWorkspaceSettings,
      flushPendingContent: vi.fn(),
      unmountNotePreload: vi.fn(),
      unmountBlockHandle: vi.fn(),
      closeEditorUi: vi.fn(),
      reinitializeEditor: vi.fn(async () => undefined),
      emitContributions: vi.fn(),
    }))!
    await flushRuntime()
    core.pluginHost = host as unknown as EditorCore['pluginHost']

    await runtime.pause()
    await runtime.pause()
    await runtime.dispose()

    expect(host.deactivateAll).toHaveBeenCalledOnce()
    expect(host.dispose).toHaveBeenCalledOnce()
  })

  it('rebuilds the plugin host when the app locale changes', async () => {
    const original = i18n.global.locale.value
    i18n.global.locale.value = 'en'
    const core = { pluginHost: null } as EditorCore
    const initPluginHost = vi.fn(async () => {
      core.pluginHost = pluginHost() as unknown as EditorCore['pluginHost']
    })
    const scope = effectScope()
    scopes.push(scope)
    scope.run(() => useEditorPluginRuntime({
      core,
      editorSetup: { initPluginHost, destroyEditorView: vi.fn() },
      getWorkspacePath: () => '/workspace',
      getPluginManifests: () => [],
      getSettings: createDefaultWorkspaceSettings,
      flushPendingContent: vi.fn(),
      unmountNotePreload: vi.fn(),
      unmountBlockHandle: vi.fn(),
      closeEditorUi: vi.fn(),
      reinitializeEditor: vi.fn(async () => undefined),
      emitContributions: vi.fn(),
    }))
    try {
      await flushRuntime()
      expect(initPluginHost).toHaveBeenCalledTimes(1)
      i18n.global.locale.value = 'de'
      await flushRuntime()
      expect(initPluginHost).toHaveBeenCalledTimes(2)
    } finally {
      i18n.global.locale.value = original
    }
  })

  it('flushes pending edits before tearing down the editor and rebuilds on a plugin rescan', async () => {
    const core = { pluginHost: null } as EditorCore
    const order: string[] = []
    const revision = ref(0)
    const scope = effectScope()
    scopes.push(scope)
    scope.run(() => useEditorPluginRuntime({
      core,
      editorSetup: {
        initPluginHost: vi.fn(async () => { order.push('init') }),
        destroyEditorView: vi.fn(() => { order.push('destroy') }),
      },
      getWorkspacePath: () => '/workspace',
      getPluginManifests: () => [],
      getPluginRevision: () => revision.value,
      getSettings: createDefaultWorkspaceSettings,
      flushPendingContent: vi.fn(() => { order.push('flush') }),
      unmountNotePreload: vi.fn(),
      unmountBlockHandle: vi.fn(),
      closeEditorUi: vi.fn(),
      reinitializeEditor: vi.fn(async () => undefined),
      emitContributions: vi.fn(),
    }))
    await flushRuntime()
    expect(order).toEqual(['flush', 'init', 'destroy'])
    revision.value += 1
    await flushRuntime()
    expect(order).toEqual(['flush', 'init', 'destroy', 'flush', 'init', 'destroy'])
  })
})
