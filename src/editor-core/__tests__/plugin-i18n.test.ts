import { describe, expect, it, vi } from 'vitest'
import { EditorPluginHost } from '../plugin-host'
import { SandboxedPluginSession } from '../plugin-host/sandbox'
import {
  SANDBOX_PROTOCOL_VERSION,
  isSandboxWorkerRequest,
  type SandboxWorkerRequest,
  type SandboxWorkerResponse,
} from '../plugin-host/sandboxProtocol'
import type { NevoEditorPluginManifest } from '../../types/editor-plugin'

vi.mock('../../utils/workspaceAssetUrl', () => ({
  workspaceAssetUrl: (path: string) => `nevoasset://${path}`,
}))

function manifest(): NevoEditorPluginManifest {
  return {
    id: 'plugin.i18n',
    name: 'I18n plugin',
    version: '1.0.0',
    enabled: true,
    kind: 'marketplace',
    source: 'marketplace',
    entryPoint: 'index.js',
    apiVersion: '2.2.0',
    executionMode: 'sandboxed-worker',
    dataVersion: 1,
    capabilities: ['editor.write'],
    editorCapabilities: [],
    uiCapabilities: [],
    workspaceCapabilities: [],
  }
}

class FakeWorker {
  readonly terminate = vi.fn()
  readonly requests: SandboxWorkerRequest[] = []
  private readonly listeners = new Set<(event: MessageEvent<SandboxWorkerResponse>) => void>()

  postMessage(request: SandboxWorkerRequest): void {
    this.requests.push(request)
    queueMicrotask(() => {
      const data: SandboxWorkerResponse = {
        protocolVersion: SANDBOX_PROTOCOL_VERSION,
        requestId: request.requestId,
        type: 'response',
        ok: true,
        result: request.type === 'initialize' ? { contributions: [] } : null,
      }
      for (const listener of this.listeners) listener(new MessageEvent('message', { data }))
    })
  }

  addEventListener(type: string, listener: EventListenerOrEventListenerObject): void {
    if (type === 'message') this.listeners.add(listener as never)
  }

  removeEventListener(type: string, listener: EventListenerOrEventListenerObject): void {
    if (type === 'message') this.listeners.delete(listener as never)
  }
}

function initializeOf(worker: FakeWorker) {
  const request = worker.requests.find(item => item.type === 'initialize')
  return request?.type === 'initialize' ? request : null
}

describe('plugin i18n catalog delivery', () => {
  it('sends a sanitized catalog in initialize', async () => {
    const worker = new FakeWorker()
    const session = new SandboxedPluginSession(
      manifest(),
      'nevoplugin://token/index.js',
      () => worker as unknown as Worker,
      undefined,
      { locale: 'ru', messages: { k: 'Привет', bad: 1, __proto__: 'x' } as unknown as Record<string, string> },
    )
    await session.initialize()
    expect(initializeOf(worker)?.i18n).toEqual({ locale: 'ru', messages: { k: 'Привет' } })
  })

  it('defaults to an empty en catalog and passes the protocol check', async () => {
    const worker = new FakeWorker()
    const session = new SandboxedPluginSession(
      manifest(),
      'nevoplugin://token/index.js',
      () => worker as unknown as Worker,
    )
    await session.initialize()
    const request = initializeOf(worker)
    expect(request?.i18n).toEqual({ locale: 'en', messages: {} })
    expect(isSandboxWorkerRequest(request)).toBe(true)
    expect(isSandboxWorkerRequest({ ...request, i18n: { locale: 1 } })).toBe(false)
  })

  it('host loads the catalog through the runtime and survives loader failures', async () => {
    const workers: FakeWorker[] = []
    const factory = () => {
      const worker = new FakeWorker()
      workers.push(worker)
      return worker as unknown as Worker
    }
    const loadPluginMessages = vi.fn(async () => ({ locale: 'ru', messages: { k: 'v' } }))
    const host = new EditorPluginHost({
      workspacePath: '/workspace',
      manifests: [manifest()],
      nevoVersion: '1.0.0',
      workerFactory: factory,
      runtime: { locale: () => 'ru', loadPluginMessages },
    })
    await host.initialize()
    expect(loadPluginMessages).toHaveBeenCalledTimes(1)
    expect(initializeOf(workers[0]!)?.i18n).toEqual({ locale: 'ru', messages: { k: 'v' } })
    await host.dispose()

    const failing = new EditorPluginHost({
      workspacePath: '/workspace',
      manifests: [manifest()],
      nevoVersion: '1.0.0',
      workerFactory: factory,
      runtime: {
        locale: () => 'de',
        loadPluginMessages: async () => { throw new Error('boom') },
      },
    })
    await failing.initialize()
    expect(initializeOf(workers[1]!)?.i18n).toEqual({ locale: 'de', messages: {} })
    expect(failing.errors.some(error => error.includes('messages failed to load'))).toBe(true)
    await failing.dispose()
  })
})
