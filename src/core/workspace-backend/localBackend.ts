// LocalBackend: filesystem-backed workspace via the existing Tauri commands.
// This is a thin pass-through — behavior is identical to calling the commands
// directly with workspaceStore.activePath.

import { workspaceCommands, noteCommands, folderCommands, templateCommands, kanbanCommands, graphCommands } from '../../tauri/commands'
import type { KanbanBoard, KanbanCard, KanbanPropertyDef } from '../../types/kanban'
import type { WorkspaceBlockSearchItem } from '../../types/search'
import type { BacklinkRef, GraphEdge, ExtractedEdge } from '../../types/graph'
import type { KanbanBoardUpdate, KanbanCardUpdate } from './types'
import type {
  WorkspaceManifest, WorkspaceSettings, WorkspaceDiagnostics, WorkspaceCleanupReport, PluginManifest,
} from '../../types/workspace'
import type { FolderMeta, NoteDocument, NoteSnapshotMeta, ImportedImageAsset } from '../../types/note'
import type { TemplateFieldValues } from '../../types/template'
import type { WorkspaceBackend, WorkspaceHandle } from './types'

export class LocalBackend implements WorkspaceBackend {
  readonly handle: WorkspaceHandle
  private readonly path: string

  constructor(path: string) {
    this.path = path
    this.handle = { kind: 'local', path }
  }

  open(): Promise<WorkspaceManifest> {
    return workspaceCommands.openWorkspace(this.path)
  }
  saveManifest(manifest: WorkspaceManifest): Promise<void> {
    return workspaceCommands.saveManifest(this.path, manifest)
  }
  loadSettings(): Promise<WorkspaceSettings> {
    return workspaceCommands.loadSettings(this.path)
  }
  saveSettings(settings: WorkspaceSettings): Promise<void> {
    return workspaceCommands.saveSettings(this.path, settings)
  }
  loadCustomCss(): Promise<string> {
    return workspaceCommands.loadCustomCss(this.path)
  }
  saveCustomCss(css: string): Promise<void> {
    return workspaceCommands.saveCustomCss(this.path, css)
  }
  listPlugins(): Promise<PluginManifest[]> {
    return workspaceCommands.listPlugins(this.path)
  }
  setPluginEnabled(pluginId: string, enabled: boolean): Promise<void> {
    return workspaceCommands.setPluginEnabled(this.path, pluginId, enabled)
  }
  getDiagnostics(): Promise<WorkspaceDiagnostics> {
    return workspaceCommands.getWorkspaceDiagnostics(this.path)
  }
  pruneSnapshots(keepPerNote: number): Promise<WorkspaceCleanupReport> {
    return workspaceCommands.pruneWorkspaceSnapshots(this.path, keepPerNote)
  }
  cleanupOrphanedAssets(): Promise<WorkspaceCleanupReport> {
    return workspaceCommands.cleanupOrphanedAssets(this.path)
  }

  createFolder(parentId: string | null, title: string, icon: string): Promise<FolderMeta> {
    return folderCommands.createFolder(this.path, parentId, title, icon)
  }
  renameFolder(folderId: string, title: string): Promise<void> {
    return folderCommands.renameFolder(this.path, folderId, title)
  }
  deleteFolder(folderId: string, recursive: boolean): Promise<void> {
    return folderCommands.deleteFolder(this.path, folderId, recursive)
  }

  createNote(folderId: string | null, title: string, icon: string): Promise<NoteDocument> {
    return noteCommands.createNote(this.path, folderId, title, icon)
  }
  createNoteFromTemplate(
    templateId: string, folderId: string | null, title: string, icon: string, fieldValues: TemplateFieldValues,
  ): Promise<NoteDocument> {
    return templateCommands.createNote(this.path, templateId, folderId, title, icon, fieldValues)
  }
  loadNote(noteId: string): Promise<NoteDocument> {
    return noteCommands.loadNote(this.path, noteId)
  }
  saveNote(note: NoteDocument): Promise<void> {
    return noteCommands.saveNote(this.path, note)
  }
  deleteNote(noteId: string): Promise<void> {
    return noteCommands.deleteNote(this.path, noteId)
  }
  moveNote(noteId: string, targetFolderId: string | null): Promise<void> {
    return noteCommands.moveNote(this.path, noteId, targetFolderId)
  }

  importImageAsset(fileName: string, bytes: number[]): Promise<ImportedImageAsset> {
    return noteCommands.importImageAsset(this.path, fileName, bytes)
  }
  importAssetByPath(sourcePath: string, fileName: string): Promise<ImportedImageAsset> {
    return noteCommands.importAssetByPath(this.path, sourcePath, fileName)
  }
  deleteUnreferencedAsset(assetSrc: string): Promise<boolean> {
    return noteCommands.deleteUnreferencedAsset(this.path, assetSrc)
  }
  saveDrawAsset(drawId: string, bytes: number[]): Promise<string> {
    return noteCommands.saveDrawAsset(this.path, drawId, bytes)
  }
  readDrawAsset(src: string): Promise<number[]> {
    return noteCommands.readDrawAsset(this.path, src)
  }
  readLatestDrawAsset(drawId: string): Promise<number[]> {
    return noteCommands.readLatestDrawAsset(this.path, drawId)
  }

  listNoteSnapshots(noteId: string): Promise<NoteSnapshotMeta[]> {
    return noteCommands.listNoteSnapshots(this.path, noteId)
  }
  restoreNoteSnapshot(noteId: string, snapshotId: string): Promise<NoteDocument> {
    return noteCommands.restoreNoteSnapshot(this.path, noteId, snapshotId)
  }

  restoreFromTrash(itemId: string): Promise<void> {
    return noteCommands.restoreFromTrash(this.path, itemId)
  }
  permanentlyDeleteFromTrash(itemId: string): Promise<void> {
    return noteCommands.permanentlyDeleteFromTrash(this.path, itemId)
  }
  emptyTrash(): Promise<void> {
    return noteCommands.emptyTrash(this.path)
  }

  kanbanListBoards(): Promise<KanbanBoard[]> {
    return kanbanCommands.listBoards(this.path)
  }
  kanbanCreateBoard(title: string, icon: string, folderId: string | null): Promise<KanbanBoard> {
    return kanbanCommands.createBoard(this.path, title, icon, folderId)
  }
  kanbanUpdateBoard(boardId: string, updates: KanbanBoardUpdate): Promise<KanbanBoard> {
    return kanbanCommands.updateBoard(this.path, boardId, updates)
  }
  kanbanDeleteBoard(boardId: string): Promise<void> {
    return kanbanCommands.deleteBoard(this.path, boardId)
  }
  kanbanSaveSchema(boardId: string, propertyDefinitions: KanbanPropertyDef[], columnRemap?: Record<string, string>): Promise<KanbanBoard> {
    return kanbanCommands.saveSchema(this.path, boardId, propertyDefinitions, columnRemap)
  }
  kanbanListCards(boardId: string): Promise<KanbanCard[]> {
    return kanbanCommands.listCards(this.path, boardId)
  }
  kanbanCreateCard(boardId: string, title: string, columnValue: string, statusPropertyId: string, columnOrder: number): Promise<KanbanCard> {
    return kanbanCommands.createCard(this.path, boardId, title, columnValue, statusPropertyId, columnOrder)
  }
  kanbanUpdateCard(boardId: string, cardId: string, updates: KanbanCardUpdate): Promise<KanbanCard> {
    return kanbanCommands.updateCard(this.path, boardId, cardId, updates)
  }
  kanbanMoveCard(boardId: string, cardId: string, toColumnOptionId: string, targetIndex: number): Promise<KanbanCard[]> {
    return kanbanCommands.moveCard(this.path, boardId, cardId, toColumnOptionId, targetIndex)
  }
  kanbanDeleteCard(boardId: string, cardId: string): Promise<void> {
    return kanbanCommands.deleteCard(this.path, boardId, cardId)
  }

  searchWorkspaceBlocks(query: string): Promise<WorkspaceBlockSearchItem[]> {
    return noteCommands.searchWorkspaceBlocks(this.path, query)
  }

  graphGetBacklinks(noteId: string): Promise<BacklinkRef[]> {
    return graphCommands.getBacklinks(this.path, noteId)
  }
  graphGetOutlinks(noteId: string): Promise<GraphEdge[]> {
    return graphCommands.getOutlinks(this.path, noteId)
  }
  graphUpdateNoteEdges(noteId: string, edges: ExtractedEdge[]): Promise<void> {
    return graphCommands.updateNoteEdges(this.path, noteId, edges)
  }
  graphRemoveNote(noteId: string): Promise<void> {
    return graphCommands.removeNote(this.path, noteId)
  }
  graphGetAllEdges(): Promise<GraphEdge[]> {
    return graphCommands.getAllEdges(this.path)
  }
}
