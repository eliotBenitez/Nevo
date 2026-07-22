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
  MarketplacePreparedPlugin,
  MarketplaceMigrationBundle,
} from '../types/workspace'
import type { FolderMeta, ImportedImageAsset, NoteDocument, NoteSnapshotMeta, NoteSnapshotsEntry, PickedImportedAsset, SidebarNotePreview, VaultManifest } from '../types/note'
import type { WorkspaceBlockSearchItem } from '../types/search'
import type { BacklinkRef, GraphEdge, ExtractedEdge } from '../types/graph'
import type { KanbanBoard, KanbanCard } from '../types/kanban'
import type { TemplateDocument, TemplateFieldValues } from '../types/template'
import type { NotionAssetImportResult, NotionExportManifest } from '../types/notion-import'
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

export type WorkspaceLocation = 'root' | 'notes' | 'assets' | 'metadata' | 'settings' | 'plugins'
export type AppLocation = 'config' | 'appData' | 'logs'

export const systemCommands = {
  openWorkspaceLocation: (
    workspacePath: string,
    location: WorkspaceLocation,
    options: { pluginId?: string; reveal?: boolean } = {},
  ) => invokeCommand<void>('open_workspace_location', {
    workspacePath,
    location,
    pluginId: options.pluginId,
    reveal: options.reveal ?? false,
  }),

  openAppLocation: (location: AppLocation, reveal = false) =>
    invokeCommand<void>('open_app_location', { location, reveal }),

  openExternalUrl: (url: string) =>
    invokeCommand<void>('open_external_url', { url }),

  pickWorkspaceDirectory: () =>
    invokeCommand<string | null>('pick_workspace_directory'),
}

export function pickAndScanNotionExport() {
  return invokeCommand<NotionExportManifest | null>('pick_and_scan_notion_export')
}

export function importNotionAssets(workspacePath: string, sessionToken: string, paths: string[]) {
  return invokeCommand<NotionAssetImportResult[]>('import_notion_assets', {
    workspacePath,
    sessionToken,
    paths,
  })
}

export function releaseNotionImport(sessionToken: string) {
  return invokeCommand<boolean>('release_notion_import', { sessionToken })
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

  createPluginCodeSession: (workspacePath: string, pluginId: string, entryPoint: string) =>
    invokeCommand<{ token: string; entryUrl: string }>('plugin_create_code_session', {
      workspacePath,
      pluginId,
      entryPoint,
    }),

  createStagedPluginCodeSession: (
    workspacePath: string,
    transactionId: string,
    pluginId: string,
    entryPoint: string,
  ) => invokeCommand<{ token: string; entryUrl: string }>('plugin_create_staged_code_session', {
    workspacePath,
    transactionId,
    pluginId,
    entryPoint,
  }),

  revokePluginCodeSession: (token: string) =>
    invokeCommand<void>('plugin_revoke_code_session', { token }),

  pluginStorageGet: <T = unknown>(
    workspacePath: string,
    pluginId: string,
    scope: 'workspace' | 'local',
    key: string,
  ) => invokeCommand<T | null>('plugin_storage_get', { workspacePath, pluginId, scope, key }),

  pluginStorageSet: (
    workspacePath: string,
    pluginId: string,
    scope: 'workspace' | 'local',
    key: string,
    value: unknown,
  ) => invokeCommand<void>('plugin_storage_set', { workspacePath, pluginId, scope, key, value }),

  pluginStorageDelete: (
    workspacePath: string,
    pluginId: string,
    scope: 'workspace' | 'local',
    key: string,
  ) => invokeCommand<void>('plugin_storage_delete', { workspacePath, pluginId, scope, key }),

  pluginStorageSnapshot: (
    workspacePath: string,
    pluginId: string,
    scope: 'workspace' | 'local',
  ) => invokeCommand<Record<string, unknown>>('plugin_storage_snapshot', {
    workspacePath,
    pluginId,
    scope,
  }),

  pluginAssetWrite: (
    workspacePath: string,
    pluginId: string,
    dataBase64: string,
  ) => invokeCommand<string>('plugin_asset_write', { workspacePath, pluginId, dataBase64 }),

  pluginAssetRead: (
    workspacePath: string,
    pluginId: string,
    assetId: string,
  ) => invokeCommand<string | null>('plugin_asset_read', { workspacePath, pluginId, assetId }),

  pluginAssetDelete: (
    workspacePath: string,
    pluginId: string,
    assetId: string,
  ) => invokeCommand<void>('plugin_asset_delete', { workspacePath, pluginId, assetId }),

  pluginAssetBeginUpload: (
    workspacePath: string,
    pluginId: string,
  ) => invokeCommand<string>('plugin_asset_begin_upload', { workspacePath, pluginId }),

  pluginAssetAppendChunk: (
    workspacePath: string,
    pluginId: string,
    uploadId: string,
    chunkBase64: string,
  ) => invokeCommand<void>('plugin_asset_append_chunk', {
    workspacePath,
    pluginId,
    uploadId,
    chunkBase64,
  }),

  pluginAssetFinishUpload: (
    workspacePath: string,
    pluginId: string,
    uploadId: string,
  ) => invokeCommand<string>('plugin_asset_finish_upload', { workspacePath, pluginId, uploadId }),

  pluginAssetAbortUpload: (
    workspacePath: string,
    pluginId: string,
    uploadId: string,
  ) => invokeCommand<void>('plugin_asset_abort_upload', { workspacePath, pluginId, uploadId }),

  pluginAssetUrl: (
    workspacePath: string,
    pluginId: string,
    assetId: string,
  ) => invokeCommand<string>('plugin_asset_url', { workspacePath, pluginId, assetId }),

  pluginRegistryLoad: (workspacePath: string) =>
    invokeCommand<{
      version: 1
      plugins: Record<string, {
        version: string
        dataVersion: number
        contributions: Array<Record<string, unknown>>
      }>
    }>('plugin_registry_load', { workspacePath }),

  pluginRegistrySave: (
    workspacePath: string,
    registry: {
      version: 1
      plugins: Record<string, {
        version: string
        dataVersion: number
        contributions: Array<Record<string, unknown>>
      }>
    },
  ) => invokeCommand<void>('plugin_registry_save', { workspacePath, registry }),

  pluginNetworkFetch: (
    workspacePath: string,
    pluginId: string,
    request: {
      url: string
      method: string
      headers?: Record<string, string>
      bodyBase64?: string
    },
  ) => invokeCommand<{
    status: number
    headers: Record<string, string>
    bodyBase64: string
  }>('plugin_network_fetch', { workspacePath, pluginId, request }),

  marketplaceListPlugins: (workspacePath: string, forceRefresh = false) =>
    invokeCommand<MarketplaceCatalog>('marketplace_list_plugins', { workspacePath, forceRefresh }),

  marketplaceInstallPlugin: (
    workspacePath: string,
    pluginId: string,
    permissionFingerprint: string,
    version?: string,
  ) => invokeCommand<PluginManifest>('marketplace_install_plugin', {
    workspacePath,
    pluginId,
    version,
    permissionFingerprint,
  }),

  marketplaceUpdatePlugin: (workspacePath: string, pluginId: string, permissionFingerprint: string) =>
    invokeCommand<PluginManifest>('marketplace_update_plugin', {
      workspacePath,
      pluginId,
      permissionFingerprint,
    }),

  marketplacePreparePlugin: (
    workspacePath: string,
    pluginId: string,
    permissionFingerprint: string,
    options: { version?: string; update: boolean },
  ) => invokeCommand<MarketplacePreparedPlugin>('marketplace_prepare_plugin', {
    workspacePath,
    pluginId,
    version: options.version,
    update: options.update,
    permissionFingerprint,
  }),

  marketplaceCommitPlugin: (
    workspacePath: string,
    transactionId: string,
    permissionFingerprint: string,
    migration?: MarketplaceMigrationBundle,
  ) => invokeCommand<PluginManifest>('marketplace_commit_plugin', {
    workspacePath,
    transactionId,
    permissionFingerprint,
    migration,
  }),

  marketplaceAbortPlugin: (workspacePath: string, transactionId: string) =>
    invokeCommand<void>('marketplace_abort_plugin', { workspacePath, transactionId }),

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

  // Bumps a note's `updated_at` (note file + manifest entry) without touching
  // content. For callers that mutate a note's Y.Doc directly (bypassing
  // saveNote), e.g. draw-canvas sync, so "recently modified" stays accurate.
  touchNoteUpdatedAt: (workspacePath: string, noteId: string) =>
    invokeCommand<string>('touch_note_updated_at', { workspacePath, noteId }),

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

  pickAndImportAsset: (workspacePath: string, kind: 'image' | 'audio' | 'video' | 'file') =>
    invokeCommand<PickedImportedAsset | null>('pick_and_import_asset', { workspacePath, kind }),

  importClipboardImagePath: (workspacePath: string) =>
    invokeCommand<PickedImportedAsset | null>('import_clipboard_image_path', { workspacePath }),

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

  exportNoteMarkdown: (
    workspacePath: string,
    defaultFileName: string,
    content: string,
    assetSrcs: string[],
    assetsSubfolderName: string,
  ) => invokeCommand<boolean>('export_note_markdown', {
    workspacePath,
    defaultFileName,
    content,
    assetSrcs,
    assetsSubfolderName,
  }),

  exportNoteHtml: (
    workspacePath: string,
    defaultFileName: string,
    content: string,
    assetSrcs: string[],
    assetsSubfolderName: string,
  ) => invokeCommand<boolean>('export_note_html', {
    workspacePath,
    defaultFileName,
    content,
    assetSrcs,
    assetsSubfolderName,
  }),

  exportNoteDocx: (defaultFileName: string, bytes: number[]) =>
    invokeCommand<boolean>('export_note_docx', { defaultFileName, bytes }),

  exportNotePdf: (workspacePath: string, defaultFileName: string, typstSource: string, assets: TypstAsset[]) =>
    invokeCommand<boolean>('export_note_pdf', { workspacePath, defaultFileName, typstSource, assets }),

  exportNoteTypstArchive: (workspacePath: string, defaultFileName: string, typstSource: string, assets: TypstAsset[]) =>
    invokeCommand<boolean>('export_note_typst_archive', { workspacePath, defaultFileName, typstSource, assets }),

  exportDrawFile: (defaultFileName: string, bytes: number[]) =>
    invokeCommand<boolean>('export_draw_file', { defaultFileName, bytes }),

  prepareNotePdfPreview: (workspacePath: string, typstSource: string, assets: TypstAsset[]) =>
    invokeCommand<{ token: number; totalPages: number }>('prepare_note_pdf_preview', { workspacePath, typstSource, assets }),

  renderNotePdfPreviewPages: (token: number, start: number, count: number) =>
    invokeCommand<string[]>('render_note_pdf_preview_pages', { token, start, count }),

  pickAndReadTextFile: () =>
    invokeCommand<{ content: string; fileName: string } | null>('pick_and_read_text_file'),

  openWorkspaceAsset: (workspacePath: string, assetSrc: string) =>
    invokeCommand<void>('open_workspace_asset', { workspacePath, assetSrc }),

  readObsidianVault: (vaultPath: string) =>
    invokeCommand<VaultManifest>('read_obsidian_vault', { vaultPath }),

  importVaultAsset: (workspacePath: string, vaultPath: string, relativePath: string) =>
    invokeCommand<ImportedImageAsset>('import_vault_asset', { workspacePath, vaultPath, relativePath }),
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
  sessionToken: string
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
