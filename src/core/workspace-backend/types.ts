// A WorkspaceBackend abstracts where a workspace's data lives. Currently the
// only implementation is LocalBackend (Tauri filesystem).

import type {
  WorkspaceManifest,
  WorkspaceSettings,
  WorkspaceDiagnostics,
  WorkspaceCleanupReport,
  PluginManifest,
  MarketplaceCatalog,
} from '../../types/workspace'
import type { FolderMeta, NoteDocument, NoteSnapshotMeta, ImportedImageAsset, RestoreNoteSnapshotResult, SidebarNotePreview } from '../../types/note'
import type { TemplateDocument, TemplateFieldValues } from '../../types/template'
import type { KanbanBoard, KanbanCard, KanbanPropertyDef, KanbanCardField, KanbanLink } from '../../types/kanban'
import type { WorkspaceBlockSearchItem } from '../../types/search'
import type { BacklinkRef, GraphEdge, ExtractedEdge } from '../../types/graph'
import type { NoteQueryRequest, NoteRow } from '../../types/note-query'
import type { NotebookPaperKind } from '../notebook/types'
import type { DatabaseRepository } from '../../features/database/databaseRepository'

export interface KanbanBoardUpdate {
  title?: string
  icon?: string
  statusPropertyId?: string
  propertyDefinitions?: KanbanPropertyDef[]
  viewSettings?: KanbanBoard['viewSettings']
}

export interface KanbanCardUpdate {
  title?: string
  icon?: string
  content?: unknown
  properties?: Record<string, unknown>
  fields?: KanbanCardField[]
  columnOrder?: number
  estimate?: string
  sprint?: string
  progress?: number
  priority?: string
  links?: KanbanLink[]
}

/** Identifies an open workspace and which backend serves it. */
export type WorkspaceHandle = { kind: 'local'; path: string }

/**
 * A stable string key for a workspace handle, used to scope per-workspace
 * caches (see `src/core/document-session/noteCache.ts`) so a note id from one
 * workspace can never be served — or saved over — as if it belonged to
 * another.
 */
export function workspaceHandleKey(handle: WorkspaceHandle): string {
  return `local:${handle.path}`
}

export interface WorkspaceBackend {
  readonly handle: WorkspaceHandle

  // --- workspace ---
  open(): Promise<WorkspaceManifest>
  /** Resolves once every accepted write is durable locally (and handed to the
   *  network where one exists); rejects if it cannot be. */
  flushDurability(): Promise<void>
  saveManifest(manifest: WorkspaceManifest): Promise<void>
  loadSettings(): Promise<WorkspaceSettings>
  saveSettings(settings: WorkspaceSettings): Promise<void>
  loadCustomCss(): Promise<string>
  saveCustomCss(css: string): Promise<void>
  listPlugins(): Promise<PluginManifest[]>
  setPluginEnabled(pluginId: string, enabled: boolean): Promise<void>
  marketplaceListPlugins(forceRefresh?: boolean): Promise<MarketplaceCatalog>
  marketplaceInstallPlugin(pluginId: string, permissionFingerprint: string, version?: string): Promise<PluginManifest>
  marketplaceUpdatePlugin(pluginId: string, permissionFingerprint: string): Promise<PluginManifest>
  marketplaceRemovePlugin(pluginId: string): Promise<void>
  marketplaceRefreshCache(): Promise<MarketplaceCatalog>
  getDiagnostics(): Promise<WorkspaceDiagnostics>
  pruneSnapshots(keepPerNote: number): Promise<WorkspaceCleanupReport>
  cleanupOrphanedAssets(): Promise<WorkspaceCleanupReport>

  // --- folders ---
  createFolder(parentId: string | null, title: string, icon: string): Promise<FolderMeta>
  renameFolder(folderId: string, title: string): Promise<void>
  deleteFolder(folderId: string, recursive: boolean): Promise<void>

  // --- notes ---
  createNote(folderId: string | null, title: string, icon: string): Promise<NoteDocument>
  createNotebook(folderId: string | null, title: string, icon: string, paper: NotebookPaperKind): Promise<NoteDocument>
  createNoteFromTemplate(
    templateId: string,
    folderId: string | null,
    title: string,
    icon: string,
    fieldValues: TemplateFieldValues,
  ): Promise<NoteDocument>

  // --- templates ---
  listTemplates(): Promise<TemplateDocument[]>
  getTemplate(templateId: string): Promise<TemplateDocument>
  createTemplate(template: TemplateDocument): Promise<TemplateDocument>
  updateTemplate(templateId: string, template: TemplateDocument): Promise<TemplateDocument>
  deleteTemplate(templateId: string): Promise<void>
  loadNote(noteId: string): Promise<NoteDocument>
  /**
   * Like `loadNote`, but guaranteed to carry the note's real body — anything
   * that needs the actual text of a note it is not editing (export, history
   * comparison) has to go through here.
   */
  loadNoteWithContent(noteId: string): Promise<NoteDocument>
  saveNote(note: NoteDocument): Promise<void>
  deleteNote(noteId: string): Promise<void>
  moveNote(noteId: string, targetFolderId: string | null): Promise<void>
  listSidebarNotePreviews(): Promise<SidebarNotePreview[]>

  // --- assets (images / files) ---
  /** Bytes travel as a raw Uint8Array (not a JSON number array) to avoid the
   *  ~3-4x IPC transport overhead of encoding every byte as a JSON number —
   *  see `src/tauri/commands.ts` `noteCommands.importImageAsset`. */
  importImageAsset(fileName: string, bytes: Uint8Array): Promise<ImportedImageAsset>
  /** Download a remote image URL and import it into the workspace assets. */
  importImageFromUrl(url: string): Promise<ImportedImageAsset>
  deleteUnreferencedAsset(assetSrc: string): Promise<boolean>
  /** Persist a draw_block payload (JSON bytes) and return the relative `src`. */
  saveDrawAsset(drawId: string, bytes: number[]): Promise<string>
  /** Read a draw_block payload back as JSON bytes. */
  readDrawAsset(src: string): Promise<number[]>
  /** Read the latest payload for a draw_block by its id, regardless of the
   *  note's stored `src` — recovers drawings whose note reference went stale. */
  readLatestDrawAsset(drawId: string): Promise<number[]>

  // --- snapshots / history ---
  listNoteSnapshots(noteId: string): Promise<NoteSnapshotMeta[]>
  /** Every note that has history, for the workspace-wide history browser. */
  listAllNoteSnapshots(): Promise<Array<{ noteId: string; snapshots: NoteSnapshotMeta[] }>>
  /** A snapshot's content, for previewing or diffing without restoring it. */
  loadNoteSnapshot(noteId: string, snapshotId: string): Promise<NoteDocument>
  restoreNoteSnapshot(noteId: string, snapshotId: string): Promise<RestoreNoteSnapshotResult>

  // --- trash ---
  restoreFromTrash(itemId: string): Promise<void>
  permanentlyDeleteFromTrash(itemId: string): Promise<void>
  emptyTrash(): Promise<void>

  // --- kanban ---
  kanbanListBoards(): Promise<KanbanBoard[]>
  kanbanCreateBoard(title: string, icon: string, folderId: string | null): Promise<KanbanBoard>
  kanbanUpdateBoard(boardId: string, updates: KanbanBoardUpdate): Promise<KanbanBoard>
  kanbanDeleteBoard(boardId: string): Promise<void>
  kanbanSaveSchema(boardId: string, propertyDefinitions: KanbanPropertyDef[], columnRemap?: Record<string, string>): Promise<KanbanBoard>
  kanbanListCards(boardId: string): Promise<KanbanCard[]>
  kanbanCreateCard(boardId: string, title: string, columnValue: string, statusPropertyId: string, columnOrder: number): Promise<KanbanCard>
  kanbanUpdateCard(boardId: string, cardId: string, updates: KanbanCardUpdate): Promise<KanbanCard>
  kanbanMoveCard(boardId: string, cardId: string, toColumnOptionId: string, targetIndex: number): Promise<KanbanCard[]>
  kanbanDeleteCard(boardId: string, cardId: string): Promise<void>

  // --- search ---
  searchWorkspaceBlocks(query: string): Promise<WorkspaceBlockSearchItem[]>

  // --- graph ---
  graphGetBacklinks(noteId: string): Promise<BacklinkRef[]>
  graphGetOutlinks(noteId: string): Promise<GraphEdge[]>
  graphUpdateNoteEdges(noteId: string, edges: ExtractedEdge[]): Promise<void>
  graphRemoveNote(noteId: string): Promise<void>
  graphGetAllEdges(): Promise<GraphEdge[]>

  // --- cross-note query (query_block) ---
  queryNotes(request: NoteQueryRequest): Promise<NoteRow[]>

  // --- database blocks ---
  /** Row store for `database_block` node views. Backend-owned: the local
   *  implementation is SQLite-in-Rust. */
  databaseRepository(): DatabaseRepository
}
