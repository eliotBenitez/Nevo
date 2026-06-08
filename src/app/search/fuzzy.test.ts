import { describe, expect, it } from 'vitest'
import type { WorkspaceManifest } from '../../types/workspace'
import type { TitleBarSearchResult } from '../../types/search'
import {
  collectWorkspaceEntitySearchItems,
  rankTitleBarResults,
  groupVisibleTitleBarResults,
} from './index'

const manifest: WorkspaceManifest = {
  id: 'workspace-1',
  name: 'Workspace',
  glyph: 'N',
  gradient: 'violet',
  schemaVersion: 1,
  createdAt: '2026-05-16T10:00:00.000Z',
  rootOrder: ['note-root', 'folder-1'],
  rootNotes: [
    {
      id: 'note-root',
      title: 'Alpha root',
      icon: '📄',
      folderId: null,
      updatedAt: '2026-05-16T10:00:00.000Z',
    },
  ],
  tree: [
    {
      id: 'folder-1',
      title: 'Projects',
      icon: '📁',
      parentId: null,
      order: 0,
      notes: [
        {
          id: 'note-1',
          title: 'Beta note',
          icon: '📄',
          folderId: 'folder-1',
          updatedAt: '2026-05-16T10:00:00.000Z',
        },
      ],
      children: [
        {
          id: 'folder-2',
          title: 'Archives',
          icon: '📁',
          parentId: 'folder-1',
          order: 0,
          notes: [],
          children: [],
        },
      ],
    },
  ],
}

describe('titlebar search ranking', () => {
  it('collects note and folder items with path context', () => {
    expect(collectWorkspaceEntitySearchItems(manifest)).toEqual([
      expect.objectContaining({
        type: 'note',
        id: 'note-root',
        title: 'Alpha root',
        pathLabel: '',
      }),
      expect.objectContaining({
        type: 'folder',
        id: 'folder-1',
        title: 'Projects',
        pathLabel: '',
      }),
      expect.objectContaining({
        type: 'note',
        id: 'note-1',
        title: 'Beta note',
        pathLabel: 'Projects',
      }),
      expect.objectContaining({
        type: 'folder',
        id: 'folder-2',
        title: 'Archives',
        pathLabel: 'Projects',
      }),
    ])
  })

  it('ranks prefix matches ahead of substring and fuzzy matches', () => {
    const results: TitleBarSearchResult[] = [
      {
        type: 'note',
        id: 'prefix',
        title: 'Alpha note',
        pathLabel: '',
      },
      {
        type: 'note',
        id: 'substring',
        title: 'Project alpha',
        pathLabel: '',
      },
      {
        type: 'note',
        id: 'fuzzy',
        title: 'Aerial help',
        pathLabel: '',
      },
    ]

    expect(rankTitleBarResults('alp', results).map(item => item.id)).toEqual([
      'prefix',
      'substring',
      'fuzzy',
    ])
  })

  it('sorts inside groups while preserving grouped output', () => {
    const results: TitleBarSearchResult[] = [
      {
        type: 'setting',
        id: 'setting-1',
        title: 'Alpha theme',
        description: 'Choose the alpha theme',
        value: 'Light',
        section: 'appearance',
        sectionLabel: 'Appearance',
      },
      {
        type: 'note',
        id: 'note-2',
        title: 'Project alpha',
        pathLabel: '',
      },
      {
        type: 'block',
        id: 'block-1',
        noteId: 'note-3',
        noteTitle: 'Gamma',
        folderId: null,
        blockIndex: 2,
        snippet: 'alpha appears in a block',
        blockText: 'alpha appears in a block',
      },
      {
        type: 'note',
        id: 'note-1',
        title: 'Alpha note',
        pathLabel: '',
      },
    ]

    const groups = groupVisibleTitleBarResults('alpha', results)

    expect(groups.map(group => group.id)).toEqual(['entities', 'blocks', 'settings'])
    expect(groups[0]?.items.map(item => item.id)).toEqual(['note-1', 'note-2'])
    expect(groups[1]?.items.map(item => item.id)).toEqual(['block-1'])
    expect(groups[2]?.items.map(item => item.id)).toEqual(['setting-1'])
  })
})
