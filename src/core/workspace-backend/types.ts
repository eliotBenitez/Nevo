// A WorkspaceBackend abstracts where a workspace's data lives. The same
// WorkspaceShell drives either a LocalBackend (Tauri filesystem) or a
// CloudBackend (relay + Yjs), so cloud storages behave like local workspaces.

import type {
  WorkspaceManifest,
  WorkspaceSettings,
  WorkspaceDiagnostics,
  WorkspaceCleanupReport,
  PluginManifest,
} from '../../types/workspace'
import type { FolderMeta, NoteDocument, NoteSnapshotMeta, ImportedImageAsset } from '../../types/note'
import type { TemplateFieldValues } from '../../types/template'
import type { KanbanBoard, KanbanCard, KanbanPropertyDef, KanbanCardField } from '../../types/kanban'
import type { WorkspaceBlockSearchItem } from '../../types/search'
import type { BacklinkRef, GraphEdge, ExtractedEdge } from '../../types/graph'

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
}

/** Identifies an open workspace and which backend serves it. */
export type WorkspaceHandle =
  | { kind: 'local'; path: string }
  | { kind: 'cloud'; storageId: string }

export interface WorkspaceBackend {
  readonly handle: WorkspaceHandle

  // --- workspace ---
  open(): Promise<WorkspaceManifest>
  saveManifest(manifest: WorkspaceManifest): Promise<void>
  loadSettings(): Promise<WorkspaceSettings>
  saveSettings(settings: WorkspaceSettings): Promise<void>
  loadCustomCss(): Promise<string>
  saveCustomCss(css: string): Promise<void>
  listPlugins(): Promise<PluginManifest[]>
  setPluginEnabled(pluginId: string, enabled: boolean): Promise<void>
  getDiagnostics(): Promise<WorkspaceDiagnostics>
  pruneSnapshots(keepPerNote: number): Promise<WorkspaceCleanupReport>
  cleanupOrphanedAssets(): Promise<WorkspaceCleanupReport>

  // --- folders ---
  createFolder(parentId: string | null, title: string, icon: string): Promise<FolderMeta>
  renameFolder(folderId: string, title: string): Promise<void>
  deleteFolder(folderId: string, recursive: boolean): Promise<void>

  // --- notes ---
  createNote(folderId: string | null, title: string, icon: string): Promise<NoteDocument>
  createNoteFromTemplate(
    templateId: string,
    folderId: string | null,
    title: string,
    icon: string,
    fieldValues: TemplateFieldValues,
  ): Promise<NoteDocument>
  loadNote(noteId: string): Promise<NoteDocument>
  saveNote(note: NoteDocument): Promise<void>
  deleteNote(noteId: string): Promise<void>
  moveNote(noteId: string, targetFolderId: string | null): Promise<void>

  // --- assets (images / files) ---
  importImageAsset(fileName: string, bytes: number[]): Promise<ImportedImageAsset>
  importAssetByPath(sourcePath: string, fileName: string): Promise<ImportedImageAsset>
  deleteUnreferencedAsset(assetSrc: string): Promise<boolean>

  // --- snapshots / history ---
  listNoteSnapshots(noteId: string): Promise<NoteSnapshotMeta[]>
  restoreNoteSnapshot(noteId: string, snapshotId: string): Promise<NoteDocument>

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
}
