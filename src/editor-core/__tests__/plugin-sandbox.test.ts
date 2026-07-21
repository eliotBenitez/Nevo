import { describe, expect, it, vi } from 'vitest'
import { EditorState } from 'prosemirror-state'
import type { EditorView } from 'prosemirror-view'
import * as Y from 'yjs'
import { prosemirrorJSONToYDoc, yDocToProsemirrorJSON } from 'y-prosemirror'
import { EditorPluginHost } from '../plugin-host'
import { createSchemaWithPluginExtensions } from '../buildSchema'
import { nevoBaseSchema } from '../schema'
import { SandboxedPluginSession, validateSandboxDefinition } from '../plugin-host/sandbox'
import { lockDownSandboxGlobals } from '../plugin-host/sandboxLockdown'
import {
  SANDBOX_PROTOCOL_VERSION,
  type SandboxWorkerRequest,
  type SandboxWorkerResponse,
} from '../plugin-host/sandboxProtocol'
import {
  applyTransactionIntent,
  validateTransactionIntent,
} from '../plugin-host/sandboxTransactions'
import { sanitizeHostUi, sanitizeScopedCss, schemaNodeFromDescriptor } from '../plugin-host/sandboxUi'
import { validateManifest } from '../plugin-host/utils'
import type {
  NevoEditorPluginManifest,
  NevoSandboxPluginDefinition,
  NevoSlashCommandContext,
} from '../../types/editor-plugin'

vi.mock('../../utils/workspaceAssetUrl', () => ({
  workspaceAssetUrl: (path: string) => `nevoasset://${path}`,
}))

function manifest(patch: Partial<NevoEditorPluginManifest> = {}): NevoEditorPluginManifest {
  return {
    id: 'plugin.sandbox',
    name: 'Sandbox plugin',
    version: '1.0.0',
    enabled: true,
    kind: 'marketplace',
    source: 'marketplace',
    entryPoint: 'index.js',
    apiVersion: '2.0.0',
    executionMode: 'sandboxed-worker',
    dataVersion: 1,
    capabilities: ['editor.write'],
    editorCapabilities: [],
    uiCapabilities: [],
    workspaceCapabilities: [],
    ...patch,
  }
}

function response(
  request: SandboxWorkerRequest,
  result: unknown,
): SandboxWorkerResponse {
  return {
    protocolVersion: SANDBOX_PROTOCOL_VERSION,
    requestId: request.requestId,
    type: 'response',
    ok: true,
    result,
  }
}

class FakeWorker {
  readonly terminate = vi.fn()
  readonly requests: SandboxWorkerRequest[] = []
  private readonly messageListeners = new Set<(event: MessageEvent<SandboxWorkerResponse>) => void>()
  private readonly errorListeners = new Set<(event: ErrorEvent) => void>()
  private readonly messageErrorListeners = new Set<(event: MessageEvent) => void>()

  constructor(
    private readonly responder: (request: SandboxWorkerRequest) => SandboxWorkerResponse | null,
  ) {}

  postMessage(request: SandboxWorkerRequest): void {
    this.requests.push(request)
    queueMicrotask(() => {
      const responseValue = this.responder(request)
      if (!responseValue) return
      const event = new MessageEvent<SandboxWorkerResponse>('message', {
        data: responseValue,
      })
      for (const listener of this.messageListeners) listener(event)
    })
  }

  crash(message = 'boom'): void {
    const event = new ErrorEvent('error', { message })
    for (const listener of this.errorListeners) listener(event)
  }

  addEventListener(type: string, listener: EventListenerOrEventListenerObject): void {
    const callback = listener as EventListener
    if (type === 'message') {
      this.messageListeners.add(callback as (event: MessageEvent<SandboxWorkerResponse>) => void)
    } else if (type === 'error') {
      this.errorListeners.add(callback as (event: ErrorEvent) => void)
    } else if (type === 'messageerror') {
      this.messageErrorListeners.add(callback as (event: MessageEvent) => void)
    }
  }

  removeEventListener(type: string, listener: EventListenerOrEventListenerObject): void {
    const callback = listener as EventListener
    if (type === 'message') {
      this.messageListeners.delete(callback as (event: MessageEvent<SandboxWorkerResponse>) => void)
    } else if (type === 'error') {
      this.errorListeners.delete(callback as (event: ErrorEvent) => void)
    } else if (type === 'messageerror') {
      this.messageErrorListeners.delete(callback as (event: MessageEvent) => void)
    }
  }
}

function definition(): NevoSandboxPluginDefinition {
  return {
    contributions: [{
      kind: 'slashItem',
      id: 'plugin.sandbox.hello',
      handlerId: 'plugin.sandbox:h1',
      descriptor: {
        id: 'plugin.sandbox.hello',
        title: 'Insert hello',
        category: 'text',
      },
    }],
    dataVersion: 1,
  }
}

function editorState(text = ''): EditorState {
  return EditorState.create({
    schema: nevoBaseSchema,
    doc: nevoBaseSchema.node('doc', null, [
      nevoBaseSchema.node('paragraph', null, text ? [nevoBaseSchema.text(text)] : undefined),
    ]),
  })
}

function runContext(state: EditorState, apply: (state: EditorState) => void): NevoSlashCommandContext {
  return {
    view: null as unknown as EditorView,
    state,
    dispatch: transaction => apply(state.apply(transaction)),
  }
}

describe('sandboxed plugin host', () => {
  it('revokes network, nested-worker, storage, timers, and direct host messaging globals', () => {
    const prototype = {
      fetch: vi.fn(),
      postMessage: vi.fn(),
      Worker: class {},
      indexedDB: {},
    }
    const scope = Object.create(prototype) as object

    lockDownSandboxGlobals(scope)

    expect(Reflect.get(scope, 'fetch')).toBeUndefined()
    expect(Reflect.get(scope, 'postMessage')).toBeUndefined()
    expect(Reflect.get(scope, 'Worker')).toBeUndefined()
    expect(Reflect.get(scope, 'indexedDB')).toBeUndefined()
    expect(Reflect.defineProperty(prototype, 'fetch', { value: vi.fn() })).toBe(false)
  })

  it('keeps one Worker alive for setup, lifecycle and invocation', async () => {
    const worker = new FakeWorker(request => {
      if (request.type === 'initialize') return response(request, definition())
      if (request.type === 'invoke') {
        return response(request, {
          type: 'transaction',
          revision: request.invocation.editor?.revision ?? 0,
          operations: [{
            type: 'insertText',
            text: 'hello',
            from: 'selection.from',
            to: 'selection.to',
          }],
        })
      }
      return response(request, null)
    })
    const host = new EditorPluginHost({
      workspacePath: '/workspace',
      manifests: [manifest()],
      nevoVersion: '1.0.0',
      workerFactory: () => worker as unknown as Worker,
    })

    await host.initialize()
    const initialize = worker.requests[0]
    expect(initialize).toMatchObject({
      type: 'initialize',
      pluginId: 'plugin.sandbox',
      capabilities: ['editor.write'],
      protocolVersion: '2.0',
    })
    expect(initialize?.type === 'initialize' ? initialize.pluginUrl : '').toContain(
      'nevoasset://.nevo/plugins/plugin.sandbox/index.js',
    )
    expect(worker.terminate).not.toHaveBeenCalled()

    let state = editorState()
    host.registries.slashItems.get('plugin.sandbox.hello')?.run(
      runContext(state, nextState => { state = nextState }),
    )
    await vi.waitFor(() => expect(state.doc.textContent).toBe('hello'))
    expect(worker.requests.map(item => item.type)).toEqual(['initialize', 'lifecycle', 'invoke'])

    await host.dispose()
    expect(worker.requests[worker.requests.length - 1]?.type).toBe('lifecycle')
    expect(worker.terminate).toHaveBeenCalledOnce()
  })

  it('filters document JSON without editor.read and supplies host time context', async () => {
    const worker = new FakeWorker(request => {
      if (request.type === 'initialize') return response(request, definition())
      if (request.type === 'invoke') {
        expect(request.invocation.editor?.doc).toBeUndefined()
        expect(request.invocation.editor?.now).toMatch(/Z$/)
        expect(request.invocation.editor?.locale).toBe('de')
        expect(request.invocation.editor?.timeZone).toBe('Europe/Berlin')
        return response(request, {
          type: 'transaction',
          revision: request.invocation.editor?.revision ?? 0,
          operations: [],
        })
      }
      return response(request, null)
    })
    const host = new EditorPluginHost({
      workspacePath: '/workspace',
      manifests: [manifest()],
      nevoVersion: '1.0.0',
      workerFactory: () => worker as unknown as Worker,
      runtime: {
        locale: () => 'de',
        timeZone: () => 'Europe/Berlin',
      },
    })
    await host.initialize()
    const state = editorState('secret')
    host.registries.slashItems.get('plugin.sandbox.hello')?.run(
      runContext(state, () => {}),
    )
    await vi.waitFor(() => expect(worker.requests.some(item => item.type === 'invoke')).toBe(true))
  })

  it('denies host broker calls when the matching capability is absent', async () => {
    let invokeRequestId = ''
    const storageGet = vi.fn()
    const worker = new FakeWorker(request => {
      if (request.type === 'initialize') return response(request, definition())
      if (request.type === 'lifecycle') return response(request, null)
      if (request.type === 'invoke') {
        invokeRequestId = request.requestId
        return {
          protocolVersion: SANDBOX_PROTOCOL_VERSION,
          requestId: 'plugin.sandbox:host:1',
          sessionToken: request.sessionToken,
          type: 'hostCall',
          call: { method: 'storage.local.get', args: { key: 'private' } },
        }
      }
      if (request.type === 'hostResponse') {
        return {
          protocolVersion: SANDBOX_PROTOCOL_VERSION,
          requestId: invokeRequestId,
          type: 'response',
          ok: true,
          result: {
            type: 'transaction',
            revision: 0,
            operations: [],
          },
        }
      }
      return null
    })
    const host = new EditorPluginHost({
      workspacePath: '/workspace',
      manifests: [manifest()],
      nevoVersion: '1.0.0',
      workerFactory: () => worker as unknown as Worker,
      runtime: { pluginStorageGet: storageGet },
    })
    await host.initialize()
    const state = editorState()
    host.registries.slashItems.get('plugin.sandbox.hello')?.run(
      runContext(state, () => {}),
    )

    await vi.waitFor(() => {
      const hostResponse = worker.requests.find(item => item.type === 'hostResponse')
      expect(hostResponse).toMatchObject({
        type: 'hostResponse',
        ok: false,
        error: { message: expect.stringContaining('requires capability storage.local') },
      })
    })
    expect(storageGet).not.toHaveBeenCalled()
  })

  it('brokers assets.write to the runtime when the capability is granted', async () => {
    let invokeRequestId = ''
    const assetWrite = vi.fn().mockResolvedValue('c0ffee')
    const worker = new FakeWorker(request => {
      if (request.type === 'initialize') return response(request, definition())
      if (request.type === 'lifecycle') return response(request, null)
      if (request.type === 'invoke') {
        invokeRequestId = request.requestId
        return {
          protocolVersion: SANDBOX_PROTOCOL_VERSION,
          requestId: 'plugin.sandbox:host:1',
          sessionToken: request.sessionToken,
          type: 'hostCall',
          call: { method: 'assets.write', args: { dataBase64: 'aGk=' } },
        }
      }
      if (request.type === 'hostResponse') {
        return {
          protocolVersion: SANDBOX_PROTOCOL_VERSION,
          requestId: invokeRequestId,
          type: 'response',
          ok: true,
          result: { type: 'transaction', revision: 0, operations: [] },
        }
      }
      return null
    })
    const host = new EditorPluginHost({
      workspacePath: '/workspace',
      manifests: [manifest({ capabilities: ['editor.write', 'assets.write'] })],
      nevoVersion: '1.0.0',
      workerFactory: () => worker as unknown as Worker,
      runtime: { pluginAssetWrite: assetWrite },
    })
    await host.initialize()
    host.registries.slashItems.get('plugin.sandbox.hello')?.run(
      runContext(editorState(), () => {}),
    )

    await vi.waitFor(() => {
      const hostResponse = worker.requests.find(item => item.type === 'hostResponse')
      expect(hostResponse).toMatchObject({ type: 'hostResponse', ok: true, result: 'c0ffee' })
    })
    expect(assetWrite).toHaveBeenCalledWith('plugin.sandbox', 'aGk=')
  })

  it('brokers assets.url to the runtime under the assets.read capability', async () => {
    let invokeRequestId = ''
    const assetUrl = vi.fn().mockResolvedValue('nevoplugin-asset://tok/c0ffee')
    const worker = new FakeWorker(request => {
      if (request.type === 'initialize') return response(request, definition())
      if (request.type === 'lifecycle') return response(request, null)
      if (request.type === 'invoke') {
        invokeRequestId = request.requestId
        return {
          protocolVersion: SANDBOX_PROTOCOL_VERSION,
          requestId: 'plugin.sandbox:host:1',
          sessionToken: request.sessionToken,
          type: 'hostCall',
          call: { method: 'assets.url', args: { assetId: 'c0ffee' } },
        }
      }
      if (request.type === 'hostResponse') {
        return {
          protocolVersion: SANDBOX_PROTOCOL_VERSION,
          requestId: invokeRequestId,
          type: 'response',
          ok: true,
          result: { type: 'transaction', revision: 0, operations: [] },
        }
      }
      return null
    })
    const host = new EditorPluginHost({
      workspacePath: '/workspace',
      manifests: [manifest({ capabilities: ['editor.write', 'assets.read'] })],
      nevoVersion: '1.0.0',
      workerFactory: () => worker as unknown as Worker,
      runtime: { pluginAssetUrl: assetUrl },
    })
    await host.initialize()
    host.registries.slashItems.get('plugin.sandbox.hello')?.run(
      runContext(editorState(), () => {}),
    )

    await vi.waitFor(() => {
      const hostResponse = worker.requests.find(item => item.type === 'hostResponse')
      expect(hostResponse).toMatchObject({
        type: 'hostResponse',
        ok: true,
        result: 'nevoplugin-asset://tok/c0ffee',
      })
    })
    expect(assetUrl).toHaveBeenCalledWith('plugin.sandbox', 'c0ffee')
  })

  it('denies assets.read when the assets.read capability is absent', async () => {
    let invokeRequestId = ''
    const assetRead = vi.fn()
    const worker = new FakeWorker(request => {
      if (request.type === 'initialize') return response(request, definition())
      if (request.type === 'lifecycle') return response(request, null)
      if (request.type === 'invoke') {
        invokeRequestId = request.requestId
        return {
          protocolVersion: SANDBOX_PROTOCOL_VERSION,
          requestId: 'plugin.sandbox:host:1',
          sessionToken: request.sessionToken,
          type: 'hostCall',
          call: { method: 'assets.read', args: { assetId: 'c0ffee' } },
        }
      }
      if (request.type === 'hostResponse') {
        return {
          protocolVersion: SANDBOX_PROTOCOL_VERSION,
          requestId: invokeRequestId,
          type: 'response',
          ok: true,
          result: { type: 'transaction', revision: 0, operations: [] },
        }
      }
      return null
    })
    const host = new EditorPluginHost({
      workspacePath: '/workspace',
      manifests: [manifest({ capabilities: ['editor.write', 'assets.write'] })],
      nevoVersion: '1.0.0',
      workerFactory: () => worker as unknown as Worker,
      runtime: { pluginAssetRead: assetRead },
    })
    await host.initialize()
    host.registries.slashItems.get('plugin.sandbox.hello')?.run(
      runContext(editorState(), () => {}),
    )

    await vi.waitFor(() => {
      const hostResponse = worker.requests.find(item => item.type === 'hostResponse')
      expect(hostResponse).toMatchObject({
        type: 'hostResponse',
        ok: false,
        error: { message: expect.stringContaining('requires capability assets.read') },
      })
    })
    expect(assetRead).not.toHaveBeenCalled()
  })

  it('rejects unnamespaced contributions and unavailable capabilities atomically', () => {
    expect(() => validateSandboxDefinition(manifest(), {
      contributions: [{
        kind: 'schemaNode',
        id: 'other.escape',
        descriptor: { id: 'other.escape', name: 'escape' },
      }],
    })).toThrow('requires capability editor.schema')

    expect(() => validateSandboxDefinition(manifest({
      capabilities: ['editor.schema'],
    }), {
      contributions: [{
        kind: 'schemaNode',
        id: 'other.escape',
        descriptor: { id: 'other.escape', name: 'escape' },
      }],
    })).toThrow('must be namespaced under plugin.sandbox')
  })

  it('rejects iframe routes and sources that escape the plugin boundary', () => {
    const iframeManifest = manifest({ capabilities: ['ui.iframe'] })
    expect(() => validateSandboxDefinition(iframeManifest, {
      contributions: [{
        kind: 'workspaceView',
        id: 'plugin.sandbox.dashboard',
        descriptor: {
          id: 'plugin.sandbox.dashboard',
          source: '../other-plugin/view.html',
        },
      }],
    })).toThrow('plugin-relative iframe entry')

    expect(() => validateSandboxDefinition(iframeManifest, {
      contributions: [{
        kind: 'workspaceView',
        id: 'plugin.sandbox.dashboard',
        descriptor: {
          id: 'plugin.sandbox.dashboard',
          source: 'view.html',
          route: '/workspace/plugin/other-plugin/dashboard',
        },
      }],
    })).toThrow('must stay inside /workspace/plugin/plugin.sandbox')
  })

  it('exposes host-owned iframe descriptors and brokers their events to the Worker', async () => {
    const uiDefinition: NevoSandboxPluginDefinition = {
      contributions: [
        {
          kind: 'workspaceView',
          id: 'plugin.sandbox.dashboard',
          handlerId: 'plugin.sandbox:h1',
          descriptor: {
            id: 'plugin.sandbox.dashboard',
            title: 'Dashboard',
            source: 'views/dashboard.html',
          },
        },
        {
          kind: 'sidebarItem',
          id: 'plugin.sandbox.sidebar',
          descriptor: {
            id: 'plugin.sandbox.sidebar',
            title: 'Dashboard',
            route: '/workspace/plugin/plugin.sandbox/dashboard',
          },
        },
        {
          kind: 'modal',
          id: 'plugin.sandbox.details',
          descriptor: {
            id: 'plugin.sandbox.details',
            source: 'views/details.html',
          },
        },
      ],
    }
    const worker = new FakeWorker(request => {
      if (request.type === 'initialize') return response(request, uiDefinition)
      return response(request, null)
    })
    const revokePluginCodeSession = vi.fn().mockResolvedValue(undefined)
    const host = new EditorPluginHost({
      workspacePath: '/workspace',
      manifests: [manifest({ capabilities: ['ui.iframe', 'ui.contributions'] })],
      nevoVersion: '1.0.0',
      workerFactory: () => worker as unknown as Worker,
      runtime: {
        createPluginCodeSession: async () => ({
          token: '0123456789abcdef0123456789abcdef',
          entryUrl: 'nevoplugin://0123456789abcdef0123456789abcdef/index.js',
        }),
        revokePluginCodeSession,
      },
    })

    await host.initialize()
    expect(host.getSandboxUiContributions()).toEqual({
      workspaceViews: [{
        id: 'plugin.sandbox.dashboard',
        pluginId: 'plugin.sandbox',
        title: 'Dashboard',
        route: '/workspace/plugin/plugin.sandbox/dashboard',
        icon: undefined,
        order: undefined,
        frame: {
          type: 'sandboxed-plugin-iframe',
          pluginId: 'plugin.sandbox',
          source: 'nevoplugin://0123456789abcdef0123456789abcdef/views/dashboard.html',
          sandbox: 'allow-scripts',
        },
      }],
      sidebarItems: [{
        id: 'plugin.sandbox.sidebar',
        pluginId: 'plugin.sandbox',
        title: 'Dashboard',
        route: '/workspace/plugin/plugin.sandbox/dashboard',
        icon: undefined,
        order: undefined,
      }],
      modals: [{
        id: 'plugin.sandbox.details',
        pluginId: 'plugin.sandbox',
        frame: {
          type: 'sandboxed-plugin-iframe',
          pluginId: 'plugin.sandbox',
          source: 'nevoplugin://0123456789abcdef0123456789abcdef/views/details.html',
          sandbox: 'allow-scripts',
        },
      }],
    })

    await host.dispatchSandboxUiEvent('plugin.sandbox', 'plugin.sandbox.dashboard', {
      type: 'select',
      payload: { id: 7 },
    })
    expect(worker.requests.find(request => request.type === 'invoke')).toMatchObject({
      type: 'invoke',
      invocation: {
        handlerId: 'plugin.sandbox:h1',
        input: {
          contributionId: 'plugin.sandbox.dashboard',
          event: { type: 'select', payload: { id: 7 } },
        },
      },
    })

    await host.dispose()
    expect(revokePluginCodeSession).toHaveBeenCalledWith('0123456789abcdef0123456789abcdef')
  })

  it('rejects stale absolute intents but rebases selection-relative operations', () => {
    expect(() => validateTransactionIntent({
      type: 'transaction',
      revision: 1,
      operations: [{ type: 'insertText', text: 'x', from: 1, to: 1 }],
    }, 2)).toThrowError(expect.objectContaining({ name: 'STALE_EDITOR_STATE' }))

    const intent = validateTransactionIntent({
      type: 'transaction',
      revision: 1,
      operations: [{
        type: 'insertText',
        text: '!',
        from: 'selection.from',
        to: 'selection.to',
      }],
    }, 2)
    const next = editorState('hello').apply(applyTransactionIntent(editorState('hello'), intent))
    expect(next.doc.textContent).toBe('!hello')
  })

  it('sanitizes schema/UI DSL and scoped CSS without raw DOM escape hatches', () => {
    const { spec } = schemaNodeFromDescriptor({
      name: 'callout_block',
      group: 'block',
      content: 'block+',
      attrs: { variant: { default: 'info' } },
      ui: {
        type: 'element',
        tag: 'aside',
        props: { class: 'callout' },
        children: [
          { type: 'text', bind: 'attrs.variant' },
          { type: 'contentSlot' },
        ],
      },
    })
    expect(spec.content).toBe('block+')
    expect(() => sanitizeHostUi({
      type: 'element',
      tag: 'iframe',
      props: { src: 'https://evil.invalid' },
    })).toThrow('not allowed')
    expect(sanitizeScopedCss('plugin.sandbox', '.callout { color: red }'))
      .toContain('[data-nevo-plugin="plugin.sandbox"] .callout')
    expect(() => sanitizeScopedCss('plugin.sandbox', 'body { display: none }'))
      .toThrow('forbidden')
  })

  it('renders declarative decorations without exposing ProseMirror to the Worker', async () => {
    const decorated: NevoSandboxPluginDefinition = {
      contributions: [{
        kind: 'decoration',
        id: 'plugin.sandbox.paragraphs',
        descriptor: {
          id: 'plugin.sandbox.paragraphs',
          mode: 'node',
          nodeType: 'paragraph',
          className: 'sandbox-paragraph',
        },
      }],
    }
    const worker = new FakeWorker(request => {
      if (request.type === 'initialize') return response(request, decorated)
      return response(request, null)
    })
    const host = new EditorPluginHost({
      workspacePath: '/workspace',
      manifests: [manifest({ capabilities: ['editor.read'] })],
      nevoVersion: '1.0.0',
      workerFactory: () => worker as unknown as Worker,
    })

    await host.initialize()
    const provider = host.registries.decorationProviders.get('plugin.sandbox.paragraphs')
    const decorations = provider?.provider(editorState('decorated'))
    expect(Array.isArray(decorations) ? decorations : decorations?.find()).toHaveLength(1)
    await host.dispose()
  })

  it('runs timers through host-managed scheduling and clears them on teardown', async () => {
    let initializeRequestId = ''
    const worker = new FakeWorker(request => {
      if (request.type === 'initialize') {
        initializeRequestId = request.requestId
        return {
          protocolVersion: SANDBOX_PROTOCOL_VERSION,
          requestId: 'plugin.sandbox:host:schedule',
          sessionToken: request.sessionToken,
          type: 'hostCall',
          call: {
            method: 'runtime.schedule',
            args: {
              handlerId: 'plugin.sandbox:h1',
              delayMs: 100,
              repeat: false,
            },
          },
        }
      }
      if (request.type === 'hostResponse') {
        return {
          protocolVersion: SANDBOX_PROTOCOL_VERSION,
          requestId: initializeRequestId,
          type: 'response',
          ok: true,
          result: { contributions: [] },
        }
      }
      return response(request, null)
    })
    const host = new EditorPluginHost({
      workspacePath: '/workspace',
      manifests: [manifest({ capabilities: ['runtime.scheduling'] })],
      nevoVersion: '1.0.0',
      workerFactory: () => worker as unknown as Worker,
    })

    await host.initialize()
    await vi.waitFor(() => {
      expect(worker.requests.some(request => request.type === 'invoke')).toBe(true)
    })
    await host.dispose()
  })

  it('requires unified capabilities and rejects execution mode/API mismatches', () => {
    expect(() => validateManifest(manifest({ capabilities: undefined }), '1.0.0'))
      .toThrow('requires a unified capabilities array')
    expect(() => validateManifest(manifest({ apiVersion: '1.0.0' }), '1.0.0'))
      .toThrow('expected 2.0.0 for sandboxed-worker')
    expect(() => validateManifest(manifest({
      apiVersion: '2.0.0',
      executionMode: 'trusted-webview',
    }), '1.0.0')).toThrow('expected 1.0.0 for trusted-webview')
  })

  it('restarts a crashed Worker once and quarantines it after a repeated crash', async () => {
    const workers = [0, 1].map(() => new FakeWorker(request => {
      if (request.type === 'initialize') return response(request, definition())
      if (request.type === 'lifecycle') return response(request, null)
      return null
    }))
    let workerIndex = 0
    const session = new SandboxedPluginSession(
      manifest(),
      'nevoplugin://token/index.js',
      () => workers[workerIndex++] as unknown as Worker,
    )
    await session.initialize()

    const invocation = session.invoke('plugin.sandbox:h1', null)
    queueMicrotask(() => workers[0]?.crash())
    await vi.waitFor(() => expect(workers[1]?.requests[0]?.type).toBe('initialize'))
    queueMicrotask(() => workers[1]?.crash())

    await expect(invocation).rejects.toThrow('boom')
    expect(session.isQuarantined).toBe(true)
    await expect(session.invoke('plugin.sandbox:h1', null)).rejects.toThrow('quarantined')
  })

  it('coalesces rapid editor transactions into a single debounced Worker dispatch', async () => {
    vi.useFakeTimers()
    try {
      const worker = new FakeWorker(request => {
        if (request.type === 'initialize') {
          return response(request, {
            contributions: [{
              kind: 'editorEvent',
              id: 'plugin.sandbox.on-change',
              handlerId: 'plugin.sandbox:h1',
              descriptor: { id: 'plugin.sandbox.on-change', event: 'transactionApplied' },
            }],
          })
        }
        return response(request, null)
      })
      const host = new EditorPluginHost({
        workspacePath: '/workspace',
        manifests: [manifest({ capabilities: ['runtime.events'] })],
        nevoVersion: '1.0.0',
        workerFactory: () => worker as unknown as Worker,
      })
      await host.initialize()

      let state = editorState()
      for (const text of ['a', 'b', 'c']) {
        const tr = state.tr.insertText(text, state.selection.from)
        const next = state.apply(tr)
        host.notifyTransactionApplied(next, tr)
        state = next
      }
      expect(worker.requests.some(request => request.type === 'invoke')).toBe(false)

      await vi.advanceTimersByTimeAsync(48)
      const invokes = worker.requests.filter(request => request.type === 'invoke')
      expect(invokes).toHaveLength(1)
      expect(invokes[0]).toMatchObject({
        invocation: { handlerId: 'plugin.sandbox:h1', input: { docChanged: true } },
      })

      await host.dispose()
    } finally {
      vi.useRealTimers()
    }
  })

  it('keeps a slow but responsive Worker alive when an invoke times out', async () => {
    vi.useFakeTimers()
    try {
      const worker = new FakeWorker(request => {
        if (request.type === 'initialize') return response(request, definition())
        if (request.type === 'lifecycle') return response(request, null)
        if (request.type === 'ping') return response(request, 'pong')
        return null // invoke never resolves: handler is merely slow/awaiting
      })
      const session = new SandboxedPluginSession(
        manifest(),
        'nevoplugin://token/index.js',
        () => worker as unknown as Worker,
      )
      await session.initialize()

      const invocation = session.invoke('plugin.sandbox:h1', null)
      const settled = invocation.then(() => 'resolved', () => 'rejected')
      await vi.advanceTimersByTimeAsync(5_000)

      await expect(settled).resolves.toBe('rejected')
      await expect(invocation).rejects.toThrow(/timed out/)
      expect(worker.terminate).not.toHaveBeenCalled()
      expect(session.isQuarantined).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })

  it('hard-terminates and quarantines a Worker whose event loop is wedged', async () => {
    vi.useFakeTimers()
    try {
      const workers = [0, 1].map(() => new FakeWorker(request => {
        if (request.type === 'initialize') return response(request, definition())
        if (request.type === 'lifecycle') return response(request, null)
        return null // neither invoke nor ping is ever answered
      }))
      let workerIndex = 0
      const session = new SandboxedPluginSession(
        manifest(),
        'nevoplugin://token/index.js',
        () => workers[workerIndex++] as unknown as Worker,
      )
      await session.initialize()

      const invocation = session.invoke('plugin.sandbox:h1', null)
      const settled = invocation.then(() => 'resolved', () => 'rejected')
      // Two wedge rounds: handler timeout (5s) + failed ping probe (750ms) each,
      // with slack for the restart/retry hop in between.
      for (let round = 0; round < 4; round += 1) {
        await vi.advanceTimersByTimeAsync(5_000)
        await vi.advanceTimersByTimeAsync(750)
      }

      await expect(settled).resolves.toBe('rejected')
      await expect(invocation).rejects.toThrow(/timed out/)
      expect(workers[0]?.terminate).toHaveBeenCalled()
      expect(session.isQuarantined).toBe(true)
    } finally {
      vi.useRealTimers()
    }
  })

  it('renders a Tier 1 svg block through a sanitized Worker render handler', async () => {
    const renderDefinition: NevoSandboxPluginDefinition = {
      contributions: [{
        kind: 'blockType',
        id: 'plugin.sandbox.chart',
        handlerId: 'plugin.sandbox:h1',
        descriptor: {
          id: 'plugin.sandbox.chart',
          name: 'sandbox_chart',
          render: 'svg',
          schema: { group: 'block', atom: true, attrs: { seed: { default: 1 } } },
        },
      }],
    }
    const worker = new FakeWorker(request => {
      if (request.type === 'initialize') return response(request, renderDefinition)
      if (request.type === 'invoke') {
        return response(request, {
          svg: '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script>'
            + '<rect width="10" height="10" /></svg>',
        })
      }
      return response(request, null)
    })
    const host = new EditorPluginHost({
      workspacePath: '/workspace',
      manifests: [manifest({ capabilities: ['editor.schema'] })],
      nevoVersion: '1.0.0',
      workerFactory: () => worker as unknown as Worker,
    })
    await host.initialize()

    const factory = host.registries.nodeViews.get('sandbox_chart')
    expect(factory).toBeTypeOf('function')
    const view = factory!(
      { attrs: { seed: 1 }, type: { name: 'sandbox_chart' } } as never,
      null as never,
      (() => 0) as never,
      [] as never,
      [] as never,
    )
    await vi.waitFor(() => expect(view.dom.querySelector('svg')).not.toBeNull())
    expect(view.dom.querySelector('rect')).not.toBeNull()
    expect(view.dom.querySelector('script')).toBeNull()
    view.destroy?.()
    await host.dispose()
  })

  it('requires a handler for render blocks and rejects non-svg render modes', () => {
    const schemaManifest = manifest({ capabilities: ['editor.schema'] })
    expect(() => validateSandboxDefinition(schemaManifest, {
      contributions: [{
        kind: 'blockType',
        id: 'plugin.sandbox.chart',
        descriptor: { id: 'plugin.sandbox.chart', name: 'sandbox_chart', render: 'svg' },
      }],
    })).toThrow('render requires a handler')
    expect(() => validateSandboxDefinition(schemaManifest, {
      contributions: [{
        kind: 'blockType',
        id: 'plugin.sandbox.chart',
        handlerId: 'plugin.sandbox:h1',
        descriptor: { id: 'plugin.sandbox.chart', name: 'sandbox_chart', render: 'html' },
      }],
    })).toThrow('render must be "svg"')
    expect(() => validateSandboxDefinition(schemaManifest, {
      contributions: [{
        kind: 'blockType',
        id: 'plugin.sandbox.chart',
        handlerId: 'plugin.sandbox:h1',
        descriptor: {
          id: 'plugin.sandbox.chart',
          name: 'sandbox_chart',
          render: 'svg',
          schema: { content: 'block+' },
        },
      }],
    })).toThrow('content-less')
  })

  it('validates Tier 2 frame blocks: capability, source, and render/frame exclusivity', () => {
    const frameContribution = (descriptor: Record<string, unknown>) => ({
      contributions: [{
        kind: 'blockType' as const,
        id: 'plugin.sandbox.board',
        handlerId: 'plugin.sandbox:h1',
        descriptor: { id: 'plugin.sandbox.board', name: 'sandbox_board', ...descriptor },
      }],
    })
    expect(() => validateSandboxDefinition(
      manifest({ capabilities: ['editor.schema'] }),
      frameContribution({ frame: { source: 'views/board.html' } }),
    )).toThrow('ui.blockFrame')
    const frameManifest = manifest({ capabilities: ['editor.schema', 'ui.blockFrame'] })
    expect(() => validateSandboxDefinition(
      frameManifest,
      frameContribution({ frame: { source: 'https://evil.invalid/board.html' } }),
    )).toThrow('plugin-relative iframe entry')
    expect(() => validateSandboxDefinition(
      frameManifest,
      frameContribution({ render: 'svg', frame: { source: 'views/board.html' } }),
    )).toThrow('both render and frame')
  })

  it('mounts a Tier 2 iframe block, brokers node state, and gates patches on editor.write.self', async () => {
    const frameDefinition: NevoSandboxPluginDefinition = {
      contributions: [{
        kind: 'blockType',
        id: 'plugin.sandbox.board',
        handlerId: 'plugin.sandbox:h1',
        descriptor: {
          id: 'plugin.sandbox.board',
          name: 'sandbox_board',
          frame: { source: 'views/board.html' },
          schema: { group: 'block', atom: true, attrs: { title: { default: 'a' } } },
        },
      }],
    }
    const buildHost = async (capabilities: string[]) => {
      const worker = new FakeWorker(request =>
        request.type === 'initialize' ? response(request, frameDefinition) : response(request, null))
      const host = new EditorPluginHost({
        workspacePath: '/workspace',
        manifests: [manifest({ capabilities: capabilities as never })],
        nevoVersion: '1.0.0',
        workerFactory: () => worker as unknown as Worker,
        runtime: {
          theme: () => 'dark',
          locale: () => 'de',
          createPluginCodeSession: async () => ({
            token: '0123456789abcdef0123456789abcdef',
            entryUrl: 'nevoplugin://0123456789abcdef0123456789abcdef/index.js',
          }),
          revokePluginCodeSession: async () => {},
        },
      })
      await host.initialize()
      return host
    }

    const mountFrame = (host: EditorPluginHost) => {
      const factory = host.registries.nodeViews.get('sandbox_board')
      expect(factory).toBeTypeOf('function')
      const dispatched: Array<{ attrs: Record<string, unknown> }> = []
      const fakeNode = { attrs: { title: 'a' }, marks: [] }
      const fakeView = {
        state: {
          doc: { nodeAt: (pos: number) => (pos === 0 ? fakeNode : null) },
          tr: {
            setNodeMarkup: (pos: number, _t: unknown, attrs: Record<string, unknown>, marks: unknown) =>
              ({ pos, attrs, marks }),
          },
        },
        dispatch: (transaction: { attrs: Record<string, unknown> }) => dispatched.push(transaction),
      } as never
      const view = factory!(fakeNode as never, fakeView, (() => 0) as never, [] as never, [] as never)
      document.body.append(view.dom)
      const iframe = view.dom.querySelector('iframe') as HTMLIFrameElement
      const postMessage = vi.fn()
      const contentWindow = { postMessage }
      Object.defineProperty(iframe, 'contentWindow', { value: contentWindow, configurable: true })
      const sendFromFrame = (data: unknown) => {
        const event = new Event('message') as Event & { data: unknown; source: unknown }
        event.data = data
        event.source = contentWindow
        globalThis.dispatchEvent(event)
      }
      return { view, iframe, postMessage, dispatched, sendFromFrame }
    }

    // Editable frame: node broadcast on load carries attrs/editable/theme/locale.
    const editableHost = await buildHost(['editor.schema', 'ui.blockFrame', 'editor.write.self'])
    const editable = mountFrame(editableHost)
    editable.iframe.dispatchEvent(new Event('load'))
    expect(editable.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'node', editable: true, theme: 'dark', locale: 'de', attrs: { title: 'a' } }),
      '*',
    )
    editable.sendFromFrame({ protocolVersion: '2.0', type: 'patch', payload: { attrs: { title: 'b' } } })
    expect(editable.dispatched).toHaveLength(1)
    expect(editable.dispatched[0]?.attrs).toEqual({ title: 'b' })
    editable.view.destroy?.()
    editable.view.dom.remove()
    await editableHost.dispose()

    // Read-only frame: same patch is rejected because editor.write.self is absent.
    const readonlyHost = await buildHost(['editor.schema', 'ui.blockFrame'])
    const readonly = mountFrame(readonlyHost)
    readonly.sendFromFrame({ protocolVersion: '2.0', type: 'patch', payload: { attrs: { title: 'b' } } })
    expect(readonly.dispatched).toHaveLength(0)
    expect(readonlyHost.errors.some(error => error.includes('editor.write.self'))).toBe(true)
    readonly.view.destroy?.()
    readonly.view.dom.remove()
    await readonlyHost.dispose()
  })

  it('runs versioned migrations through the same isolated Worker protocol', async () => {
    const worker = new FakeWorker(request => {
      if (request.type === 'initialize') return response(request, { contributions: [] })
      if (request.type === 'migration') {
        return response(request, {
          dataVersion: request.targetDataVersion,
          storage: { migrated: true },
          nodes: request.input.nodes,
        })
      }
      return response(request, null)
    })
    const session = new SandboxedPluginSession(
      manifest({ dataVersion: 2 }),
      'nevoplugin://token/index.js',
      () => worker as unknown as Worker,
    )
    await session.initialize()

    await expect(session.migrate({
      fromDataVersion: 1,
      storage: {},
      nodes: [{ type: 'callout_block' }],
    }, 2)).resolves.toEqual({
      dataVersion: 2,
      storage: { migrated: true },
      nodes: [{ type: 'callout_block' }],
    })
    await session.dispose()
  })

  it('loads cached schemas without starting disabled plugin code', async () => {
    const workerFactory = vi.fn()
    const host = new EditorPluginHost({
      workspacePath: '/workspace',
      manifests: [manifest({ enabled: false })],
      nevoVersion: '1.0.0',
      workerFactory,
      runtime: {
        loadPluginRegistry: async () => ({
          version: 1,
          plugins: {
            'plugin.sandbox': {
              version: '1.0.0',
              dataVersion: 1,
              contributions: [{
                kind: 'blockType',
                id: 'plugin.sandbox.callout',
                descriptor: {
                  id: 'plugin.sandbox.callout',
                  name: 'callout_block',
                  schema: {
                    group: 'block',
                    content: 'block+',
                    attrs: {
                      variant: { default: 'info' },
                      icon: { default: '💡' },
                    },
                  },
                  ui: {
                    type: 'element',
                    tag: 'aside',
                    children: [{ type: 'contentSlot' }],
                  },
                },
              }],
            },
          },
        }),
      },
    })

    await host.initialize()

    expect(workerFactory).not.toHaveBeenCalled()
    expect(host.registries.nodes.get('callout_block')?.content).toBe('block+')

    const schema = createSchemaWithPluginExtensions(host)
    const legacyJson = {
      type: 'doc',
      content: [{
        type: 'callout_block',
        attrs: { variant: 'warning', icon: '⚠️' },
        content: [{
          type: 'paragraph',
          content: [{ type: 'text', text: 'Rich legacy child' }],
        }],
      }],
    }
    const original = prosemirrorJSONToYDoc(schema, legacyJson, 'prosemirror')
    const reopened = new Y.Doc()
    Y.applyUpdate(reopened, Y.encodeStateAsUpdate(original))
    expect(yDocToProsemirrorJSON(reopened, 'prosemirror')).toEqual(legacyJson)
  })
})
