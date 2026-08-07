// CloudBackend: a server-hosted workspace. The folder/note tree (manifest) is a
// live Yjs document on the relay; each note's content is its own Yjs document.
// Implements the same WorkspaceBackend interface as LocalBackend so the shell is
// backend-agnostic. E2E: all content is encrypted client-side with the storage DEK.

import * as Y from 'yjs'
import type { Awareness } from 'y-protocols/awareness'
import { encryptBytes, decryptBytes } from '../../../editor-core/collaboration/encryption'
import type {
  WorkspaceManifest, WorkspaceSettings, WorkspaceDiagnostics, WorkspaceCleanupReport, PluginManifest, MarketplaceCatalog,
} from '../../../types/workspace'
import type { FolderMeta, NoteMeta, NoteDocument, NoteProperties, NoteSnapshotMeta, BlockNode, ImportedImageAsset, SidebarNotePreview } from '../../../types/note'
import type { WorkspaceBlockSearchItem } from '../../../types/search'
import type { BacklinkRef, GraphEdge, ExtractedEdge } from '../../../types/graph'
import type { NoteQueryRequest, NoteRow } from '../../../types/note-query'
import type { TemplateFieldValues } from '../../../types/template'
import { createDefaultWorkspaceSettings } from '../../../utils/workspace-settings'
import { buildSidebarPreviewText, normalizeSidebarTags } from '../../../utils/sidebar/sidebarNotePreviews'
import { filterAndSortNotes } from '../../../features/query/noteQueryFilter'
import type { WorkspaceBackend, WorkspaceHandle, KanbanBoardUpdate, KanbanCardUpdate } from '../types'
import type { CloudDocument } from '../../../types/cloud'
import type { KanbanBoard, KanbanCard, KanbanPropertyDef } from '../../../types/kanban'
import type { DatabaseRepository } from '../../../features/database/databaseRepository'
import { CloudSession, CLOUD_LOCAL_ORIGIN } from './session'
import { nullOfflineCache, type OfflineDocCache } from './offlineCache'
import { CloudDatabaseRepository } from './cloudDatabaseRepository'
import {
  readNoteMetadata, readAllNoteMetadata, writeNoteMetadata, deleteNoteMetadata,
} from './noteMetadataOps'
import { readSearchIndex, writeSearchIndex, deleteSearchIndex } from './searchIndexOps'
import { readDrawAssetId, writeDrawAssetId } from './drawAssetOps'
import { readUserTemplate, readUserTemplates, writeUserTemplate, deleteUserTemplate } from './templateOps'
import { templateCommands, workspaceCommands } from '../../../tauri/commands'
import { createYDocFromContent } from '../../../editor-core/collaboration'
import type { TemplateDocument } from '../../../types/template'
import { flattenNoteBlocks, searchBlocks, type BlockSearchSource } from '../../search/blockSearch'
import * as kb from './kanbanOps'
import { manifestMap, readManifest, emptyManifest, writeManifest, mutateManifest, plainClone } from './manifest'
import * as ops from './manifestOps'
import { yDocToProsemirrorJSON } from 'y-prosemirror'
import { hardRestoreKnownNoteTypes, Y_FRAGMENT_NAME } from '../../../editor-core/collaboration'
import { nevoBaseSchema } from '../../../editor-core/schema'

const EMPTY_CONTENT: BlockNode = { type: 'doc', content: [{ type: 'paragraph' }] }

/** Fills in every property field, so callers never see a partially stored one. */
function emptyProperties(properties?: NoteProperties): NoteProperties {
  return {
    type: properties?.type ?? null,
    tags: normalizeSidebarTags(properties?.tags),
    date: properties?.date ?? null,
    status: properties?.status ?? null,
  }
}
const SETTINGS_KEY = 'settings'
const SIDEBAR_PREVIEWS_KEY = 'sidebar_note_previews'

/** Asset src scheme for cloud storages (vs local `.nevo/assets/...`). */
export const CLOUD_ASSET_SCHEME = 'cloud-asset:'

const MIME_BY_EXT: Record<string, string> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
  webp: 'image/webp', svg: 'image/svg+xml', mp4: 'video/mp4', webm: 'video/webm',
  mp3: 'audio/mpeg', ogg: 'audio/ogg', wav: 'audio/wav', pdf: 'application/pdf',
}
function mimeFromName(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  return MIME_BY_EXT[ext] ?? 'application/octet-stream'
}

/** The workspace fields duplicated between the Yjs manifest and the storage row. */
export interface StorageIdentity {
  name: string
  glyph: string
  gradient: string
}

function sameIdentity(a: StorageIdentity, b: StorageIdentity): boolean {
  return a.name === b.name && a.glyph === b.glyph && a.gradient === b.gradient
}

export interface CloudBackendDeps {
  storageId: string
  name: string
  glyph: string
  gradient: string
  manifestRoom: string
  key: CryptoKey
  /** Resolves a currently-valid access token; see CloudSessionOptions.getToken. */
  getToken: () => Promise<string | null>
  wsBase: string
  listDocuments: (storageId: string) => Promise<CloudDocument[]>
  createDocument: (storageId: string) => Promise<CloudDocument>
  /** Mirrors the workspace's name/glyph/gradient onto the storage row, which is
   *  what the start screen lists before a workspace is opened. */
  updateStorageMeta: (meta: StorageIdentity) => Promise<void>
  /** Reports a failed storage-row sync; the local rename still stands. */
  onStorageMetaError?: (error: unknown) => void
  /** Permanently removes a note document server-side (state, updates, history). */
  deleteDocument: (docId: string) => Promise<void>
  // History (encrypted snapshot blobs); docId is the note id.
  listSnapshots: (docId: string) => Promise<Array<{ id: string; label: string; createdAt: string }>>
  createSnapshot: (docId: string, blob: Uint8Array, label: string) => Promise<unknown>
  getSnapshot: (snapshotId: string) => Promise<Uint8Array>
  /** Keeps the newest `keep` snapshots of a document; returns how many went. */
  pruneSnapshots: (docId: string, keep: number) => Promise<{ deleted: number }>
  // Encrypted assets: the relay stores ciphertext + a plaintext content type.
  uploadAsset: (blob: Uint8Array, contentType: string) => Promise<{ id: string }>
  fetchAsset: (assetId: string) => Promise<{ bytes: Uint8Array; contentType: string }>
  deleteAsset: (assetId: string) => Promise<void>
  onManifest: (manifest: WorkspaceManifest) => void
  /** Local durability for offline edits; omitted in tests / non-browser hosts. */
  cache?: OfflineDocCache
  /** A relay message could not be decrypted in `roomCode`; that session will
   *  not compact the relay's state. Hosts surface/log this. */
  onIntegrityError?: (roomCode: string) => void
}

export interface CloudNoteSession {
  readonly ydoc: Y.Doc
  readonly awareness: Awareness
  /** True only when the relay confirmed a complete, decryptable initial state. */
  readonly hasCompleteRelayState: boolean
  whenSynced: (timeoutMs?: number) => Promise<void>
}

/** Cached room state older than this is dropped when a workspace opens. */
const OFFLINE_CACHE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000

export class CloudBackend implements WorkspaceBackend {
  readonly handle: WorkspaceHandle
  private readonly d: CloudBackendDeps
  private manifestSession!: CloudSession
  private map!: Y.Map<WorkspaceManifest>
  private docRooms = new Map<string, string>() // noteId -> roomCode
  private noteSession: { id: string; session: CloudSession } | null = null
  private assetCache = new Map<string, string>() // asset src -> object URL
  private readonly databases: DatabaseRepository
  /** Last identity known to be on the storage row, so an ordinary manifest
   *  write (a rename of a note, a reorder) does not trigger a REST call. */
  private identity: StorageIdentity
  /** Device-local directory holding this storage's plugins; see pluginWorkspacePath. */
  private pluginRoot: string | null = null

  constructor(deps: CloudBackendDeps) {
    this.d = deps
    this.handle = { kind: 'cloud', storageId: deps.storageId }
    this.identity = { name: deps.name, glyph: deps.glyph, gradient: deps.gradient }
    // Lazy Y.Doc lookup: the manifest session only exists after open().
    this.databases = new CloudDatabaseRepository(() => this.manifestSession?.ydoc ?? null)
  }

  /** Database-block rows live in the manifest doc — see cloudDatabaseRepository. */
  databaseRepository(): DatabaseRepository {
    return this.databases
  }

  // --- lifecycle ---

  /** Shared session options: local durability + degraded-sync reporting. */
  private sessionDeps(roomCode: string) {
    return {
      key: this.d.key,
      getToken: this.d.getToken,
      wsBase: this.d.wsBase,
      cache: this.d.cache ?? nullOfflineCache,
      onIntegrityError: () => this.d.onIntegrityError?.(roomCode),
    }
  }

  async open(): Promise<WorkspaceManifest> {
    // Fire-and-forget: stale rooms (left storages, deleted notes) should not
    // sit in local storage forever, but this must not delay opening.
    void (this.d.cache ?? nullOfflineCache).prune(OFFLINE_CACHE_MAX_AGE_MS)

    // Plugins are device-local, so this resolves a directory on this machine.
    // A failure only costs plugin support, never the workspace itself.
    try {
      this.pluginRoot = await workspaceCommands.cloudPluginRoot(this.d.storageId)
    } catch {
      this.pluginRoot = null
    }

    this.manifestSession = new CloudSession({
      roomCode: this.d.manifestRoom, ...this.sessionDeps(this.d.manifestRoom),
    })
    this.map = manifestMap(this.manifestSession.ydoc)
    await this.manifestSession.whenSynced()

    // Register the persistent observer BEFORE reading so that late-arriving state
    // updates (applied after MSG_SYNC_DONE due to async decryptBytes) are pushed
    // to the store via onManifest, even if readManifest() initially returns null.
    this.map.observeDeep((_events, transaction) => {
      if (transaction.origin === CLOUD_LOCAL_ORIGIN) return
      const snap = readManifest(this.map)
      if (snap) this.d.onManifest(snap)
    })

    let manifest = readManifest(this.map)
    if (!manifest) {
      // The relay may have sent the full state but async decryption hasn't
      // applied it yet.  Wait a short grace period before concluding this is a
      // brand-new workspace and writing an empty manifest (which could overwrite
      // the real one if it arrives late).
      manifest = await this._waitForManifest(2000)
      if (!manifest) {
        manifest = emptyManifest(this.d.storageId, this.d.name, this.d.glyph, this.d.gradient)
        writeManifest(this.manifestSession.ydoc, this.map, manifest)
      }
    }

    try {
      const docs = await this.d.listDocuments(this.d.storageId)
      for (const doc of docs) if (doc.kind === 'note') this.docRooms.set(doc.id, doc.roomCode)
    } catch { /* offline — tree still renders */ }

    return manifest
  }

  private _waitForManifest(timeoutMs: number): Promise<WorkspaceManifest | null> {
    return new Promise((resolve) => {
      const poll = setInterval(() => {
        const snap = readManifest(this.map)
        if (snap) { clearTimeout(timer); clearInterval(poll); resolve(snap) }
      }, 50)
      const timer = setTimeout(() => {
        clearInterval(poll)
        resolve(readManifest(this.map))
      }, timeoutMs)
    })
  }

  /**
   * Writes the manifest and, when the workspace's own name/glyph/gradient
   * changed, mirrors them onto the storage row.
   *
   * The guard matters: saveManifest also runs for ordinary tree edits
   * (reordering, sidebar order), and those must not fire a REST call. A failed
   * mirror is not fatal — the rename already holds locally and syncs to other
   * members through the manifest document — so it is reported and `identity`
   * is left behind, which makes the next manifest write retry it.
   */
  async saveManifest(manifest: WorkspaceManifest): Promise<void> {
    writeManifest(this.manifestSession.ydoc, this.map, manifest)

    const next: StorageIdentity = { name: manifest.name, glyph: manifest.glyph, gradient: manifest.gradient }
    if (sameIdentity(next, this.identity)) return
    try {
      await this.d.updateStorageMeta(next)
      this.identity = next
    } catch (error) {
      this.d.onStorageMetaError?.(error)
    }
  }

  destroy(): void {
    this.closeNoteSession()
    this.manifestSession?.destroy()
    for (const url of this.assetCache.values()) URL.revokeObjectURL(url)
    this.assetCache.clear()
  }

  // --- settings (stored in the manifest doc so they sync) ---

  loadSettings(): Promise<WorkspaceSettings> {
    const stored = this.manifestSession?.ydoc.getMap('meta').get(SETTINGS_KEY) as WorkspaceSettings | undefined
    return Promise.resolve(stored ? plainClone(stored) : createDefaultWorkspaceSettings())
  }
  saveSettings(settings: WorkspaceSettings): Promise<void> {
    this.manifestSession.ydoc.getMap('meta').set(SETTINGS_KEY, plainClone(settings))
    return Promise.resolve()
  }
  loadCustomCss(): Promise<string> {
    const stored = this.manifestSession?.ydoc.getMap('meta').get('custom_css') as string | undefined
    return Promise.resolve(stored ?? '')
  }
  saveCustomCss(css: string): Promise<void> {
    this.manifestSession.ydoc.getMap('meta').set('custom_css', css)
    return Promise.resolve()
  }

  // --- folders ---

  createFolder(parentId: string | null, title: string, icon: string): Promise<FolderMeta> {
    const { result } = mutateManifest(this.manifestSession.ydoc, this.map, m => ops.addFolder(m, parentId, title, icon))
    return Promise.resolve(result)
  }
  renameFolder(folderId: string, title: string): Promise<void> {
    mutateManifest(this.manifestSession.ydoc, this.map, m => ops.renameFolder(m, folderId, title))
    return Promise.resolve()
  }
  /** Rejects a non-empty folder unless `recursive`; nested notes go to the
   *  trash so they stay restorable and their documents stay purgeable. */
  async deleteFolder(folderId: string, recursive = false): Promise<void> {
    // A throw from the mutator propagates before the manifest is written, so a
    // refused delete leaves the tree untouched.
    mutateManifest(this.manifestSession.ydoc, this.map, m => ops.removeFolder(m, folderId, recursive))
  }

  // --- notes ---

  async createNote(folderId: string | null, title: string, icon: string): Promise<NoteDocument> {
    const doc = await this.d.createDocument(this.d.storageId)
    this.docRooms.set(doc.id, doc.roomCode)
    mutateManifest(this.manifestSession.ydoc, this.map, m => ops.addNote(m, doc.id, folderId, title, icon))
    const now = new Date().toISOString()
    return { id: doc.id, title, icon, folderId, createdAt: now, updatedAt: now, properties: { type: null, tags: [], date: null, status: null }, content: structuredClone(EMPTY_CONTENT) }
  }
  /**
   * Creates a note and seeds its document with the resolved template body.
   *
   * The local backend has a single Rust command that resolves and writes the
   * note file in one step; a cloud note's body lives in its own collaborative
   * document, so the two halves are separate here — the placeholder resolution
   * still runs in the same Rust code rather than a second implementation.
   */
  async createNoteFromTemplate(
    templateId: string, folderId: string | null, title: string, icon: string, fieldValues: TemplateFieldValues,
  ): Promise<NoteDocument> {
    const template = await this.getTemplate(templateId)
    const manifest = readManifest(this.map)
    const content = await templateCommands.resolveContent(template, title, manifest?.name ?? '', fieldValues)

    const note = await this.createNote(folderId, title, icon)
    const session = this.getNoteSession(note.id)
    if (session) {
      await session.whenSynced()
      // The document was just created, so seeding it cannot overwrite anything.
      const seed = createYDocFromContent(nevoBaseSchema, content)
      Y.applyUpdate(session.ydoc, Y.encodeStateAsUpdate(seed), CLOUD_LOCAL_ORIGIN)
      seed.destroy()
    }
    return { ...note, content }
  }

  // --- templates (built-ins from the backend, user ones in the manifest doc) ---

  async listTemplates(): Promise<TemplateDocument[]> {
    const builtIns = await templateCommands.listTemplates(null)
    return [...builtIns, ...readUserTemplates(this.manifestSession.ydoc)]
  }

  async getTemplate(templateId: string): Promise<TemplateDocument> {
    const stored = readUserTemplate(this.manifestSession.ydoc, templateId)
    if (stored) return stored
    return templateCommands.getTemplate(null, templateId)
  }

  createTemplate(template: TemplateDocument): Promise<TemplateDocument> {
    writeUserTemplate(this.manifestSession.ydoc, template)
    return Promise.resolve({ ...template, builtIn: false })
  }

  updateTemplate(templateId: string, template: TemplateDocument): Promise<TemplateDocument> {
    // An edit may rename the id; drop the old key so it does not linger.
    if (templateId !== template.id) deleteUserTemplate(this.manifestSession.ydoc, templateId)
    writeUserTemplate(this.manifestSession.ydoc, template)
    return Promise.resolve({ ...template, builtIn: false })
  }

  deleteTemplate(templateId: string): Promise<void> {
    deleteUserTemplate(this.manifestSession.ydoc, templateId)
    return Promise.resolve()
  }
  loadNote(noteId: string): Promise<NoteDocument> {
    // Content is served live via the note's Yjs session (see getNoteSession);
    // here we return the meta from the manifest with a placeholder body.
    const snap = readManifest(this.map)
    const meta = snap ? ops.findNote(snap, noteId) : null
    const stored = readNoteMetadata(this.manifestSession.ydoc, noteId)
    const now = new Date().toISOString()
    return Promise.resolve({
      id: noteId,
      title: meta?.title ?? 'Untitled',
      icon: meta?.icon ?? '📄',
      cover: stored.cover,
      folderId: meta?.folderId ?? null,
      createdAt: meta?.updatedAt ?? now,
      updatedAt: meta?.updatedAt ?? now,
      properties: emptyProperties(stored.properties),
      content: structuredClone(EMPTY_CONTENT),
    })
  }
  /** The note's body straight from its live document, or null when no session
   *  for it is open. The document is the source of truth for content. */
  private liveNoteContent(noteId: string): BlockNode | null {
    if (this.noteSession?.id !== noteId) return null
    try {
      return yDocToProsemirrorJSON(this.noteSession.session.ydoc, Y_FRAGMENT_NAME) as BlockNode
    } catch {
      return null
    }
  }

  /** loadNote plus the body from the note's own document — see the interface. */
  async loadNoteWithContent(noteId: string): Promise<NoteDocument> {
    const [meta, content] = await Promise.all([this.loadNote(noteId), this.readNoteContent(noteId)])
    return content ? { ...meta, content } : meta
  }
  saveNote(note: NoteDocument): Promise<void> {
    // Content auto-syncs through the live Yjs session; only meta lives in the manifest.
    mutateManifest(this.manifestSession.ydoc, this.map, m => ops.updateNoteMeta(m, note.id, { title: note.title, icon: note.icon }))
    // Properties and cover are note-level fields the shell reads without
    // opening the body, so they cannot live in the note's own document.
    writeNoteMetadata(this.manifestSession.ydoc, note.id, {
      properties: emptyProperties(note.properties),
      cover: note.cover,
    })
    // Text derived from the body is read off the note's own document, never off
    // `note.content`: `loadNote` hands back a placeholder body, and so does a
    // snapshot restore until the editor re-syncs, so trusting it would let a
    // rename be read as "this note is now empty" and wipe the note's searchable
    // text. With no live document there is nothing authoritative to derive
    // from, and the stored text is left as it is.
    const body = this.liveNoteContent(note.id)
    if (body) {
      // The relay cannot index encrypted bodies, so the searchable text is kept
      // here and refreshed whenever the real body is in hand (searchWorkspaceBlocks).
      writeSearchIndex(this.manifestSession.ydoc, note.id, flattenNoteBlocks(body))
    }

    const cache = this.readSidebarPreviewCache()
    this.writeSidebarPreviewCache({
      ...cache,
      [note.id]: {
        noteId: note.id,
        title: note.title,
        icon: note.icon,
        folderPath: '',
        updatedAt: note.updatedAt,
        tags: normalizeSidebarTags(note.properties?.tags),
        previewText: body ? buildSidebarPreviewText(body) : cache[note.id]?.previewText ?? '',
      },
    })
    return Promise.resolve()
  }
  deleteNote(noteId: string): Promise<void> {
    mutateManifest(this.manifestSession.ydoc, this.map, m => ops.trashNote(m, noteId))
    const cache = this.readSidebarPreviewCache()
    delete cache[noteId]
    this.writeSidebarPreviewCache(cache)
    return Promise.resolve()
  }
  moveNote(noteId: string, targetFolderId: string | null): Promise<void> {
    mutateManifest(this.manifestSession.ydoc, this.map, m => ops.moveNote(m, noteId, targetFolderId))
    return Promise.resolve()
  }

  /** Walks the manifest tree once, pairing every note with its folder path
   *  string (`'Parent / Child'`). Shared by listSidebarNotePreviews (sidebar
   *  rendering) and queryNotes (cross-note query_block filtering). */
  private collectNoteMetas(snap: WorkspaceManifest): Array<{ meta: NoteMeta; folderPath: string }> {
    const out: Array<{ meta: NoteMeta; folderPath: string }> = []
    snap.rootNotes.forEach(note => out.push({ meta: note, folderPath: '' }))
    const walk = (folders: FolderMeta[], parents: string[]) => {
      for (const folder of folders) {
        const path = [...parents, folder.title]
        folder.notes.forEach(note => out.push({ meta: note, folderPath: path.join(' / ') }))
        walk(folder.children, path)
      }
    }
    walk(snap.tree, [])
    return out
  }

  listSidebarNotePreviews(): Promise<SidebarNotePreview[]> {
    const snap = readManifest(this.map)
    if (!snap) return Promise.resolve([])
    const cache = this.readSidebarPreviewCache()
    const metadata = readAllNoteMetadata(this.manifestSession.ydoc)
    const previews = this.collectNoteMetas(snap).map(({ meta, folderPath }): SidebarNotePreview => {
      const cached = cache[meta.id]
      return {
        noteId: meta.id,
        title: cached?.title ?? meta.title,
        icon: cached?.icon ?? meta.icon,
        folderPath,
        updatedAt: cached?.updatedAt ?? meta.updatedAt,
        // Stored properties are authoritative for tags; the preview cache only
        // mirrors them for notes saved before this device synced.
        tags: normalizeSidebarTags(metadata[meta.id]?.properties?.tags ?? cached?.tags),
        previewText: cached?.previewText ?? '',
      }
    })
    return Promise.resolve(previews)
  }

  // --- cross-note query (query_block) ---

  /**
   * Cloud storages have no SQLite note index (queried server-side for local
   * workspaces): this enumerates notes from the live manifest plus the stored
   * per-note metadata and filters/sorts client-side with the same semantics as
   * the Rust `query_notes` command.
   */
  queryNotes(request: NoteQueryRequest): Promise<NoteRow[]> {
    const snap = readManifest(this.map)
    if (!snap) return Promise.resolve([])
    const cache = this.readSidebarPreviewCache()
    const metadata = readAllNoteMetadata(this.manifestSession.ydoc)
    const rows: NoteRow[] = this.collectNoteMetas(snap).map(({ meta, folderPath }): NoteRow => {
      const cached = cache[meta.id]
      const properties = emptyProperties(metadata[meta.id]?.properties)
      return {
        noteId: meta.id,
        title: cached?.title ?? meta.title,
        icon: cached?.icon ?? meta.icon,
        folderId: meta.folderId,
        folderPath,
        noteType: properties.type,
        status: properties.status,
        date: properties.date,
        // No separate creation timestamp is tracked in the cloud manifest;
        // updatedAt is the closest available value for both timestamp fields.
        createdAt: meta.updatedAt,
        updatedAt: cached?.updatedAt ?? meta.updatedAt,
        tags: properties.tags,
      }
    })
    return Promise.resolve(filterAndSortNotes(rows, request))
  }

  private readSidebarPreviewCache(): Record<string, SidebarNotePreview> {
    return plainClone(this.manifestSession?.ydoc.getMap<Record<string, SidebarNotePreview>>('meta').get(SIDEBAR_PREVIEWS_KEY) ?? {})
  }

  private writeSidebarPreviewCache(cache: Record<string, SidebarNotePreview>): void {
    this.manifestSession.ydoc.getMap<Record<string, SidebarNotePreview>>('meta').set(SIDEBAR_PREVIEWS_KEY, plainClone(cache))
  }

  // --- note sessions (used by the editor for live, real-time content) ---

  /** Open (or reuse) the live Yjs session for a note's content. */
  getNoteSession(noteId: string): CloudNoteSession | null {
    const room = this.docRooms.get(noteId)
    if (!room) return null
    if (this.noteSession?.id !== noteId) {
      this.closeNoteSession()
      const session = new CloudSession({ roomCode: room, ...this.sessionDeps(room) })
      this.noteSession = { id: noteId, session }
      // Opening a note is the one moment its body is here for free, so index it
      // then too — otherwise a note that has not been saved since indexing began
      // (or was written entirely on another device) never becomes searchable.
      void session.whenSynced().then(() => {
        // `whenSynced` also resolves on its timeout, which leaves an empty
        // document; indexing that would erase the note's text.
        if (!session.synced || this.noteSession?.session !== session) return
        const body = this.liveNoteContent(noteId)
        if (body) writeSearchIndex(this.manifestSession.ydoc, noteId, flattenNoteBlocks(body))
      }).catch(() => { /* indexing is opportunistic */ })
    }
    const session = this.noteSession.session
    return {
      ydoc: session.ydoc,
      awareness: session.awareness,
      get hasCompleteRelayState() { return session.hasCompleteRelayState },
      whenSynced: (timeoutMs?: number) => session.whenSynced(timeoutMs),
    }
  }
  closeNoteSession(): void {
    if (this.noteSession) {
      // Capture a history snapshot of the note as we leave it (fire-and-forget).
      void this._snapshotNote(this.noteSession.id, this.noteSession.session.ydoc)
      this.noteSession.session.destroy()
      this.noteSession = null
    }
  }

  private async _snapshotNote(noteId: string, ydoc: Y.Doc): Promise<void> {
    try {
      const state = Y.encodeStateAsUpdate(ydoc)
      const enc = await encryptBytes(this.d.key, state)
      await this.d.createSnapshot(noteId, enc, '')
    } catch { /* non-critical */ }
  }

  // --- assets (encrypted) ---

  async importImageAsset(fileName: string, bytes: number[]): Promise<ImportedImageAsset> {
    const raw = Uint8Array.from(bytes)
    const contentType = mimeFromName(fileName)
    const enc = await encryptBytes(this.d.key, raw)
    const { id } = await this.d.uploadAsset(enc, contentType)
    const src = `${CLOUD_ASSET_SCHEME}${id}`
    // Cache an object URL from the original bytes so it renders immediately.
    this.assetCache.set(src, URL.createObjectURL(new Blob([raw.slice().buffer], { type: contentType })))
    return { src, hash: id, deduplicated: false, bytes: raw.length }
  }

  async importImageFromUrl(url: string): Promise<ImportedImageAsset> {
    // No Rust downloader for cloud; fetch in the webview (subject to CORS) and
    // upload the encrypted bytes like any other pasted image.
    const response = await fetch(url)
    if (!response.ok) throw new Error(`Download failed: HTTP ${response.status}`)
    const buffer = await response.arrayBuffer()
    const fileName = (url.split(/[?#]/)[0] ?? url).split('/').pop() || 'image.png'
    return this.importImageAsset(fileName, Array.from(new Uint8Array(buffer)))
  }

  /** Synchronous cache lookup for a resolved asset object URL (or null). */
  assetUrl(src: string): string | null {
    return this.assetCache.get(src) ?? null
  }

  /** Fetch + decrypt a cloud asset's raw bytes. Used by export, which has to
   *  hand the file contents to Rust — there is no path it could read instead. */
  async readAssetBytes(src: string): Promise<{ bytes: Uint8Array; contentType: string } | null> {
    if (!src.startsWith(CLOUD_ASSET_SCHEME)) return null
    try {
      const { bytes, contentType } = await this.d.fetchAsset(src.slice(CLOUD_ASSET_SCHEME.length))
      return { bytes: await decryptBytes(this.d.key, bytes), contentType }
    } catch {
      return null
    }
  }

  /**
   * Reads a note's content without disturbing the editor's live session.
   *
   * Cloud note bodies live in per-note Yjs documents, so `loadNote` returns
   * only metadata; anything that needs the actual content (export) has to sync
   * the document. The open note is served from its existing session; any other
   * note gets a throwaway one that is torn down immediately, and deliberately
   * not routed through `getNoteSession`, which would evict the editor's.
   */
  async readNoteContent(noteId: string): Promise<BlockNode | null> {
    const room = this.docRooms.get(noteId)
    if (!room) return null
    const live = this.noteSession?.id === noteId ? this.noteSession.session : null
    const session = live ?? new CloudSession({ roomCode: room, ...this.sessionDeps(room) })
    try {
      await session.whenSynced()
      return yDocToProsemirrorJSON(session.ydoc, Y_FRAGMENT_NAME) as BlockNode
    } catch {
      return null
    } finally {
      if (!live) session.destroy()
    }
  }

  /** Fetch + decrypt a cloud asset into a cached object URL. */
  async prefetchAsset(src: string): Promise<void> {
    if (this.assetCache.has(src) || !src.startsWith(CLOUD_ASSET_SCHEME)) return
    try {
      const id = src.slice(CLOUD_ASSET_SCHEME.length)
      const { bytes, contentType } = await this.d.fetchAsset(id)
      const plain = await decryptBytes(this.d.key, bytes)
      this.assetCache.set(src, URL.createObjectURL(new Blob([plain.slice().buffer], { type: contentType })))
    } catch { /* leave unresolved */ }
  }

  // --- snapshots / history ---

  /**
   * History for every note in the storage.
   *
   * The relay indexes snapshots per document, so this fans out one request per
   * note. Concurrency is capped: a large storage would otherwise open hundreds
   * of sockets at once when the history browser is opened.
   */
  async listAllNoteSnapshots(): Promise<Array<{ noteId: string; snapshots: NoteSnapshotMeta[] }>> {
    const noteIds = [...this.docRooms.keys()]
    const out: Array<{ noteId: string; snapshots: NoteSnapshotMeta[] }> = []
    const CONCURRENCY = 8
    let cursor = 0
    const worker = async () => {
      while (cursor < noteIds.length) {
        const noteId = noteIds[cursor++]
        const snapshots = await this.listNoteSnapshots(noteId)
        if (snapshots.length) out.push({ noteId, snapshots })
      }
    }
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, noteIds.length) }, worker))
    return out
  }

  /** A snapshot's content, decrypted and replayed into a throwaway document so
   *  the live note is untouched (unlike restoreNoteSnapshot). */
  async loadNoteSnapshot(noteId: string, snapshotId: string): Promise<NoteDocument> {
    const meta = await this.loadNote(noteId)
    const enc = await this.d.getSnapshot(snapshotId)
    const update = await decryptBytes(this.d.key, enc)
    const snapshot = new Y.Doc()
    try {
      Y.applyUpdate(snapshot, update)
      return { ...meta, content: yDocToProsemirrorJSON(snapshot, Y_FRAGMENT_NAME) as BlockNode }
    } finally {
      snapshot.destroy()
    }
  }

  async listNoteSnapshots(noteId: string): Promise<NoteSnapshotMeta[]> {
    try {
      const list = await this.d.listSnapshots(noteId)
      return list.map(s => ({ id: s.id, noteId, createdAt: s.createdAt, updatedAt: s.createdAt }))
    } catch {
      return []
    }
  }

  async restoreNoteSnapshot(noteId: string, snapshotId: string): Promise<NoteDocument> {
    try {
      const enc = await this.d.getSnapshot(snapshotId)
      const update = await decryptBytes(this.d.key, enc)
      const session = this.getNoteSession(noteId)
      if (session) {
        await session.whenSynced()
        const snapshot = new Y.Doc()
        Y.applyUpdate(snapshot, update)
        // Touch the fragment before replacement so malformed snapshot state
        // fails without mutating the live note.
        snapshot.getXmlFragment(Y_FRAGMENT_NAME)
        hardRestoreKnownNoteTypes(session.ydoc, snapshot, nevoBaseSchema, CLOUD_LOCAL_ORIGIN)
        snapshot.destroy()
      }
    } catch { /* non-critical */ }
    return this.loadNote(noteId)
  }
  restoreFromTrash(itemId: string): Promise<void> {
    mutateManifest(this.manifestSession.ydoc, this.map, m => ops.restoreTrash(m, itemId))
    return Promise.resolve()
  }

  /**
   * Purges a trashed item. Deleting a note is a soft delete in the manifest —
   * the server document survives so it can be restored — so this is the point
   * at which the document, its update log, and its history are really removed.
   * The manifest entry is dropped first: the user asked for the item to be
   * gone, and a server-side failure must not resurrect it in the trash.
   */
  async permanentlyDeleteFromTrash(itemId: string): Promise<void> {
    const { result: wasNote } = mutateManifest(this.manifestSession.ydoc, this.map, (m) => {
      const item = (m.trash ?? []).find(i => i.id === itemId)
      m.trash = (m.trash ?? []).filter(i => i.id !== itemId)
      return item?.type === 'note'
    })
    if (wasNote) await this.purgeDocument(itemId)
  }

  async emptyTrash(): Promise<void> {
    const { result: noteIds } = mutateManifest(this.manifestSession.ydoc, this.map, (m) => {
      const ids = (m.trash ?? []).filter(i => i.type === 'note').map(i => i.id)
      m.trash = []
      return ids
    })
    await Promise.all(noteIds.map(id => this.purgeDocument(id)))
  }

  /** Deletes a note's server document, tolerating one that is already gone. */
  private async purgeDocument(noteId: string): Promise<void> {
    if (this.noteSession?.id === noteId) this.closeNoteSession()
    try {
      await this.d.deleteDocument(noteId)
    } catch { /* already deleted, or offline — the manifest entry is gone either way */ }
    this.docRooms.delete(noteId)
    // Only on a permanent delete: a trashed note keeps its properties so that
    // restoring it brings them back.
    deleteNoteMetadata(this.manifestSession.ydoc, noteId)
    deleteSearchIndex(this.manifestSession.ydoc, noteId)
    const cache = this.readSidebarPreviewCache()
    delete cache[noteId]
    this.writeSidebarPreviewCache(cache)
  }

  // --- kanban (stored in the manifest doc's 'kanban' map) ---

  private readKanban(): kb.KanbanState {
    const data = this.manifestSession.ydoc.getMap<kb.KanbanState>('kanban').get('data')
    return data ? plainClone(data) : kb.emptyKanbanState()
  }
  private mutateKanban<T>(mutator: (s: kb.KanbanState) => T): T {
    const state = this.readKanban()
    const result = mutator(state)
    this.manifestSession.ydoc.transact(() => {
      this.manifestSession.ydoc.getMap<kb.KanbanState>('kanban').set('data', plainClone(state))
    }, CLOUD_LOCAL_ORIGIN)
    return result
  }

  kanbanListBoards(): Promise<KanbanBoard[]> {
    return Promise.resolve(this.readKanban().boards)
  }
  kanbanCreateBoard(title: string, icon: string, folderId: string | null): Promise<KanbanBoard> {
    const board = kb.defaultBoard(title, icon, folderId)
    this.mutateKanban((s) => { s.boards.push(board); s.cards[board.id] = [] })
    return Promise.resolve(board)
  }
  kanbanUpdateBoard(boardId: string, updates: KanbanBoardUpdate): Promise<KanbanBoard> {
    const board = this.mutateKanban(s => kb.patchBoard(s, boardId, updates))
    return board ? Promise.resolve(board) : Promise.reject(new Error('board not found'))
  }
  kanbanDeleteBoard(boardId: string): Promise<void> {
    this.mutateKanban(s => kb.removeBoard(s, boardId))
    return Promise.resolve()
  }
  kanbanSaveSchema(boardId: string, propertyDefinitions: KanbanPropertyDef[], columnRemap: Record<string, string> = {}): Promise<KanbanBoard> {
    const board = this.mutateKanban(s => kb.saveSchema(s, boardId, propertyDefinitions, columnRemap))
    return board ? Promise.resolve(board) : Promise.reject(new Error('board not found'))
  }
  kanbanListCards(boardId: string): Promise<KanbanCard[]> {
    return Promise.resolve(this.readKanban().cards[boardId] ?? [])
  }
  kanbanCreateCard(boardId: string, title: string, columnValue: string, statusPropertyId: string, columnOrder: number): Promise<KanbanCard> {
    const card = kb.defaultCard(boardId, title, columnValue, statusPropertyId, columnOrder)
    this.mutateKanban((s) => { (s.cards[boardId] ??= []).push(card) })
    return Promise.resolve(card)
  }
  kanbanUpdateCard(boardId: string, cardId: string, updates: KanbanCardUpdate): Promise<KanbanCard> {
    const card = this.mutateKanban(s => kb.patchCard(s, boardId, cardId, updates))
    return card ? Promise.resolve(card) : Promise.reject(new Error('card not found'))
  }
  kanbanMoveCard(boardId: string, cardId: string, toColumnOptionId: string, targetIndex: number): Promise<KanbanCard[]> {
    return Promise.resolve(this.mutateKanban(s => kb.moveCard(s, boardId, cardId, toColumnOptionId, targetIndex)))
  }
  kanbanDeleteCard(boardId: string, cardId: string): Promise<void> {
    this.mutateKanban(s => kb.removeCard(s, boardId, cardId))
    return Promise.resolve()
  }

  // --- search ---

  /**
   * Full-text block search over the client-side index (see searchIndexOps),
   * using the same scoring and snippets as the local Rust implementation.
   *
   * A note only becomes body-searchable once it has been saved while this
   * feature is present — the index is built on save, and nothing can backfill
   * it without opening every note's document. Notes still match by title
   * through the manifest-based entity search, which is a separate result group.
   */
  searchWorkspaceBlocks(query: string): Promise<WorkspaceBlockSearchItem[]> {
    const snap = readManifest(this.map)
    if (!snap) return Promise.resolve([])

    const index = readSearchIndex(this.manifestSession.ydoc)
    const sources: BlockSearchSource[] = []
    const add = (note: NoteMeta) => {
      const blocks = index[note.id]
      if (blocks?.length) {
        sources.push({ noteId: note.id, noteTitle: note.title, folderId: note.folderId, blocks })
      }
    }
    snap.rootNotes.forEach(add)
    const walk = (folders: FolderMeta[]) => { for (const f of folders) { f.notes.forEach(add); walk(f.children) } }
    walk(snap.tree)

    return Promise.resolve(searchBlocks(sources, query).map(match => ({
      type: 'block' as const,
      id: `${match.noteId}:${match.blockIndex}`,
      noteId: match.noteId,
      noteTitle: match.noteTitle,
      folderId: match.folderId,
      blockIndex: match.blockIndex,
      snippet: match.snippet,
      blockText: match.blockText,
    })))
  }

  // --- graph (edges stored in the manifest doc's 'graph' map, computed
  // client-side from note link marks) ---

  private readGraph(): Record<string, ExtractedEdge[]> {
    return plainClone(this.manifestSession.ydoc.getMap<Record<string, ExtractedEdge[]>>('graph').get('data') ?? {})
  }
  private mutGraph(mutator: (g: Record<string, ExtractedEdge[]>) => void): void {
    const g = this.readGraph()
    mutator(g)
    this.manifestSession.ydoc.transact(() => {
      this.manifestSession.ydoc.getMap<Record<string, ExtractedEdge[]>>('graph').set('data', plainClone(g))
    }, CLOUD_LOCAL_ORIGIN)
  }

  graphUpdateNoteEdges(noteId: string, edges: ExtractedEdge[]): Promise<void> {
    this.mutGraph((g) => { g[noteId] = edges })
    return Promise.resolve()
  }
  graphRemoveNote(noteId: string): Promise<void> {
    this.mutGraph((g) => {
      delete g[noteId]
      for (const nid of Object.keys(g)) g[nid] = g[nid].filter(e => e.target !== noteId)
    })
    return Promise.resolve()
  }
  graphGetOutlinks(noteId: string): Promise<GraphEdge[]> {
    const edges = this.readGraph()[noteId] ?? []
    return Promise.resolve(edges.map(e => ({ source: noteId, target: e.target, kind: e.kind, anchor: e.anchor ?? undefined })))
  }
  graphGetAllEdges(): Promise<GraphEdge[]> {
    const g = this.readGraph()
    const out: GraphEdge[] = []
    for (const [nid, edges] of Object.entries(g)) {
      for (const e of edges) out.push({ source: nid, target: e.target, kind: e.kind, anchor: e.anchor ?? undefined })
    }
    return Promise.resolve(out)
  }
  graphGetBacklinks(noteId: string): Promise<BacklinkRef[]> {
    const g = this.readGraph()
    const snap = readManifest(this.map)
    const out: BacklinkRef[] = []
    for (const [nid, edges] of Object.entries(g)) {
      if (nid === noteId) continue
      const count = edges.filter(e => e.target === noteId).length
      if (count === 0) continue
      const meta = snap ? ops.findNote(snap, nid) : null
      out.push({ sourceId: nid, sourceTitle: meta?.title ?? 'Untitled', sourceIcon: meta?.icon ?? '📄', count })
    }
    return Promise.resolve(out)
  }

  // --- not applicable / deferred for cloud v1 ---

  // --- plugins (device-local; see cloud_plugin_root in Rust) ---

  /**
   * The directory this device keeps the storage's plugins in, or null when it
   * could not be prepared. Everything plugin-related — listing, enabling, the
   * marketplace, and the plugin SDK's own storage and assets — runs against it
   * through the same commands a local workspace uses.
   */
  pluginWorkspacePath(): string | null {
    return this.pluginRoot
  }

  private requirePluginRoot(): string {
    if (!this.pluginRoot) throw new Error('Plugin storage is unavailable for this workspace')
    return this.pluginRoot
  }

  listPlugins(): Promise<PluginManifest[]> {
    return this.pluginRoot ? workspaceCommands.listPlugins(this.pluginRoot) : Promise.resolve([])
  }
  // These are async so a missing plugin directory rejects the returned promise
  // rather than throwing at the call site, which a `.catch()` would miss.
  async setPluginEnabled(pluginId: string, enabled: boolean): Promise<void> {
    return workspaceCommands.setPluginEnabled(this.requirePluginRoot(), pluginId, enabled)
  }
  async marketplaceListPlugins(forceRefresh?: boolean): Promise<MarketplaceCatalog> {
    return workspaceCommands.marketplaceListPlugins(this.requirePluginRoot(), forceRefresh)
  }
  async marketplaceInstallPlugin(pluginId: string, permissionFingerprint: string, version?: string): Promise<PluginManifest> {
    return workspaceCommands.marketplaceInstallPlugin(this.requirePluginRoot(), pluginId, permissionFingerprint, version)
  }
  async marketplaceUpdatePlugin(pluginId: string, permissionFingerprint: string): Promise<PluginManifest> {
    return workspaceCommands.marketplaceUpdatePlugin(this.requirePluginRoot(), pluginId, permissionFingerprint)
  }
  async marketplaceRemovePlugin(pluginId: string): Promise<void> {
    return workspaceCommands.marketplaceRemovePlugin(this.requirePluginRoot(), pluginId)
  }
  async marketplaceRefreshCache(): Promise<MarketplaceCatalog> {
    return workspaceCommands.marketplaceRefreshCache(this.requirePluginRoot())
  }
  /**
   * Trims every note's history to the newest `keepPerNote` snapshots. One
   * snapshot is written per note close, so without this a storage's history
   * grows without bound. `bytesFreed` stays 0: the relay reports how many rows
   * it removed, and their sizes are ciphertext the client never measured.
   */
  async pruneSnapshots(keepPerNote: number): Promise<WorkspaceCleanupReport> {
    const results = await Promise.all(
      [...this.docRooms.keys()].map(async (noteId) => {
        try {
          return (await this.d.pruneSnapshots(noteId, keepPerNote)).deleted
        } catch {
          return 0
        }
      }),
    )
    return { removedFiles: results.reduce((total, n) => total + n, 0), bytesFreed: 0 }
  }

  /**
   * Not supported for cloud storages. Finding orphans means knowing which
   * assets every note still references, and note bodies are ciphertext the
   * relay cannot read — the client would have to open and scan every note
   * document. Assets are instead deleted at the moment their last reference
   * goes away, through deleteUnreferencedAsset below.
   */
  cleanupOrphanedAssets(): Promise<WorkspaceCleanupReport> { return Promise.resolve({ removedFiles: 0, bytesFreed: 0 }) }

  /** Deletes a cloud asset whose last reference the editor just dropped. */
  async deleteUnreferencedAsset(assetSrc: string): Promise<boolean> {
    if (!assetSrc.startsWith(CLOUD_ASSET_SCHEME)) return false
    const id = assetSrc.slice(CLOUD_ASSET_SCHEME.length)
    try {
      await this.d.deleteAsset(id)
    } catch {
      return false
    }
    const cached = this.assetCache.get(assetSrc)
    if (cached) {
      URL.revokeObjectURL(cached)
      this.assetCache.delete(assetSrc)
    }
    return true
  }
  // --- draw payloads (encrypted relay assets, see drawAssetOps) ---

  /**
   * Stores a drawing's payload and points the drawing at it.
   *
   * The previous blob is deleted rather than kept as history the way the local
   * `draw-<id>-<stamp>.json` files are: a drawing saves on every edit, and a
   * cloud workspace has no orphan sweep to reclaim the older ones.
   */
  async saveDrawAsset(drawId: string, bytes: number[]): Promise<string> {
    if (bytes.length === 0) throw new Error('Draw payload is empty')
    const encrypted = await encryptBytes(this.d.key, Uint8Array.from(bytes))
    const { id } = await this.d.uploadAsset(encrypted, 'application/json')
    const replaced = writeDrawAssetId(this.manifestSession.ydoc, drawId, id)
    if (replaced) {
      // Best-effort: a failure here costs storage, never the new payload.
      try { await this.d.deleteAsset(replaced) } catch { /* leave it behind */ }
    }
    return `${CLOUD_ASSET_SCHEME}${id}`
  }

  async readDrawAsset(src: string): Promise<number[]> {
    const asset = await this.readAssetBytes(src)
    if (!asset) throw new Error('Drawing payload could not be read')
    return Array.from(asset.bytes)
  }

  /** Recovers a drawing whose stored `src` no longer resolves. */
  async readLatestDrawAsset(drawId: string): Promise<number[]> {
    const assetId = readDrawAssetId(this.manifestSession.ydoc, drawId)
    if (!assetId) throw new Error('Drawing payload could not be read')
    return this.readDrawAsset(`${CLOUD_ASSET_SCHEME}${assetId}`)
  }
  getDiagnostics(): Promise<WorkspaceDiagnostics> {
    const snap = readManifest(this.map)
    let noteCount = snap?.rootNotes.length ?? 0
    let folderCount = 0
    const walk = (tree: FolderMeta[]) => { for (const f of tree) { folderCount++; noteCount += f.notes.length; walk(f.children) } }
    if (snap) walk(snap.tree)
    return Promise.resolve({
      workspacePath: `cloud:${this.d.storageId}`, notesFolderPath: '', assetsFolderPath: '',
      nevoFolderPath: '', settingsPath: '', logsPath: '',
      noteCount, folderCount, pluginCount: 0, snapshotCount: 0, assetCount: 0,
      workspaceBytes: 0, notesBytes: 0, assetsBytes: 0, snapshotsBytes: 0,
    })
  }
}
