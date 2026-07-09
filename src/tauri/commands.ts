import { invoke } from '@tauri-apps/api/core'
import type {
  AppMetadata,
  AppConfig,
  WorkspaceCleanupReport,
  WorkspaceDiagnostics,
  WorkspaceManifest,
  WorkspaceSettings,
  PluginManifest,
  MarketplaceCatalog,
} from '../types/workspace'
import type { FolderMeta, ImportedImageAsset, NoteDocument, NoteSnapshotMeta, NoteSnapshotsEntry, SidebarNotePreview } from '../types/note'
import type { WorkspaceBlockSearchItem } from '../types/search'
import type { BacklinkRef, GraphEdge, ExtractedEdge } from '../types/graph'
import type { KanbanBoard, KanbanCard } from '../types/kanban'
import type { TemplateDocument, TemplateFieldValues } from '../types/template'
import { i18n } from '../i18n'
import { appLogger } from '../utils/logger'

/** A file made available to the Typst compiler: either inline bytes or a workspace-relative path. */
export interface TypstAsset {
  name: string
  bytesBase64?: string
  relPath?: string
}

function extractWorkspacePath(args: unknown): string | undefined {
  if (!args || typeof args !== 'object') return undefined
  const record = args as Record<string, unknown>
  const workspacePath = record.workspacePath
  if (typeof workspacePath === 'string') return workspacePath
  const path = record.path
  if (typeof path === 'string') return path
  return undefined
}

async function invokeCommand<T>(command: string, args?: Record<string, unknown>) {
  try {
    return await invoke<T>(command, args)
  } catch (error) {
    await appLogger.error({
      source: 'frontend.invoke',
      event: command,
      message: 'Tauri command failed',
      workspacePath: extractWorkspacePath(args),
      error,
    })
    throw error
  }
}

function activeLocale(): string {
  const locale = i18n.global.locale.value
  return typeof locale === 'string' ? locale : 'en'
}

export const configCommands = {
  loadAppConfig: () =>
    invokeCommand<AppConfig>('load_app_config'),

  saveAppConfig: (config: AppConfig) =>
    invokeCommand<void>('save_app_config', { config }),

  getAppMetadata: () =>
    invokeCommand<AppMetadata>('get_app_metadata'),

  listSystemFonts: () =>
    invokeCommand<string[]>('list_system_fonts'),
}

export const workspaceCommands = {
  createWorkspace: (args: { path: string; name: string; glyph: string; gradient: string }) =>
    invokeCommand<WorkspaceManifest>('create_workspace', args),

  openWorkspace: (path: string) =>
    invokeCommand<WorkspaceManifest>('open_workspace', { path }),

  saveManifest: (path: string, manifest: WorkspaceManifest) =>
    invokeCommand<void>('save_workspace_manifest', { path, manifest }),

  loadSettings: (workspacePath: string) =>
    invokeCommand<WorkspaceSettings>('load_workspace_settings', { workspacePath }),

  saveSettings: (workspacePath: string, settings: WorkspaceSettings) =>
    invokeCommand<void>('save_workspace_settings', { workspacePath, settings }),

  loadCustomCss: (workspacePath: string) =>
    invokeCommand<string>('load_custom_css', { workspacePath }),

  saveCustomCss: (workspacePath: string, css: string) =>
    invokeCommand<void>('save_custom_css', { workspacePath, css }),

  listPlugins: (workspacePath: string) =>
    invokeCommand<PluginManifest[]>('list_plugins', { workspacePath }),

  validatePluginManifest: (workspacePath: string, pluginId: string) =>
    invokeCommand<PluginManifest>('validate_plugin_manifest', { workspacePath, pluginId }),

  setPluginEnabled: (workspacePath: string, pluginId: string, enabled: boolean) =>
    invokeCommand<void>('set_plugin_enabled', { workspacePath, pluginId, enabled }),

  marketplaceListPlugins: (workspacePath: string, forceRefresh = false) =>
    invokeCommand<MarketplaceCatalog>('marketplace_list_plugins', { workspacePath, forceRefresh }),

  marketplaceInstallPlugin: (workspacePath: string, pluginId: string, version?: string) =>
    invokeCommand<PluginManifest>('marketplace_install_plugin', { workspacePath, pluginId, version }),

  marketplaceUpdatePlugin: (workspacePath: string, pluginId: string) =>
    invokeCommand<PluginManifest>('marketplace_update_plugin', { workspacePath, pluginId }),

  marketplaceRemovePlugin: (workspacePath: string, pluginId: string) =>
    invokeCommand<void>('marketplace_remove_plugin', { workspacePath, pluginId }),

  marketplaceRefreshCache: (workspacePath: string) =>
    invokeCommand<MarketplaceCatalog>('marketplace_refresh_cache', { workspacePath }),

  getWorkspaceDiagnostics: (workspacePath: string) =>
    invokeCommand<WorkspaceDiagnostics>('get_workspace_diagnostics', { workspacePath }),

  pruneWorkspaceSnapshots: (workspacePath: string, keepPerNote: number) =>
    invokeCommand<WorkspaceCleanupReport>('prune_workspace_snapshots', { workspacePath, keepPerNote }),

  cleanupOrphanedAssets: (workspacePath: string) =>
    invokeCommand<WorkspaceCleanupReport>('cleanup_orphaned_assets', { workspacePath }),
}

export const folderCommands = {
  createFolder: (workspacePath: string, parentId: string | null, title: string, icon: string) =>
    invokeCommand<FolderMeta>('create_folder', { workspacePath, parentId, title, icon }),

  renameFolder: (workspacePath: string, folderId: string, title: string) =>
    invokeCommand<void>('rename_folder', { workspacePath, folderId, title }),

  deleteFolder: (workspacePath: string, folderId: string, recursive: boolean) =>
    invokeCommand<void>('delete_folder', { workspacePath, folderId, recursive }),
}

export const noteCommands = {
  createNote: (workspacePath: string, folderId: string | null, title: string, icon: string) =>
    invokeCommand<NoteDocument>('create_note', { workspacePath, folderId, title, icon }),

  loadNote: (workspacePath: string, noteId: string) =>
    invokeCommand<NoteDocument>('load_note', { workspacePath, noteId }),

  saveNote: (workspacePath: string, note: NoteDocument) =>
    invokeCommand<void>('save_note', { workspacePath, note }),

  deleteNote: (workspacePath: string, noteId: string) =>
    invokeCommand<void>('delete_note', { workspacePath, noteId }),

  moveNote: (workspacePath: string, noteId: string, targetFolderId: string | null) =>
    invokeCommand<void>('move_note', { workspacePath, noteId, targetFolderId }),

  listSidebarNotePreviews: (workspacePath: string) =>
    invokeCommand<SidebarNotePreview[]>('list_sidebar_note_previews', { workspacePath }),

  listNoteSnapshots: (workspacePath: string, noteId: string) =>
    invokeCommand<NoteSnapshotMeta[]>('list_note_snapshots', { workspacePath, noteId }),

  listAllNoteSnapshots: (workspacePath: string) =>
    invokeCommand<NoteSnapshotsEntry[]>('list_all_note_snapshots', { workspacePath }),

  loadNoteSnapshot: (workspacePath: string, noteId: string, snapshotId: string) =>
    invokeCommand<NoteDocument>('load_note_snapshot', { workspacePath, noteId, snapshotId }),

  restoreNoteSnapshot: (workspacePath: string, noteId: string, snapshotId: string) =>
    invokeCommand<NoteDocument>('restore_note_snapshot', { workspacePath, noteId, snapshotId }),

  pruneNoteSnapshots: (workspacePath: string, noteId: string) =>
    invokeCommand<void>('prune_note_snapshots', { workspacePath, noteId }),

  restoreFromTrash: (workspacePath: string, itemId: string) =>
    invokeCommand<void>('restore_from_trash', { workspacePath, itemId }),

  permanentlyDeleteFromTrash: (workspacePath: string, itemId: string) =>
    invokeCommand<void>('permanently_delete_from_trash', { workspacePath, itemId }),

  emptyTrash: (workspacePath: string) =>
    invokeCommand<void>('empty_trash', { workspacePath }),

  importImageAsset: (workspacePath: string, fileName: string, bytes: number[]) =>
    invokeCommand<ImportedImageAsset>('import_image_asset', { workspacePath, fileName, bytes }),

  importAssetByPath: (workspacePath: string, sourcePath: string, fileName: string) =>
    invokeCommand<ImportedImageAsset>('import_asset_by_path', { workspacePath, sourcePath, fileName }),

  importAssetFromUrl: (workspacePath: string, url: string) =>
    invokeCommand<ImportedImageAsset>('import_asset_from_url', { workspacePath, url }),

  deleteUnreferencedAsset: (workspacePath: string, assetSrc: string) =>
    invokeCommand<boolean>('delete_unreferenced_asset', { workspacePath, assetSrc }),

  saveDrawAsset: (workspacePath: string, drawId: string, bytes: number[]) =>
    invokeCommand<string>('save_draw_asset', { workspacePath, drawId, bytes }),

  readDrawAsset: (workspacePath: string, src: string) =>
    invokeCommand<number[]>('read_draw_asset', { workspacePath, src }),

  readLatestDrawAsset: (workspacePath: string, drawId: string) =>
    invokeCommand<number[]>('read_latest_draw_asset', { workspacePath, drawId }),

  getMediaServerInfo: () =>
    invokeCommand<{ port: number; token: string }>('get_media_server_info'),

  searchWorkspaceBlocks: (workspacePath: string, query: string) =>
    invokeCommand<WorkspaceBlockSearchItem[]>('search_workspace_blocks', { workspacePath, query }),

  exportNoteMarkdown: (workspacePath: string, exportPath: string, content: string, assetSrcs: string[]) =>
    invokeCommand<void>('export_note_markdown', { workspacePath, exportPath, content, assetSrcs }),

  exportNoteHtml: (workspacePath: string, exportPath: string, content: string, assetSrcs: string[]) =>
    invokeCommand<void>('export_note_html', { workspacePath, exportPath, content, assetSrcs }),

  exportNoteDocx: (exportPath: string, bytes: number[]) =>
    invokeCommand<void>('export_note_docx', { exportPath, bytes }),

  exportNotePdf: (workspacePath: string, exportPath: string, typstSource: string, assets: TypstAsset[]) =>
    invokeCommand<void>('export_note_pdf', { workspacePath, exportPath, typstSource, assets }),

  exportNoteTypstArchive: (workspacePath: string, exportPath: string, typstSource: string, assets: TypstAsset[]) =>
    invokeCommand<void>('export_note_typst_archive', { workspacePath, exportPath, typstSource, assets }),

  exportDrawFile: (exportPath: string, bytes: number[]) =>
    invokeCommand<void>('export_draw_file', { exportPath, bytes }),

  renderNotePdfPreview: (workspacePath: string, typstSource: string, assets: TypstAsset[]) =>
    invokeCommand<string[]>('render_note_pdf_preview', { workspacePath, typstSource, assets }),

  readTextFile: (path: string) =>
    invokeCommand<string>('read_text_file', { path }),

  openFilePath: (path: string) =>
    invokeCommand<void>('open_file_path', { path }),
}

export const templateCommands = {
  listTemplates: (workspacePath: string) =>
    invokeCommand<TemplateDocument[]>('template_list', { workspacePath, locale: activeLocale() }),

  getTemplate: (workspacePath: string, templateId: string) =>
    invokeCommand<TemplateDocument>('template_get', { workspacePath, templateId, locale: activeLocale() }),

  createTemplate: (workspacePath: string, template: TemplateDocument) =>
    invokeCommand<TemplateDocument>('template_create', { workspacePath, template }),

  updateTemplate: (workspacePath: string, templateId: string, template: TemplateDocument) =>
    invokeCommand<TemplateDocument>('template_update', { workspacePath, templateId, template }),

  deleteTemplate: (workspacePath: string, templateId: string) =>
    invokeCommand<void>('template_delete', { workspacePath, templateId }),

  createNote: (workspacePath: string, templateId: string, folderId: string | null, title: string, icon: string, fieldValues: TemplateFieldValues) =>
    invokeCommand<NoteDocument>('template_create_note', { workspacePath, templateId, folderId, title, icon, fieldValues, locale: activeLocale() }),
}

export interface CollabServerInfo {
  url: string
  localIp: string
  port: number
}

export const collabCommands = {
  saveYjsState: (workspacePath: string, noteId: string, bytes: Uint8Array) =>
    // Pass the Y.Doc update as a raw IPC body (ArrayBuffer) instead of a JSON
    // number array, avoiding ~3-4× transport overhead. workspacePath/noteId
    // travel via headers since `invoke` accepts either args OR a raw body, not both.
    invoke<void>(
      'save_yjs_state',
      bytes,
      { headers: { 'nv-workspace-path': workspacePath, 'nv-note-id': noteId } },
    ),

  loadYjsState: (workspacePath: string, noteId: string) =>
    // Backend returns a raw binary response (ArrayBuffer), which we expose as
    // Uint8Array so callers can hand it straight to Yjs without re-encoding.
    invoke<ArrayBuffer>('load_yjs_state', { workspacePath, noteId }).then(
      (buf) => new Uint8Array(buf),
    ),

  deleteYjsState: (workspacePath: string, noteId: string) =>
    invokeCommand<boolean>('delete_yjs_state', { workspacePath, noteId }),

  startServer: (port: number) =>
    invokeCommand<CollabServerInfo>('start_collab_server', { port }),

  stopServer: () =>
    invokeCommand<void>('stop_collab_server'),

  getServerInfo: () =>
    invokeCommand<CollabServerInfo | null>('get_collab_server_info'),
}

export const kanbanCommands = {
  listBoards: (workspacePath: string) =>
    invokeCommand<KanbanBoard[]>('kanban_list_boards', { workspacePath }),

  createBoard: (workspacePath: string, title: string, icon: string, folderId: string | null) =>
    invokeCommand<KanbanBoard>('kanban_create_board', { workspacePath, title, icon, folderId }),

  updateBoard: (workspacePath: string, boardId: string, updates: {
    title?: string
    icon?: string
    statusPropertyId?: string
    propertyDefinitions?: unknown
    viewSettings?: unknown
  }) => invokeCommand<KanbanBoard>('kanban_update_board', { workspacePath, boardId, ...updates }),

  deleteBoard: (workspacePath: string, boardId: string) =>
    invokeCommand<void>('kanban_delete_board', { workspacePath, boardId }),

  listCards: (workspacePath: string, boardId: string) =>
    invokeCommand<KanbanCard[]>('kanban_list_cards', { workspacePath, boardId }),

  createCard: (workspacePath: string, boardId: string, title: string, columnValue: string, statusPropertyId: string, columnOrder: number) =>
    invokeCommand<KanbanCard>('kanban_create_card', { workspacePath, boardId, title, columnValue, statusPropertyId, columnOrder }),

  updateCard: (workspacePath: string, boardId: string, cardId: string, updates: {
    title?: string
    icon?: string
    content?: unknown
    properties?: unknown
    fields?: unknown
    columnOrder?: number
    progress?: number
    priority?: string
    links?: unknown
  }) => invokeCommand<KanbanCard>('kanban_update_card', { workspacePath, boardId, cardId, ...updates }),

  deleteCard: (workspacePath: string, boardId: string, cardId: string) =>
    invokeCommand<void>('kanban_delete_card', { workspacePath, boardId, cardId }),

  moveCard: (workspacePath: string, boardId: string, cardId: string, toColumnOptionId: string, targetIndex: number) =>
    invokeCommand<KanbanCard[]>('kanban_move_card', { workspacePath, boardId, cardId, toColumnOptionId, targetIndex }),

  saveSchema: (workspacePath: string, boardId: string, propertyDefinitions: unknown, columnRemap?: Record<string, string>) =>
    invokeCommand<KanbanBoard>('kanban_save_board_schema', { workspacePath, boardId, propertyDefinitions, columnRemap: columnRemap ?? null }),
}

export const graphCommands = {
  updateNoteEdges: (workspacePath: string, noteId: string, edges: ExtractedEdge[]) =>
    invokeCommand<void>('graph_update_note_edges', {
      workspacePath,
      noteId,
      edges: edges.map(e => ({ target: e.target, kind: e.kind, anchor: e.anchor })),
    }),

  getBacklinks: (workspacePath: string, noteId: string) =>
    invokeCommand<BacklinkRef[]>('graph_get_backlinks', { workspacePath, noteId }),

  getOutlinks: (workspacePath: string, noteId: string) =>
    invokeCommand<GraphEdge[]>('graph_get_outlinks', { workspacePath, noteId }),

  removeNote: (workspacePath: string, noteId: string) =>
    invokeCommand<void>('graph_remove_note', { workspacePath, noteId }),

  getAllEdges: (workspacePath: string) =>
    invokeCommand<GraphEdge[]>('graph_get_all_edges', { workspacePath }),
}

export interface GithubSyncResult {
  commitSha: string
  filesCount: number
  syncedAt: string
}

export const githubSyncCommands = {
  testConnection: (repo: string) =>
    invokeCommand<boolean>('github_sync_test_connection', { repo }),

  syncNow: (workspacePath: string) =>
    invokeCommand<GithubSyncResult>('github_sync_now', { workspacePath }),

  getStatus: (workspacePath: string) =>
    invokeCommand<Record<string, unknown>>('github_sync_get_status', { workspacePath }),

  startAuto: (workspacePath: string, intervalMinutes: number) =>
    invokeCommand<void>('github_sync_start_auto', { workspacePath, intervalMinutes }),

  stopAuto: () =>
    invokeCommand<void>('github_sync_stop_auto', {}),
}
