export interface BlockNode {
  type: string
  attrs?: Record<string, unknown>
  content?: BlockNode[]
  marks?: { type: string; attrs?: Record<string, unknown> }[]
  text?: string
}

export type NoteType = 'note' | 'task' | 'idea' | 'meeting' | 'project' | 'research'

export type NoteStatus = 'none' | 'draft' | 'active' | 'waiting' | 'done'

export interface NoteProperties {
  type: NoteType | null
  tags: string[]
  date: string | null
  status: NoteStatus | null
}

export interface NoteDocument {
  id: string
  title: string
  icon: string
  cover?: string
  folderId: string | null
  createdAt: string
  updatedAt: string
  properties?: NoteProperties
  content: BlockNode
}

export interface NoteMeta {
  id: string
  title: string
  icon: string
  folderId: string | null
  updatedAt: string
}

export interface SidebarNotePreview {
  noteId: string
  title: string
  icon: string
  folderPath: string
  updatedAt: string
  tags: string[]
  previewText: string
}

export interface NoteSnapshotMeta {
  id: string
  noteId: string
  createdAt: string
  updatedAt: string
}

export interface NoteSnapshotsEntry {
  noteId: string
  snapshots: NoteSnapshotMeta[]
}

export interface ImportedImageAsset {
  src: string
  hash: string
  deduplicated: boolean
  bytes: number
}

export interface PickedImportedAsset extends ImportedImageAsset {
  fileName: string
}

/** A markdown note discovered while walking an Obsidian vault (Phase 1 import). */
export interface VaultNote {
  relativePath: string
  content: string
}

/** An attachment discovered in the vault. Bytes are fetched lazily via `importVaultAsset`. */
export interface VaultAsset {
  relativePath: string
  size: number
}

/** A vault file that could not be read into the manifest (oversized note, read error, etc). */
export interface VaultSkipped {
  relativePath: string
  reason: string
}

export interface VaultManifest {
  rootName: string
  notes: VaultNote[]
  assets: VaultAsset[]
  skipped: VaultSkipped[]
}

export interface FolderMeta {
  id: string
  title: string
  icon: string
  parentId: string | null
  order: number
  children: FolderMeta[]
  notes: NoteMeta[]
}

export type TreeNode =
  | { kind: 'folder'; meta: FolderMeta }
  | { kind: 'note'; meta: NoteMeta }
