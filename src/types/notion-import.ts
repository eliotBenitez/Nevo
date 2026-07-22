import type { ImportedImageAsset } from './note'

export type NotionExportDocumentKind = 'markdown' | 'csv'

export interface NotionExportDocument {
  relativePath: string
  kind: NotionExportDocumentKind
  content: string
  size: number
}

export interface NotionExportAsset {
  relativePath: string
  size: number
}

export interface NotionExportSkipped {
  relativePath: string
  reason: string
}

export interface NotionExportManifest {
  sessionToken: string
  exportName: string
  documents: NotionExportDocument[]
  assets: NotionExportAsset[]
  skipped: NotionExportSkipped[]
}

export interface NotionAssetImportResult {
  relativePath: string
  asset: ImportedImageAsset | null
  error: string | null
}

export type NotionImportPhase =
  | 'idle'
  | 'scanning'
  | 'folders'
  | 'creating'
  | 'assets'
  | 'writing'
  | 'done'
  | 'error'

export interface NotionImportProgress {
  phase: NotionImportPhase
  totalItems: number
  processedItems: number
  foldersCreated: number
  notesCreated: number
  databasesCreated: number
  assetsImported: number
  warnings: number
  errors: number
  error: string | null
}

export interface NotionImportIssue {
  path: string
  reason: string
}

export interface NotionImportResult {
  rootName: string
  rootFolderId: string
  foldersCreated: number
  notesCreated: number
  databasesCreated: number
  assetsImported: number
  warnings: number
  errors: number
  issues: NotionImportIssue[]
}
