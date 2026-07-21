import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type { FolderMeta, NoteMeta } from '../types/note'
import type { WorkspaceManifest } from '../types/workspace'
import { useTreeStore } from './tree'
import { useWorkspaceStore } from './workspace'

function note(id: string, folderId: string | null = null): NoteMeta {
  return { id, title: id.toUpperCase(), icon: '📄', folderId, updatedAt: '2026-01-01T00:00:00.000Z' }
}

function folder(id: string, partial: Partial<FolderMeta> = {}): FolderMeta {
  return { id, title: id.toUpperCase(), icon: '📁', parentId: null, order: 0, children: [], notes: [], ...partial }
}

function buildManifest(): WorkspaceManifest {
  // rootOrder interleaves a note, a folder, and another note to exercise the
  // map-based resolution (folders/notes resolved by id, order preserved).
  const child = folder('child', { parentId: 'f1', notes: [note('n-child', 'child')] })
  const f1 = folder('f1', { children: [child], notes: [note('n-f1', 'f1')] })
  return {
    id: 'ws',
    name: 'WS',
    glyph: 'N',
    gradient: '',
    schemaVersion: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    rootOrder: ['rn1', 'f1', 'rn2'],
    tree: [f1],
    rootNotes: [note('rn1'), note('rn2')],
  }
}

describe('useTreeStore computeds', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('resolves the root tree in rootOrder, interleaving folders and notes', () => {
    const workspaceStore = useWorkspaceStore()
    workspaceStore.manifest = buildManifest()
    const treeStore = useTreeStore()

    expect(treeStore.tree.map(n => `${n.kind}:${n.meta.id}`)).toEqual([
      'note:rn1',
      'folder:f1',
      'note:rn2',
    ])
  })

  it('indexes every folder and note (including nested) by id', () => {
    const workspaceStore = useWorkspaceStore()
    workspaceStore.manifest = buildManifest()
    const treeStore = useTreeStore()

    expect([...treeStore.folderById.keys()].sort()).toEqual(['child', 'f1'])
    expect([...treeStore.noteById.keys()].sort()).toEqual(['n-child', 'n-f1', 'rn1', 'rn2'])
  })

  it('returns an empty tree when no manifest is loaded', () => {
    const treeStore = useTreeStore()
    expect(treeStore.tree).toEqual([])
    expect(treeStore.folderById.size).toBe(0)
    expect(treeStore.noteById.size).toBe(0)
  })

  it('replaces note metadata so a renamed title invalidates the tree view', () => {
    const workspaceStore = useWorkspaceStore()
    workspaceStore.manifest = buildManifest()
    const treeStore = useTreeStore()
    const previousRootMeta = treeStore.noteById.get('rn1')
    const previousNestedMeta = treeStore.noteById.get('n-child')

    treeStore.syncNoteMeta('rn1', { title: 'Renamed root note' })
    treeStore.syncNoteMeta('n-child', { title: 'Renamed nested note' })

    expect(treeStore.noteById.get('rn1')).toMatchObject({ title: 'Renamed root note' })
    expect(treeStore.noteById.get('n-child')).toMatchObject({ title: 'Renamed nested note' })
    expect(treeStore.noteById.get('rn1')).not.toBe(previousRootMeta)
    expect(treeStore.noteById.get('n-child')).not.toBe(previousNestedMeta)
  })

  describe('resolveNoteIdByTitle (wiki-link resolution)', () => {
    it('resolves a note id by exact title (case-insensitive)', () => {
      const workspaceStore = useWorkspaceStore()
      workspaceStore.manifest = buildManifest()
      const treeStore = useTreeStore()

      // NoteMeta title is the uppercased id ("RN1"); resolution is case-insensitive.
      expect(treeStore.resolveNoteIdByTitle('rn1')).toBe('rn1')
      expect(treeStore.resolveNoteIdByTitle('  RN1  ')).toBe('rn1')
    })

    it('resolves a note nested inside a folder', () => {
      const workspaceStore = useWorkspaceStore()
      workspaceStore.manifest = buildManifest()
      const treeStore = useTreeStore()

      expect(treeStore.resolveNoteIdByTitle('N-CHILD')).toBe('n-child')
    })

    it('returns null for an unknown title and for empty/blank input', () => {
      const workspaceStore = useWorkspaceStore()
      workspaceStore.manifest = buildManifest()
      const treeStore = useTreeStore()

      expect(treeStore.resolveNoteIdByTitle('nope')).toBeNull()
      expect(treeStore.resolveNoteIdByTitle('')).toBeNull()
      expect(treeStore.resolveNoteIdByTitle('   ')).toBeNull()
    })
  })
})
