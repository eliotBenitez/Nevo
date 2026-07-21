import { describe, expect, it, vi } from 'vitest'
import * as Y from 'yjs'
import { prosemirrorJSONToYDoc, yDocToProsemirrorJSON } from 'y-prosemirror'
import { Schema } from 'prosemirror-model'
import { nevoBaseSchema } from '../../editor-core/schema'
import {
  SANDBOX_PROTOCOL_VERSION,
  type SandboxWorkerRequest,
  type SandboxWorkerResponse,
} from '../../editor-core/plugin-host/sandboxProtocol'
import { workspaceCommands, collabCommands } from '../../tauri/commands'
import { collectWorkspaceNoteIds, runMarketplacePluginTransaction } from './marketplaceMigration'
import type { PluginManifest, WorkspaceManifest } from '../../types/workspace'

vi.mock('../../tauri/commands', () => ({
  workspaceCommands: {
    marketplacePreparePlugin: vi.fn(),
    pluginStorageSnapshot: vi.fn(),
    createStagedPluginCodeSession: vi.fn(),
    pluginRegistryLoad: vi.fn(),
    revokePluginCodeSession: vi.fn(),
    marketplaceCommitPlugin: vi.fn(),
    marketplaceAbortPlugin: vi.fn(),
  },
  collabCommands: {
    loadYjsState: vi.fn(),
  },
}))

class FakeWorker {
  readonly terminate = vi.fn()
  private readonly listeners = new Set<(event: MessageEvent<SandboxWorkerResponse>) => void>()

  postMessage(request: SandboxWorkerRequest): void {
    queueMicrotask(() => {
      let result: unknown = null
      if (request.type === 'initialize') {
        result = {
          dataVersion: 2,
          contributions: [{
            kind: 'blockType',
            id: 'plugin.callout.block',
            descriptor: {
              id: 'plugin.callout.block',
              name: 'callout_block',
              schema: {
                group: 'block',
                content: 'block+',
                attrs: { variant: { default: 'info' }, migrated: { default: false } },
              },
              ui: {
                type: 'element',
                tag: 'aside',
                children: [{ type: 'contentSlot' }],
              },
            },
          }],
        }
      } else if (request.type === 'migration') {
        result = {
          dataVersion: 2,
          storage: { migrated: true },
          nodes: request.input.nodes.map(node => ({
            ...node,
            attrs: { ...(node.attrs as Record<string, unknown>), migrated: true },
          })),
        }
      }
      const event = new MessageEvent<SandboxWorkerResponse>('message', {
        data: {
          protocolVersion: SANDBOX_PROTOCOL_VERSION,
          requestId: request.requestId,
          type: 'response',
          ok: true,
          result,
        },
      })
      for (const listener of this.listeners) listener(event)
    })
  }

  addEventListener(type: string, listener: EventListenerOrEventListenerObject): void {
    if (type === 'message') this.listeners.add(listener as (event: MessageEvent<SandboxWorkerResponse>) => void)
  }

  removeEventListener(type: string, listener: EventListenerOrEventListenerObject): void {
    if (type === 'message') this.listeners.delete(listener as (event: MessageEvent<SandboxWorkerResponse>) => void)
  }
}

function workspace(): WorkspaceManifest {
  return {
    id: 'workspace',
    name: 'Workspace',
    glyph: 'N',
    gradient: 'violet',
    schemaVersion: 1,
    createdAt: '2026-07-18T00:00:00.000Z',
    rootOrder: ['root-note', 'folder'],
    rootNotes: [{
      id: 'root-note',
      title: 'Root',
      icon: '📄',
      folderId: null,
      updatedAt: '2026-07-18T00:00:00.000Z',
    }],
    tree: [{
      id: 'folder',
      title: 'Folder',
      icon: '📁',
      parentId: null,
      order: 0,
      notes: [{
        id: 'nested-note',
        title: 'Nested',
        icon: '📄',
        folderId: 'folder',
        updatedAt: '2026-07-18T00:00:00.000Z',
      }],
      children: [],
    }],
  }
}

describe('marketplace plugin migration', () => {
  it('collects root and nested note ids exactly once', () => {
    expect(collectWorkspaceNoteIds(workspace())).toEqual(['root-note', 'nested-note'])
  })

  it('validates staged contributions and migrates real Y.Doc copies before commit', async () => {
    const oldSchema = new Schema({
      nodes: nevoBaseSchema.spec.nodes.addToEnd('callout_block', {
        group: 'block',
        content: 'block+',
        attrs: { variant: { default: 'info' } },
        toDOM: () => ['aside', 0],
        parseDOM: [{ tag: 'aside' }],
      }),
      marks: nevoBaseSchema.spec.marks,
    })
    const oldDocument = {
      type: 'doc',
      content: [{
        type: 'callout_block',
        attrs: { variant: 'warning' },
        content: [{
          type: 'paragraph',
          content: [{ type: 'text', text: 'Preserved rich child' }],
        }],
      }],
    }
    const oldYdoc = prosemirrorJSONToYDoc(oldSchema, oldDocument, 'prosemirror')
    const preparedManifest: PluginManifest = {
      id: 'plugin.callout',
      name: 'Callout',
      version: '2.0.0',
      description: 'Callout',
      enabled: true,
      kind: 'marketplace',
      source: 'marketplace',
      entryPoint: 'index.js',
      apiVersion: '2.0.0',
      executionMode: 'sandboxed-worker',
      dataVersion: 2,
      capabilities: ['editor.schema'],
      editorCapabilities: [],
    }
    vi.mocked(workspaceCommands.marketplacePreparePlugin).mockResolvedValue({
      transactionId: 'transaction',
      previousDataVersion: 1,
      permissionFingerprint: 'fingerprint',
      manifest: preparedManifest,
    })
    vi.mocked(workspaceCommands.pluginStorageSnapshot).mockResolvedValue({ old: true })
    vi.mocked(workspaceCommands.createStagedPluginCodeSession).mockResolvedValue({
      token: '0123456789abcdef0123456789abcdef',
      entryUrl: 'nevoplugin://0123456789abcdef0123456789abcdef/index.js',
    })
    vi.mocked(workspaceCommands.pluginRegistryLoad).mockResolvedValue({
      version: 1,
      plugins: {
        'plugin.callout': {
          version: '1.0.0',
          dataVersion: 1,
          contributions: [{
            kind: 'blockType',
            id: 'plugin.callout.block',
            descriptor: {
              id: 'plugin.callout.block',
              name: 'callout_block',
              schema: {
                group: 'block',
                content: 'block+',
                attrs: { variant: { default: 'info' } },
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
    })
    vi.mocked(collabCommands.loadYjsState).mockImplementation(async (_path, noteId) =>
      noteId === 'root-note' ? Y.encodeStateAsUpdate(oldYdoc) : new Uint8Array())
    vi.mocked(workspaceCommands.revokePluginCodeSession).mockResolvedValue(undefined)
    vi.mocked(workspaceCommands.marketplaceAbortPlugin).mockResolvedValue(undefined)
    vi.mocked(workspaceCommands.marketplaceCommitPlugin).mockImplementation(async (
      _path,
      _transaction,
      _fingerprint,
      migration,
    ) => {
      const encoded = migration?.collabStatesBase64?.['root-note']
      expect(encoded).toBeTruthy()
      const migratedYdoc = new Y.Doc()
      Y.applyUpdate(migratedYdoc, Uint8Array.from(atob(encoded!), character => character.charCodeAt(0)))
      expect(yDocToProsemirrorJSON(migratedYdoc, 'prosemirror')).toEqual({
        type: 'doc',
        content: [{
          type: 'callout_block',
          attrs: { variant: 'warning', migrated: true },
          content: [{
            type: 'paragraph',
            content: [{ type: 'text', text: 'Preserved rich child' }],
          }],
        }],
      })
      expect(migration?.workspaceStorage).toEqual({ migrated: true })
      return preparedManifest
    })

    const result = await runMarketplacePluginTransaction({
      workspacePath: '/workspace',
      pluginId: 'plugin.callout',
      permissionFingerprint: 'fingerprint',
      update: true,
      workspace: workspace(),
      workerFactory: () => new FakeWorker() as unknown as Worker,
    })

    expect(result.version).toBe('2.0.0')
    expect(workspaceCommands.marketplaceAbortPlugin).not.toHaveBeenCalled()
    expect(workspaceCommands.revokePluginCodeSession)
      .toHaveBeenCalledWith('0123456789abcdef0123456789abcdef')
  })
})
