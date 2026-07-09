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
import type { FolderMeta, NoteMeta, NoteDocument, NoteSnapshotMeta, BlockNode, ImportedImageAsset, SidebarNotePreview } from '../../../types/note'
import type { WorkspaceBlockSearchItem } from '../../../types/search'
import type { BacklinkRef, GraphEdge, ExtractedEdge } from '../../../types/graph'
import type { TemplateFieldValues } from '../../../types/template'
import { createDefaultWorkspaceSettings } from '../../../utils/workspace-settings'
import { buildSidebarPreviewText, normalizeSidebarTags } from '../../../utils/sidebar/sidebarNotePreviews'
import type { WorkspaceBackend, WorkspaceHandle, KanbanBoardUpdate, KanbanCardUpdate } from '../types'
import type { CloudDocument } from '../../../types/cloud'
import type { KanbanBoard, KanbanCard, KanbanPropertyDef } from '../../../types/kanban'
import { CloudSession, CLOUD_LOCAL_ORIGIN } from './session'
import * as kb from './kanbanOps'
import { manifestMap, readManifest, emptyManifest, writeManifest, mutateManifest, plainClone } from './manifest'
import * as ops from './manifestOps'

const EMPTY_CONTENT: BlockNode = { type: 'doc', content: [{ type: 'paragraph' }] }
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

export interface CloudBackendDeps {
  storageId: string
  name: string
  glyph: string
  gradient: string
  manifestRoom: string
  key: CryptoKey
  token: string
  wsBase: string
  listDocuments: (storageId: string) => Promise<CloudDocument[]>
  createDocument: (storageId: string) => Promise<CloudDocument>
  // History (encrypted snapshot blobs); docId is the note id.
  listSnapshots: (docId: string) => Promise<Array<{ id: string; label: string; createdAt: string }>>
  createSnapshot: (docId: string, blob: Uint8Array, label: string) => Promise<unknown>
  getSnapshot: (snapshotId: string) => Promise<Uint8Array>
  // Encrypted assets: the relay stores ciphertext + a plaintext content type.
  uploadAsset: (blob: Uint8Array, contentType: string) => Promise<{ id: string }>
  fetchAsset: (assetId: string) => Promise<{ bytes: Uint8Array; contentType: string }>
  onManifest: (manifest: WorkspaceManifest) => void
}

export class CloudBackend implements WorkspaceBackend {
  readonly handle: WorkspaceHandle
  private readonly d: CloudBackendDeps
  private manifestSession!: CloudSession
  private map!: Y.Map<WorkspaceManifest>
  private docRooms = new Map<string, string>() // noteId -> roomCode
  private noteSession: { id: string; session: CloudSession } | null = null
  private assetCache = new Map<string, string>() // asset src -> object URL

  constructor(deps: CloudBackendDeps) {
    this.d = deps
    this.handle = { kind: 'cloud', storageId: deps.storageId }
  }

  // --- lifecycle ---

  async open(): Promise<WorkspaceManifest> {
    this.manifestSession = new CloudSession({
      roomCode: this.d.manifestRoom, key: this.d.key, token: this.d.token, wsBase: this.d.wsBase,
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

  saveManifest(manifest: WorkspaceManifest): Promise<void> {
    writeManifest(this.manifestSession.ydoc, this.map, manifest)
    return Promise.resolve()
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
  deleteFolder(folderId: string): Promise<void> {
    mutateManifest(this.manifestSession.ydoc, this.map, m => ops.removeFolder(m, folderId))
    return Promise.resolve()
  }

  // --- notes ---

  async createNote(folderId: string | null, title: string, icon: string): Promise<NoteDocument> {
    const doc = await this.d.createDocument(this.d.storageId)
    this.docRooms.set(doc.id, doc.roomCode)
    mutateManifest(this.manifestSession.ydoc, this.map, m => ops.addNote(m, doc.id, folderId, title, icon))
    const now = new Date().toISOString()
    return { id: doc.id, title, icon, folderId, createdAt: now, updatedAt: now, properties: { type: null, tags: [], date: null, status: null }, content: structuredClone(EMPTY_CONTENT) }
  }
  createNoteFromTemplate(_templateId: string, folderId: string | null, title: string, icon: string, _f: TemplateFieldValues): Promise<NoteDocument> {
    // Templates are a local feature; cloud falls back to a blank note for v1.
    return this.createNote(folderId, title, icon)
  }
  loadNote(noteId: string): Promise<NoteDocument> {
    // Content is served live via the note's Yjs session (see getNoteSession);
    // here we return the meta from the manifest with a placeholder body.
    const snap = readManifest(this.map)
    const meta = snap ? ops.findNote(snap, noteId) : null
    const now = new Date().toISOString()
    return Promise.resolve({
      id: noteId,
      title: meta?.title ?? 'Untitled',
      icon: meta?.icon ?? '📄',
      folderId: meta?.folderId ?? null,
      createdAt: meta?.updatedAt ?? now,
      updatedAt: meta?.updatedAt ?? now,
      properties: { type: null, tags: [], date: null, status: null },
      content: structuredClone(EMPTY_CONTENT),
    })
  }
  saveNote(note: NoteDocument): Promise<void> {
    // Content auto-syncs through the live Yjs session; only meta lives in the manifest.
    mutateManifest(this.manifestSession.ydoc, this.map, m => ops.updateNoteMeta(m, note.id, { title: note.title, icon: note.icon }))
    this.writeSidebarPreviewCache({
      ...this.readSidebarPreviewCache(),
      [note.id]: {
        noteId: note.id,
        title: note.title,
        icon: note.icon,
        folderPath: '',
        updatedAt: note.updatedAt,
        tags: normalizeSidebarTags(note.properties?.tags),
        previewText: buildSidebarPreviewText(note.content),
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

  listSidebarNotePreviews(): Promise<SidebarNotePreview[]> {
    const snap = readManifest(this.map)
    if (!snap) return Promise.resolve([])
    const previews: SidebarNotePreview[] = []
    const cache = this.readSidebarPreviewCache()
    const add = (meta: NoteMeta, folderPath: string) => {
      const cached = cache[meta.id]
      previews.push({
        noteId: meta.id,
        title: cached?.title ?? meta.title,
        icon: cached?.icon ?? meta.icon,
        folderPath,
        updatedAt: cached?.updatedAt ?? meta.updatedAt,
        tags: normalizeSidebarTags(cached?.tags),
        previewText: cached?.previewText ?? '',
      })
    }
    snap.rootNotes.forEach(note => add(note, ''))
    const walk = (folders: FolderMeta[], parents: string[]) => {
      for (const folder of folders) {
        const path = [...parents, folder.title]
        folder.notes.forEach(note => add(note, path.join(' / ')))
        walk(folder.children, path)
      }
    }
    walk(snap.tree, [])
    return Promise.resolve(previews)
  }

  private readSidebarPreviewCache(): Record<string, SidebarNotePreview> {
    return plainClone(this.manifestSession?.ydoc.getMap<Record<string, SidebarNotePreview>>('meta').get(SIDEBAR_PREVIEWS_KEY) ?? {})
  }

  private writeSidebarPreviewCache(cache: Record<string, SidebarNotePreview>): void {
    this.manifestSession.ydoc.getMap<Record<string, SidebarNotePreview>>('meta').set(SIDEBAR_PREVIEWS_KEY, plainClone(cache))
  }

  // --- note sessions (used by the editor for live, real-time content) ---

  /** Open (or reuse) the live Yjs session for a note's content. */
  getNoteSession(noteId: string): { ydoc: Y.Doc; awareness: Awareness; whenSynced: (timeoutMs?: number) => Promise<void> } | null {
    const room = this.docRooms.get(noteId)
    if (!room) return null
    if (this.noteSession?.id !== noteId) {
      this.closeNoteSession()
      this.noteSession = {
        id: noteId,
        session: new CloudSession({ roomCode: room, key: this.d.key, token: this.d.token, wsBase: this.d.wsBase }),
      }
    }
    return { ydoc: this.noteSession.session.ydoc, awareness: this.noteSession.session.awareness, whenSynced: (timeoutMs?: number) => this.noteSession!.session.whenSynced(timeoutMs) }
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

  importAssetByPath(): Promise<ImportedImageAsset> {
    // Path-based import needs Tauri filesystem access; unsupported for cloud v1.
    return Promise.reject(new Error('Importing assets by path is not supported for cloud storages'))
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

  async listNoteSnapshots(noteId: string): Promise<NoteSnapshotMeta[]> {
    try {
      const list = await this.d.listSnapshots(noteId)
      return list.map(s => ({ id: s.id, noteId, createdAt: s.createdAt, updatedAt: s.createdAt }))
    } catch {
      return []
    }
  }

  async restoreNoteSnapshot(noteId: string, snapshotId: string): Promise<NoteDocument> {
    // Apply the snapshot's encrypted CRDT state onto the live note doc. (CRDT
    // restore is additive — it reintroduces the snapshot's content rather than a
    // hard revert; a true revert is a later refinement.)
    try {
      const enc = await this.d.getSnapshot(snapshotId)
      const update = await decryptBytes(this.d.key, enc)
      const session = this.getNoteSession(noteId)
      if (session) Y.applyUpdate(session.ydoc, update)
    } catch { /* non-critical */ }
    return this.loadNote(noteId)
  }
  restoreFromTrash(itemId: string): Promise<void> {
    mutateManifest(this.manifestSession.ydoc, this.map, m => ops.restoreTrash(m, itemId))
    return Promise.resolve()
  }
  permanentlyDeleteFromTrash(itemId: string): Promise<void> {
    mutateManifest(this.manifestSession.ydoc, this.map, (m) => {
      m.trash = (m.trash ?? []).filter(i => i.id !== itemId)
    })
    return Promise.resolve()
  }
  emptyTrash(): Promise<void> {
    mutateManifest(this.manifestSession.ydoc, this.map, (m) => { m.trash = [] })
    return Promise.resolve()
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

  // --- search (client-side: titles from the manifest; E2E blocks the server
  // from indexing content, so full-text body search is a later refinement) ---

  searchWorkspaceBlocks(query: string): Promise<WorkspaceBlockSearchItem[]> {
    const q = query.trim().toLowerCase()
    const snap = readManifest(this.map)
    if (!q || !snap) return Promise.resolve([])
    const items: WorkspaceBlockSearchItem[] = []
    const add = (n: NoteMeta) => {
      if (n.title.toLowerCase().includes(q)) {
        items.push({
          type: 'block', id: n.id, noteId: n.id, noteTitle: n.title,
          folderId: n.folderId, blockIndex: 0, snippet: n.title, blockText: n.title,
        })
      }
    }
    snap.rootNotes.forEach(add)
    const walk = (folders: FolderMeta[]) => { for (const f of folders) { f.notes.forEach(add); walk(f.children) } }
    walk(snap.tree)
    return Promise.resolve(items)
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

  listPlugins(): Promise<PluginManifest[]> { return Promise.resolve([]) }
  setPluginEnabled(): Promise<void> { return Promise.resolve() }
  marketplaceListPlugins(): Promise<MarketplaceCatalog> {
    return Promise.resolve({ repo: 'eliotBenitez/nevo-marketplace', branch: 'main', updatedAt: new Date(0).toISOString(), fromCache: false, error: 'Marketplace is not supported for cloud workspaces yet', plugins: [] })
  }
  marketplaceInstallPlugin(): Promise<PluginManifest> { return Promise.reject(new Error('Marketplace is not supported for cloud workspaces yet')) }
  marketplaceUpdatePlugin(): Promise<PluginManifest> { return Promise.reject(new Error('Marketplace is not supported for cloud workspaces yet')) }
  marketplaceRemovePlugin(): Promise<void> { return Promise.reject(new Error('Marketplace is not supported for cloud workspaces yet')) }
  marketplaceRefreshCache(): Promise<MarketplaceCatalog> { return this.marketplaceListPlugins() }
  pruneSnapshots(): Promise<WorkspaceCleanupReport> { return Promise.resolve({ removedFiles: 0, bytesFreed: 0 }) }
  cleanupOrphanedAssets(): Promise<WorkspaceCleanupReport> { return Promise.resolve({ removedFiles: 0, bytesFreed: 0 }) }
  deleteUnreferencedAsset(): Promise<boolean> { return Promise.resolve(false) }
  // Draw assets are local-only for now: cloud storage would need an
  // encrypted-blob relay (see uploadAsset/fetchAsset). Surfaced as a clear
  // error so the editor can disable the drawing flow there.
  saveDrawAsset(): Promise<string> {
    return Promise.reject(new Error('Drawing assets are not supported on cloud workspaces yet'))
  }
  readDrawAsset(): Promise<number[]> {
    return Promise.reject(new Error('Drawing assets are not supported on cloud workspaces yet'))
  }
  readLatestDrawAsset(): Promise<number[]> {
    return Promise.reject(new Error('Drawing assets are not supported on cloud workspaces yet'))
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
