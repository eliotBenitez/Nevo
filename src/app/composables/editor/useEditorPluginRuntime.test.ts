import { afterEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick } from 'vue'
import type { EditorCore } from './useEditorCore'
import { createDefaultWorkspaceSettings } from '../../../utils/workspace-settings'
import { useEditorPluginRuntime } from './useEditorPluginRuntime'

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
      flushYjsPersistenceNow: vi.fn(async () => undefined),
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
    expect(setup.flushYjsPersistenceNow).toHaveBeenCalledOnce()
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
        flushYjsPersistenceNow: vi.fn(async () => undefined),
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
})
