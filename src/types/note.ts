export interface BlockNode {
  type: string
  attrs?: Record<string, unknown>
  content?: BlockNode[]
  marks?: { type: string; attrs?: Record<string, unknown> }[]
  text?: string
}

export interface NoteDocument {
  id: string
  title: string
  icon: string
  cover?: string
  folderId: string | null
  createdAt: string
  updatedAt: string
  content: BlockNode
}

export interface NoteMeta {
  id: string
  title: string
  icon: string
  folderId: string | null
  updatedAt: string
}

export interface NoteSnapshotMeta {
  id: string
  noteId: string
  createdAt: string
  updatedAt: string
}

export interface ImportedImageAsset {
  src: string
  hash: string
  deduplicated: boolean
  bytes: number
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
