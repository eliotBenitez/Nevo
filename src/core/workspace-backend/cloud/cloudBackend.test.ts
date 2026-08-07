import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as Y from 'yjs'
import { CloudBackend, CLOUD_ASSET_SCHEME } from './cloudBackend'
import type { CloudBackendDeps } from './cloudBackend'
import { manifestMap, emptyManifest, writeManifest } from './manifest'
import type { OfflineDocCache } from './offlineCache'
import { encryptBytes, generateSessionKey } from '../../../editor-core/collaboration/encryption'
import type { WorkspaceManifest } from '../../../types/workspace'
import { emptyNoteQueryFilters, type NoteQueryFilters } from '../../../types/note-query'
import type { TemplateDocument } from '../../../types/template'
import { workspaceCommands } from '../../../tauri/commands'

// Built-in templates and placeholder resolution stay in the backend command —
// the cloud path only adds user templates and note creation around them.
vi.mock('../../../tauri/commands', () => ({
  workspaceCommands: {
    cloudPluginRoot: vi.fn(async (storageId: string) => `/config/cloud-plugins/${storageId}`),
    listPlugins: vi.fn(async () => [{ id: 'nevo.kanban', enabled: true }]),
    setPluginEnabled: vi.fn(async () => {}),
    marketplaceListPlugins: vi.fn(async () => ({ plugins: [] })),
    marketplaceInstallPlugin: vi.fn(async () => ({ id: 'some.plugin' })),
    marketplaceUpdatePlugin: vi.fn(async () => ({ id: 'some.plugin' })),
    marketplaceRemovePlugin: vi.fn(async () => {}),
    marketplaceRefreshCache: vi.fn(async () => ({ plugins: [] })),
  },
  templateCommands: {
    listTemplates: vi.fn(async () => [
      { id: 'blank', name: 'Blank', icon: '📄', description: '', content: { type: 'doc', content: [] }, fields: [], createdAt: '', updatedAt: '', builtIn: true },
    ]),
    getTemplate: vi.fn(async (_path: string | null, id: string) => {
      if (id !== 'blank') throw new Error('Template not found')
      return { id: 'blank', name: 'Blank', icon: '📄', description: '', content: { type: 'doc', content: [] }, fields: [], createdAt: '', updatedAt: '', builtIn: true }
    }),
    resolveContent: vi.fn(async (template: TemplateDocument) => template.content),
  },
}))

// A socket that connects and immediately reports "synced" with no history, so
// open() does not sit through its grace period. Nothing is sent anywhere.
class StubWebSocket {
  static readonly OPEN = 1
  readyState = 0
  binaryType = ''
  onopen: (() => void) | null = null
  onclose: (() => void) | null = null
  onerror: (() => void) | null = null
  onmessage: ((event: MessageEvent<ArrayBuffer>) => void) | null = null

  constructor(readonly url: string) {
    queueMicrotask(() => {
      this.readyState = StubWebSocket.OPEN
      this.onopen?.()
      this.onmessage?.({ data: new Uint8Array([0x00]).buffer } as MessageEvent<ArrayBuffer>)
    })
  }

  send(): void {}
  close(): void {}
}

describe('CloudBackend deletion paths', () => {
  let key: CryptoKey

  beforeEach(async () => {
    vi.stubGlobal('WebSocket', StubWebSocket as unknown as typeof WebSocket)
    key = await generateSessionKey()
  })

  afterEach(() => { vi.unstubAllGlobals() })

  /** Seeds the offline cache with a manifest so open() resolves immediately. */
  async function seededCache(manifest: WorkspaceManifest): Promise<OfflineDocCache> {
    const doc = new Y.Doc()
    writeManifest(doc, manifestMap(doc), manifest)
    const encrypted = await encryptBytes(key, Y.encodeStateAsUpdate(doc))
    doc.destroy()
    const entries = new Map<string, Uint8Array>([['manifest-room', encrypted]])
    return {
      load: async room => entries.get(room) ?? null,
      save: async () => {},
      remove: async () => {},
      prune: async () => {},
    }
  }

  interface Calls {
    deletedDocuments: string[]
    deletedAssets: string[]
    pruned: Array<{ docId: string; keep: number }>
    storageMeta: Array<{ name: string; glyph: string; gradient: string }>
  }

  async function openBackend(overrides: Partial<CloudBackendDeps> = {}) {
    const calls: Calls = { deletedDocuments: [], deletedAssets: [], pruned: [], storageMeta: [] }
    let nextDoc = 0

    const backend = new CloudBackend({
      storageId: 'storage-1',
      name: 'Cloud',
      glyph: 'C',
      gradient: 'g',
      manifestRoom: 'manifest-room',
      key,
      getToken: async () => 'token',
      wsBase: 'ws://relay',
      listDocuments: async () => [],
      createDocument: async () => {
        nextDoc++
        return { id: `note-${nextDoc}`, storageId: 'storage-1', kind: 'note', roomCode: `room-${nextDoc}`, createdAt: '', updatedAt: '' }
      },
      updateStorageMeta: async (meta) => { calls.storageMeta.push({ ...meta }) },
      deleteDocument: async (docId) => { calls.deletedDocuments.push(docId) },
      listSnapshots: async () => [],
      createSnapshot: async () => ({}),
      getSnapshot: async () => new Uint8Array(),
      pruneSnapshots: async (docId, keep) => { calls.pruned.push({ docId, keep }); return { deleted: 3 } },
      uploadAsset: async () => ({ id: 'asset-1' }),
      fetchAsset: async () => ({ bytes: new Uint8Array(), contentType: 'image/png' }),
      deleteAsset: async (assetId) => { calls.deletedAssets.push(assetId) },
      onManifest: () => {},
      cache: await seededCache(emptyManifest('storage-1', 'Cloud', 'C', 'g')),
      ...overrides,
    })

    await backend.open()
    return { backend, calls }
  }

  it('purges the server document when a trashed note is permanently deleted', async () => {
    const { backend, calls } = await openBackend()
    const note = await backend.createNote(null, 'Doomed', '📄')
    await backend.deleteNote(note.id) // soft delete -> trash

    await backend.permanentlyDeleteFromTrash(note.id)

    expect(calls.deletedDocuments).toEqual([note.id])
    const diagnostics = await backend.getDiagnostics()
    expect(diagnostics.noteCount).toBe(0)
    backend.destroy()
  })

  it('does not call the document endpoint for a non-note trash entry', async () => {
    // Only entries recorded as notes own a server document; the folder itself
    // never gets one, and deleting it leaves no trash entry of its own.
    const { backend, calls } = await openBackend()
    const folder = await backend.createFolder(null, 'Folder', '📁')
    await backend.deleteFolder(folder.id)

    await backend.permanentlyDeleteFromTrash(folder.id)

    expect(calls.deletedDocuments).toEqual([])
    backend.destroy()
  })

  it('purges every trashed note when the trash is emptied', async () => {
    const { backend, calls } = await openBackend()
    const first = await backend.createNote(null, 'One', '📄')
    const second = await backend.createNote(null, 'Two', '📄')
    await backend.deleteNote(first.id)
    await backend.deleteNote(second.id)

    await backend.emptyTrash()

    expect(calls.deletedDocuments.sort()).toEqual([first.id, second.id].sort())
    backend.destroy()
  })

  it('keeps the item out of the trash even when the server delete fails', async () => {
    // The user asked for it to be gone; a failed purge must not resurrect it.
    const { backend } = await openBackend({
      deleteDocument: async () => { throw new Error('offline') },
    })
    const note = await backend.createNote(null, 'Doomed', '📄')
    await backend.deleteNote(note.id)

    await expect(backend.permanentlyDeleteFromTrash(note.id)).resolves.toBeUndefined()

    const previews = await backend.listSidebarNotePreviews()
    expect(previews).toEqual([])
    backend.destroy()
  })

  it('restores a note to the root when its original folder no longer exists', async () => {
    const { backend } = await openBackend()
    const folder = await backend.createFolder(null, 'Temporary', '📁')
    const note = await backend.createNote(folder.id, 'Recover me', '📄')
    await backend.deleteNote(note.id)
    await backend.deleteFolder(folder.id)

    await backend.restoreFromTrash(note.id)

    const previews = await backend.listSidebarNotePreviews()
    expect(previews).toEqual([
      expect.objectContaining({ noteId: note.id, folderPath: '' }),
    ])
    backend.destroy()
  })

  describe('plugins', () => {
    // Plugins are device-local: a cloud workspace gets a directory on this
    // machine, and every plugin command runs against it exactly as a local
    // workspace's would.
    it('lists plugins from the device-local directory', async () => {
      const { backend } = await openBackend()

      expect(backend.pluginWorkspacePath()).toBe('/config/cloud-plugins/storage-1')
      expect(await backend.listPlugins()).toEqual([{ id: 'nevo.kanban', enabled: true }])
      backend.destroy()
    })

    it('installs through the same marketplace command a local workspace uses', async () => {
      const { backend } = await openBackend()

      await backend.marketplaceInstallPlugin('some.plugin', 'fingerprint')

      expect(vi.mocked(workspaceCommands.marketplaceInstallPlugin))
        .toHaveBeenCalledWith('/config/cloud-plugins/storage-1', 'some.plugin', 'fingerprint', undefined)
      backend.destroy()
    })

    it('degrades to no plugins when the directory cannot be prepared', async () => {
      vi.mocked(workspaceCommands.cloudPluginRoot).mockRejectedValueOnce(new Error('denied'))
      const { backend } = await openBackend()

      expect(backend.pluginWorkspacePath()).toBeNull()
      expect(await backend.listPlugins()).toEqual([])
      await expect(backend.marketplaceInstallPlugin('x', 'y')).rejects.toThrow('unavailable')
      backend.destroy()
    })
  })

  describe('templates', () => {
    const template = (id: string, name = id): TemplateDocument => ({
      id,
      name,
      icon: '📄',
      description: '',
      content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: name }] }] },
      fields: [],
      createdAt: '2026-08-03T10:00:00.000Z',
      updatedAt: '2026-08-03T10:00:00.000Z',
    })

    it('merges built-in templates with the ones stored in the workspace', async () => {
      const { backend } = await openBackend()
      await backend.createTemplate(template('meeting-notes', 'Meeting notes'))

      const all = await backend.listTemplates()

      // 'blank' comes from the built-ins the backend generates.
      expect(all.some(t => t.id === 'blank')).toBe(true)
      expect(all.find(t => t.id === 'meeting-notes')).toMatchObject({ name: 'Meeting notes', builtIn: false })
      backend.destroy()
    })

    it('round-trips a user template through the workspace document', async () => {
      const { backend } = await openBackend()
      await backend.createTemplate(template('daily', 'Daily'))

      expect(await backend.getTemplate('daily')).toMatchObject({ name: 'Daily', builtIn: false })
      backend.destroy()
    })

    it('updates a template, dropping the old key when the id changes', async () => {
      const { backend } = await openBackend()
      await backend.createTemplate(template('old-id', 'Before'))

      await backend.updateTemplate('old-id', { ...template('new-id', 'After') })

      const ids = (await backend.listTemplates()).map(t => t.id)
      expect(ids).toContain('new-id')
      expect(ids).not.toContain('old-id')
      backend.destroy()
    })

    it('deletes a user template', async () => {
      const { backend } = await openBackend()
      await backend.createTemplate(template('temp'))

      await backend.deleteTemplate('temp')

      expect((await backend.listTemplates()).some(t => t.id === 'temp')).toBe(false)
      backend.destroy()
    })

    it('seeds a new note with the resolved template body', async () => {
      // Previously this silently produced a blank note, dropping the template.
      const { backend } = await openBackend()
      await backend.createTemplate(template('daily', 'Daily'))

      const note = await backend.createNoteFromTemplate('daily', null, 'Monday', '📄', {})

      expect(note.title).toBe('Monday')
      expect(JSON.stringify(note.content)).toContain('Daily')
      // The body is in the note's own document, which is what the editor binds.
      const content = await backend.readNoteContent(note.id)
      expect(JSON.stringify(content)).toContain('Daily')
      backend.destroy()
    })

    it('keeps templates independent of one another', async () => {
      const { backend } = await openBackend()
      await backend.createTemplate(template('a', 'A'))
      await backend.createTemplate(template('b', 'B'))

      await backend.deleteTemplate('a')

      expect(await backend.getTemplate('b')).toMatchObject({ name: 'B' })
      backend.destroy()
    })
  })

  describe('drawing payloads', () => {
    // The relay stores drawings as encrypted blobs; these exercise the pointer
    // that stands in for the local `draw-<id>-<stamp>.json` naming scheme.
    async function openWithAssetStore() {
      const store = new Map<string, Uint8Array>()
      let next = 0
      const { backend, calls } = await openBackend({
        uploadAsset: async (blob) => {
          const id = `asset-${++next}`
          store.set(id, blob)
          return { id }
        },
        fetchAsset: async (assetId) => {
          const bytes = store.get(assetId)
          if (!bytes) throw new Error('not found')
          return { bytes, contentType: 'application/json' }
        },
        deleteAsset: async (assetId) => { calls.deletedAssets.push(assetId); store.delete(assetId) },
      })
      return { backend, calls, store }
    }

    const payload = (text: string) => Array.from(new TextEncoder().encode(text))

    it('round-trips a payload through the encrypted asset store', async () => {
      const { backend } = await openWithAssetStore()

      const src = await backend.saveDrawAsset('draw-1', payload('{"strokes":[1]}'))

      expect(src.startsWith(CLOUD_ASSET_SCHEME)).toBe(true)
      const read = await backend.readDrawAsset(src)
      expect(new TextDecoder().decode(Uint8Array.from(read))).toBe('{"strokes":[1]}')
      backend.destroy()
    })

    it('stores nothing readable on the relay', async () => {
      const { backend, store } = await openWithAssetStore()
      await backend.saveDrawAsset('draw-1', payload('SECRET-STROKES'))

      const stored = [...store.values()][0]
      expect(new TextDecoder().decode(stored)).not.toContain('SECRET-STROKES')
      backend.destroy()
    })

    it('recovers the latest payload by drawing id when the src went stale', async () => {
      const { backend } = await openWithAssetStore()
      await backend.saveDrawAsset('draw-1', payload('first'))
      await backend.saveDrawAsset('draw-1', payload('second'))

      const latest = await backend.readLatestDrawAsset('draw-1')
      expect(new TextDecoder().decode(Uint8Array.from(latest))).toBe('second')
      backend.destroy()
    })

    it('deletes the blob it replaced, so repeated saves do not pile up', async () => {
      const { backend, calls, store } = await openWithAssetStore()
      const first = await backend.saveDrawAsset('draw-1', payload('first'))
      await backend.saveDrawAsset('draw-1', payload('second'))

      expect(calls.deletedAssets).toEqual([first.slice(CLOUD_ASSET_SCHEME.length)])
      expect(store.size).toBe(1)
      backend.destroy()
    })

    it('keeps drawings independent of one another', async () => {
      const { backend } = await openWithAssetStore()
      await backend.saveDrawAsset('draw-a', payload('alpha'))
      await backend.saveDrawAsset('draw-b', payload('beta'))

      const a = await backend.readLatestDrawAsset('draw-a')
      expect(new TextDecoder().decode(Uint8Array.from(a))).toBe('alpha')
      backend.destroy()
    })

    it('rejects an empty payload and an unknown drawing', async () => {
      const { backend } = await openWithAssetStore()

      await expect(backend.saveDrawAsset('draw-1', [])).rejects.toThrow('empty')
      await expect(backend.readLatestDrawAsset('never-drawn')).rejects.toThrow()
      backend.destroy()
    })
  })

  describe('full-text search', () => {
    const noteWithText = (base: Awaited<ReturnType<CloudBackend['createNote']>>, ...paragraphs: string[]) => ({
      ...base,
      content: {
        type: 'doc',
        content: paragraphs.map(text => ({ type: 'paragraph', content: [{ type: 'text', text }] })),
      },
    })

    /**
     * Saves the way the editor does: the body is written into the note's own
     * document first, and that document — not `note.content` — is what the
     * searchable text is derived from.
     */
    async function saveWithBody(
      backend: CloudBackend,
      base: Awaited<ReturnType<CloudBackend['createNote']>>,
      ...paragraphs: string[]
    ) {
      const note = noteWithText(base, ...paragraphs)
      const session = backend.getNoteSession(note.id)!
      const fragment = session.ydoc.getXmlFragment('prosemirror')
      fragment.delete(0, fragment.length)
      fragment.insert(0, paragraphs.map((text) => {
        const paragraph = new Y.XmlElement('paragraph')
        paragraph.insert(0, [new Y.XmlText(text)])
        return paragraph
      }))
      await backend.saveNote(note)
      return note
    }

    it('finds a match in a note body, not just its title', async () => {
      const { backend } = await openBackend()
      const note = await backend.createNote(null, 'Untitled', '📄')
      await saveWithBody(backend, note, 'intro line', 'the quick brown fox')

      const results = await backend.searchWorkspaceBlocks('brown fox')

      expect(results).toHaveLength(1)
      expect(results[0]).toMatchObject({
        type: 'block',
        noteId: note.id,
        noteTitle: 'Untitled',
        blockIndex: 1,
        id: `${note.id}:1`,
      })
      expect(results[0].snippet).toContain('brown fox')
      backend.destroy()
    })

    it('keeps the index in step with edits', async () => {
      const { backend } = await openBackend()
      const note = await backend.createNote(null, 'Note', '📄')
      await saveWithBody(backend, note, 'mentions alpha')
      expect(await backend.searchWorkspaceBlocks('alpha')).toHaveLength(1)

      await saveWithBody(backend, note, 'mentions beta instead')

      expect(await backend.searchWorkspaceBlocks('alpha')).toEqual([])
      expect(await backend.searchWorkspaceBlocks('beta')).toHaveLength(1)
      backend.destroy()
    })

    it('searches across notes and returns nothing for a blank query', async () => {
      const { backend } = await openBackend()
      const first = await backend.createNote(null, 'One', '📄')
      const second = await backend.createNote(null, 'Two', '📄')
      await saveWithBody(backend, first, 'shared keyword here')
      await saveWithBody(backend, second, 'another shared keyword')

      expect((await backend.searchWorkspaceBlocks('shared')).map(r => r.noteId).sort())
        .toEqual([first.id, second.id].sort())
      expect(await backend.searchWorkspaceBlocks('  ')).toEqual([])
      backend.destroy()
    })

    it('keeps the stored text when a save carries only metadata', async () => {
      // loadNote returns a placeholder body on cloud (the real one lives in the
      // note's own document), so a title-only save must not be read as "this
      // note is now empty".
      const { backend } = await openBackend()
      const note = await backend.createNote(null, 'Note', '📄')
      await saveWithBody(backend, note, 'findable body text')
      expect(await backend.searchWorkspaceBlocks('findable')).toHaveLength(1)

      const reloaded = await backend.loadNote(note.id)
      await backend.saveNote({ ...reloaded, title: 'Renamed' })

      expect(await backend.searchWorkspaceBlocks('findable')).toHaveLength(1)
      backend.destroy()
    })

    it('drops a note from the index when it is permanently deleted', async () => {
      const { backend } = await openBackend()
      const note = await backend.createNote(null, 'Note', '📄')
      await saveWithBody(backend, note, 'findable text')

      await backend.deleteNote(note.id)
      // Trashed notes are out of the tree, so they stop matching...
      expect(await backend.searchWorkspaceBlocks('findable')).toEqual([])
      await backend.permanentlyDeleteFromTrash(note.id)
      // ...and the purge clears the stored text too.
      expect(await backend.searchWorkspaceBlocks('findable')).toEqual([])
      backend.destroy()
    })

    it('indexes a note when it is opened, not only when it is saved', async () => {
      // Covers notes written on another device, or before indexing existed:
      // opening one is the moment its body is here for free.
      const { backend } = await openBackend()
      const note = await backend.createNote(null, 'Note', '\u{1F4C4}')

      const session = backend.getNoteSession(note.id)!
      const fragment = session.ydoc.getXmlFragment('prosemirror')
      const paragraph = new Y.XmlElement('paragraph')
      paragraph.insert(0, [new Y.XmlText('never explicitly saved')])
      fragment.insert(0, [paragraph])
      await session.whenSynced()
      await Promise.resolve()

      expect(await backend.searchWorkspaceBlocks('never explicitly')).toHaveLength(1)
      backend.destroy()
    })

    it('does not erase the index when a note document never syncs', async () => {
      // `whenSynced` resolves on its timeout too, leaving an empty document —
      // indexing that would wipe the note's text.
      const { backend } = await openBackend()
      const note = await backend.createNote(null, 'Note', '\u{1F4C4}')
      await saveWithBody(backend, note, 'text that must survive')
      backend.closeNoteSession()

      // A socket that never connects: the session resolves only by timing out.
      class DeadWebSocket {
        static readonly OPEN = 1
        readyState = 0
        binaryType = ''
        onopen: (() => void) | null = null
        onclose: (() => void) | null = null
        onerror: (() => void) | null = null
        onmessage: ((event: MessageEvent<ArrayBuffer>) => void) | null = null
        constructor(readonly url: string) {}
        send(): void {}
        close(): void {}
      }
      vi.stubGlobal('WebSocket', DeadWebSocket as unknown as typeof WebSocket)
      vi.useFakeTimers()
      try {
        const session = backend.getNoteSession(note.id)!
        const synced = session.whenSynced()
        await vi.advanceTimersByTimeAsync(9000)
        await synced
        await Promise.resolve()
      } finally {
        vi.useRealTimers()
      }

      expect(await backend.searchWorkspaceBlocks('must survive')).toHaveLength(1)
      backend.destroy()
    })

    it('ignores notes that have never been saved since indexing began', async () => {
      // Nothing can backfill without opening every note's document; those notes
      // remain findable by title through the separate entity search.
      const { backend } = await openBackend()
      await backend.createNote(null, 'Never saved', '📄')

      expect(await backend.searchWorkspaceBlocks('Never')).toEqual([])
      backend.destroy()
    })
  })

  describe('workspace history', () => {
    it('collects every note that has snapshots, skipping those without', async () => {
      const withHistory = new Set<string>()
      const { backend } = await openBackend({
        listSnapshots: async docId => withHistory.has(docId)
          ? [{ id: `${docId}-s1`, label: '', createdAt: '2026-08-01T10:00:00.000Z' }]
          : [],
      })
      const kept = await backend.createNote(null, 'Kept', '📄')
      await backend.createNote(null, 'Fresh', '📄')
      withHistory.add(kept.id)

      const all = await backend.listAllNoteSnapshots()

      expect(all).toHaveLength(1)
      expect(all[0].noteId).toBe(kept.id)
      expect(all[0].snapshots[0]).toMatchObject({ id: `${kept.id}-s1`, noteId: kept.id })
      backend.destroy()
    })

    it('reads a snapshot without touching the live note', async () => {
      // The history browser previews and diffs snapshots; only an explicit
      // restore may change the note.
      const snapshotDoc = new Y.Doc()
      const fragment = snapshotDoc.getXmlFragment('prosemirror')
      const paragraph = new Y.XmlElement('paragraph')
      paragraph.insert(0, [new Y.XmlText('archived text')])
      fragment.insert(0, [paragraph])
      const encoded = await encryptBytes(key, Y.encodeStateAsUpdate(snapshotDoc))
      snapshotDoc.destroy()

      const { backend } = await openBackend({ getSnapshot: async () => encoded })
      const note = await backend.createNote(null, 'Note', '📄')

      const loaded = await backend.loadNoteSnapshot(note.id, 'snap-1')

      expect(JSON.stringify(loaded.content)).toContain('archived text')
      expect(loaded.id).toBe(note.id)
      // The live document is untouched: reading it back still yields the note.
      expect((await backend.loadNote(note.id)).title).toBe('Note')
      backend.destroy()
    })

    it('serves the current note body for the comparison pane', async () => {
      const { backend } = await openBackend()
      const note = await backend.createNote(null, 'Note', '📄')

      const current = await backend.loadNoteWithContent(note.id)

      expect(current.id).toBe(note.id)
      expect(current.content).toBeTruthy()
      backend.destroy()
    })
  })

  describe('note properties', () => {
    const properties = {
      type: 'meeting' as const,
      tags: ['weekly', 'team'],
      date: '2026-08-03',
      status: 'active' as const,
    }

    it('round-trips properties and cover across a reload', async () => {
      const { backend } = await openBackend()
      const note = await backend.createNote(null, 'Standup', '📄')

      await backend.saveNote({ ...note, properties, cover: 'cloud-asset:cover-1' })

      const reloaded = await backend.loadNote(note.id)
      expect(reloaded.properties).toEqual(properties)
      expect(reloaded.cover).toBe('cloud-asset:cover-1')
      backend.destroy()
    })

    it('returns fully-formed empty properties for a note that has none', async () => {
      const { backend } = await openBackend()
      const note = await backend.createNote(null, 'Bare', '📄')

      const loaded = await backend.loadNote(note.id)

      expect(loaded.properties).toEqual({ type: null, tags: [], date: null, status: null })
      expect(loaded.cover).toBeUndefined()
      backend.destroy()
    })

    it('exposes properties to query_block filters', async () => {
      // Previously these were hardcoded to null, so every filter on them
      // matched nothing.
      const { backend } = await openBackend()
      const meeting = await backend.createNote(null, 'Standup', '📄')
      const idea = await backend.createNote(null, 'Spark', '📄')
      await backend.saveNote({ ...meeting, properties })
      await backend.saveNote({
        ...idea,
        properties: { type: 'idea', tags: ['later'], date: null, status: 'draft' },
      })

      const query = (filters: Partial<NoteQueryFilters>) =>
        backend.queryNotes({ filters: { ...emptyNoteQueryFilters(), ...filters }, sorts: [] })

      expect((await query({ noteType: 'meeting' })).map(r => r.noteId)).toEqual([meeting.id])
      expect((await query({ tagsAny: ['later'] })).map(r => r.noteId)).toEqual([idea.id])
      expect((await query({ status: 'draft' })).map(r => r.noteId)).toEqual([idea.id])
      expect((await query({ dateFrom: '2026-08-01', dateTo: '2026-08-31' })).map(r => r.noteId))
        .toEqual([meeting.id])
      backend.destroy()
    })

    it('surfaces tags in the sidebar previews', async () => {
      const { backend } = await openBackend()
      const note = await backend.createNote(null, 'Standup', '📄')
      await backend.saveNote({ ...note, properties })

      const previews = await backend.listSidebarNotePreviews()
      expect(previews[0].tags).toEqual(['weekly', 'team'])
      backend.destroy()
    })

    it('keeps properties for a trashed note and drops them on a permanent delete', async () => {
      const { backend } = await openBackend()
      const note = await backend.createNote(null, 'Standup', '📄')
      await backend.saveNote({ ...note, properties })

      await backend.deleteNote(note.id)
      await backend.restoreFromTrash(note.id)
      expect((await backend.loadNote(note.id)).properties).toEqual(properties)

      await backend.deleteNote(note.id)
      await backend.permanentlyDeleteFromTrash(note.id)
      expect((await backend.loadNote(note.id)).properties)
        .toEqual({ type: null, tags: [], date: null, status: null })
      backend.destroy()
    })

    it('keeps the properties of each note in its own key', async () => {
      const { backend } = await openBackend()
      const first = await backend.createNote(null, 'One', '📄')
      const second = await backend.createNote(null, 'Two', '📄')

      await backend.saveNote({ ...first, properties })
      await backend.saveNote({
        ...second,
        properties: { type: 'task', tags: [], date: null, status: 'done' },
      })

      expect((await backend.loadNote(first.id)).properties).toEqual(properties)
      expect((await backend.loadNote(second.id)).properties?.type).toBe('task')
      backend.destroy()
    })
  })

  describe('workspace identity', () => {
    /** The manifest as the settings panel hands it back after an edit. */
    function renamed(base: WorkspaceManifest, meta: Partial<{ name: string; glyph: string; gradient: string }>) {
      return { ...base, ...meta }
    }

    it('mirrors a rename onto the storage row', async () => {
      const { backend, calls } = await openBackend()
      const manifest = await backend.open()

      await backend.saveManifest(renamed(manifest, { name: 'Renamed' }))

      expect(calls.storageMeta).toEqual([{ name: 'Renamed', glyph: 'C', gradient: 'g' }])
      backend.destroy()
    })

    it('mirrors a glyph or gradient change too', async () => {
      const { backend, calls } = await openBackend()
      const manifest = await backend.open()

      await backend.saveManifest(renamed(manifest, { glyph: 'R', gradient: 'g2' }))

      expect(calls.storageMeta).toEqual([{ name: 'Cloud', glyph: 'R', gradient: 'g2' }])
      backend.destroy()
    })

    it('does not touch the storage row for ordinary manifest writes', async () => {
      // saveManifest also runs for reordering and sidebar order; those must not
      // fire a REST call on every keystroke-adjacent edit.
      const { backend, calls } = await openBackend()
      const manifest = await backend.open()

      await backend.saveManifest({ ...manifest, sidebarNoteOrder: ['a', 'b'] })
      await backend.saveManifest({ ...manifest, rootOrder: ['x'] })

      expect(calls.storageMeta).toEqual([])
      backend.destroy()
    })

    it('does not repeat the call once the row already matches', async () => {
      const { backend, calls } = await openBackend()
      const manifest = await backend.open()

      await backend.saveManifest(renamed(manifest, { name: 'Renamed' }))
      await backend.saveManifest(renamed(manifest, { name: 'Renamed' }))

      expect(calls.storageMeta).toHaveLength(1)
      backend.destroy()
    })

    it('keeps the local rename and retries on the next write when the row sync fails', async () => {
      const errors: unknown[] = []
      let failNext = true
      const { backend, calls } = await openBackend({
        updateStorageMeta: async (meta) => {
          if (failNext) {
            failNext = false
            throw new Error('offline')
          }
          calls.storageMeta.push({ ...meta })
        },
        onStorageMetaError: error => errors.push(error),
      })
      const manifest = await backend.open()

      // First attempt fails: reported, not thrown, and the manifest still holds
      // the new name.
      await expect(backend.saveManifest(renamed(manifest, { name: 'Renamed' }))).resolves.toBeUndefined()
      expect(errors).toHaveLength(1)
      expect(calls.storageMeta).toEqual([])

      // The next write retries it rather than leaving the row stale forever.
      await backend.saveManifest(renamed(manifest, { name: 'Renamed' }))
      expect(calls.storageMeta).toEqual([{ name: 'Renamed', glyph: 'C', gradient: 'g' }])
      backend.destroy()
    })
  })

  describe('folder deletion', () => {
    it('refuses a non-empty folder without recursive, leaving it intact', async () => {
      const { backend } = await openBackend()
      const folder = await backend.createFolder(null, 'Keep', '📁')
      const note = await backend.createNote(folder.id, 'Inside', '📄')

      await expect(backend.deleteFolder(folder.id)).rejects.toThrow(/not empty/)

      // Nothing was written: the folder and its note are still there.
      const previews = await backend.listSidebarNotePreviews()
      expect(previews.map(p => p.noteId)).toEqual([note.id])
      expect(previews[0].folderPath).toBe('Keep')
      backend.destroy()
    })

    it('removes an empty folder without recursive', async () => {
      const { backend } = await openBackend()
      const folder = await backend.createFolder(null, 'Empty', '📁')

      await expect(backend.deleteFolder(folder.id)).resolves.toBeUndefined()

      const diagnostics = await backend.getDiagnostics()
      expect(diagnostics.folderCount).toBe(0)
      backend.destroy()
    })

    it('moves every nested note to the trash, at any depth', async () => {
      const { backend } = await openBackend()
      const parent = await backend.createFolder(null, 'Parent', '📁')
      const child = await backend.createFolder(parent.id, 'Child', '📁')
      const shallow = await backend.createNote(parent.id, 'Shallow', '📄')
      const deep = await backend.createNote(child.id, 'Deep', '📄')

      await backend.deleteFolder(parent.id, true)

      // Gone from the tree...
      expect(await backend.listSidebarNotePreviews()).toEqual([])
      // ...but restorable, and restored to the root since the folder is gone.
      await backend.restoreFromTrash(deep.id)
      const previews = await backend.listSidebarNotePreviews()
      expect(previews.map(p => p.noteId)).toEqual([deep.id])
      expect(previews[0].folderPath).toBe('')
      expect(shallow.id).not.toBe(deep.id)
      backend.destroy()
    })

    it('purges the documents of folder-deleted notes when the trash is emptied', async () => {
      // The point of trashing them: a note dropped straight out of the manifest
      // would be unreachable here and its document would leak on the relay.
      const { backend, calls } = await openBackend()
      const folder = await backend.createFolder(null, 'Doomed', '📁')
      const first = await backend.createNote(folder.id, 'One', '📄')
      const second = await backend.createNote(folder.id, 'Two', '📄')

      await backend.deleteFolder(folder.id, true)
      await backend.emptyTrash()

      expect(calls.deletedDocuments.sort()).toEqual([first.id, second.id].sort())
      backend.destroy()
    })

    it('leaves no trash entry for the folder itself', async () => {
      const { backend, calls } = await openBackend()
      const folder = await backend.createFolder(null, 'Doomed', '📁')
      await backend.createNote(folder.id, 'One', '📄')

      await backend.deleteFolder(folder.id, true)
      await backend.emptyTrash()

      // Only the note was purged; no attempt to delete a document for the folder.
      expect(calls.deletedDocuments).toHaveLength(1)
      backend.destroy()
    })
  })

  it('deletes a cloud asset once its last reference goes away', async () => {
    const { backend, calls } = await openBackend()

    await expect(backend.deleteUnreferencedAsset(`${CLOUD_ASSET_SCHEME}asset-9`)).resolves.toBe(true)
    expect(calls.deletedAssets).toEqual(['asset-9'])
    backend.destroy()
  })

  it('ignores asset sources that are not cloud assets', async () => {
    const { backend, calls } = await openBackend()

    await expect(backend.deleteUnreferencedAsset('.nevo/assets/local.png')).resolves.toBe(false)
    expect(calls.deletedAssets).toEqual([])
    backend.destroy()
  })

  it('reports failure rather than throwing when an asset delete fails', async () => {
    const { backend } = await openBackend({
      deleteAsset: async () => { throw new Error('offline') },
    })

    await expect(backend.deleteUnreferencedAsset(`${CLOUD_ASSET_SCHEME}asset-9`)).resolves.toBe(false)
    backend.destroy()
  })

  it('prunes history for every known note and totals what was removed', async () => {
    const { backend, calls } = await openBackend()
    const first = await backend.createNote(null, 'One', '📄')
    const second = await backend.createNote(null, 'Two', '📄')

    const report = await backend.pruneSnapshots(5)

    expect(calls.pruned.map(p => p.docId).sort()).toEqual([first.id, second.id].sort())
    expect(calls.pruned.every(p => p.keep === 5)).toBe(true)
    expect(report.removedFiles).toBe(6) // 3 per note
    backend.destroy()
  })

  it('survives a note whose prune request fails', async () => {
    const { backend } = await openBackend({
      pruneSnapshots: async () => { throw new Error('offline') },
    })
    await backend.createNote(null, 'One', '📄')

    await expect(backend.pruneSnapshots(5)).resolves.toEqual({ removedFiles: 0, bytesFreed: 0 })
    backend.destroy()
  })
})

describe('CloudBackend save-path regressions', () => {
  it('PROBE: does a metadata-only save wipe the search index?', async () => {
    const { openBackend } = globalThis as never as { openBackend: never }
    void openBackend
  })
})
