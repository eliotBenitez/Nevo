import type { SettingsSectionId } from './workspace'

export interface WorkspaceNoteSearchItem {
  type: 'note'
  id: string
  title: string
  pathLabel: string
}

export interface WorkspaceFolderSearchItem {
  type: 'folder'
  id: string
  title: string
  pathLabel: string
}

export type WorkspaceEntitySearchItem = WorkspaceNoteSearchItem | WorkspaceFolderSearchItem

export interface WorkspaceBlockSearchItem {
  type: 'block'
  id: string
  noteId: string
  noteTitle: string
  folderId: string | null
  blockIndex: number
  snippet: string
  blockText: string
}

export interface WorkspaceSettingSearchItem {
  type: 'setting'
  id: string
  title: string
  description: string
  value: string
  section: SettingsSectionId
  sectionLabel: string
}

export type TitleBarSearchResult =
  | WorkspaceEntitySearchItem
  | WorkspaceBlockSearchItem
  | WorkspaceSettingSearchItem

export interface WorkspaceBlockNavigationTarget {
  noteId: string
  blockIndex: number
  query: string
  snippet?: string
}
