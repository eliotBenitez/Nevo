import { describe, expect, it, vi } from 'vitest'
import {
  stripNoteExtension,
  dirnamePosix,
  collectFolderPaths,
  createVaultLinkResolver,
} from './vaultGraph'

describe('stripNoteExtension', () => {
  it('strips .md, .markdown, .mdown, .mkd case-insensitively', () => {
    expect(stripNoteExtension('Note.md')).toBe('Note')
    expect(stripNoteExtension('Note.MD')).toBe('Note')
    expect(stripNoteExtension('Note.markdown')).toBe('Note')
    expect(stripNoteExtension('Note.mdown')).toBe('Note')
    expect(stripNoteExtension('Note.mkd')).toBe('Note')
  })

  it('leaves a path without a recognized extension untouched', () => {
    expect(stripNoteExtension('Note.txt')).toBe('Note.txt')
    expect(stripNoteExtension('Note')).toBe('Note')
  })

  it('only strips a trailing extension, not one mid-path', () => {
    expect(stripNoteExtension('folder/Note.md')).toBe('folder/Note')
  })
})

describe('dirnamePosix', () => {
  it('returns the parent directory of a nested path', () => {
    expect(dirnamePosix('a/b/n.md')).toBe('a/b')
  })

  it('returns the empty string for a root-level path', () => {
    expect(dirnamePosix('n.md')).toBe('')
  })

  it('returns the immediate parent for a single-level nested path', () => {
    expect(dirnamePosix('a/n.md')).toBe('a')
  })
})

describe('collectFolderPaths', () => {
  it('dedups shared ancestors across multiple notes', () => {
    const paths = collectFolderPaths(['a/b/n1.md', 'a/b/n2.md', 'a/c/n3.md'])
    expect(paths.sort()).toEqual(['a', 'a/b', 'a/c'].sort())
  })

  it('excludes root-level notes (no ancestor directories)', () => {
    expect(collectFolderPaths(['root.md'])).toEqual([])
  })

  it('orders parents before children (segment count ascending, then lexicographic)', () => {
    const paths = collectFolderPaths(['z/y/x/n.md', 'a/n.md'])
    expect(paths).toEqual(['a', 'z', 'z/y', 'z/y/x'])
  })

  it('returns an empty array for an empty vault', () => {
    expect(collectFolderPaths([])).toEqual([])
  })
})

describe('createVaultLinkResolver', () => {
  it('resolves by full path (without extension)', () => {
    const resolver = createVaultLinkResolver([
      { relativePath: 'folder/Note.md', noteId: 'note-1' },
      { relativePath: 'Other.md', noteId: 'note-2' },
    ])
    expect(resolver('folder/Note')).toBe('note-1')
  })

  it('resolves by basename when no full-path match exists', () => {
    const resolver = createVaultLinkResolver([
      { relativePath: 'folder/deep/Ideas.md', noteId: 'note-ideas' },
    ])
    expect(resolver('Ideas')).toBe('note-ideas')
  })

  it('resolves a [[folder/Note|Alias]]-style target (resolver only sees "folder/Note")', () => {
    const resolver = createVaultLinkResolver([
      { relativePath: 'folder/Note.md', noteId: 'note-1' },
    ])
    // markdownParser strips the |Alias / #Anchor part before calling the resolver.
    expect(resolver('folder/Note')).toBe('note-1')
  })

  it('resolves a basename collision to the shortest relativePath, deterministically', () => {
    const resolver = createVaultLinkResolver([
      { relativePath: 'a/b/c/Ideas.md', noteId: 'deep' },
      { relativePath: 'a/Ideas.md', noteId: 'shallow' },
      { relativePath: 'x/Ideas.md', noteId: 'also-shallow' },
    ])
    // 'a/Ideas.md' and 'x/Ideas.md' tie on segment count; 'a' < 'x' lexicographically.
    expect(resolver('Ideas')).toBe('shallow')
  })

  it('is case-insensitive for both full-path and basename matches', () => {
    const resolver = createVaultLinkResolver([
      { relativePath: 'Folder/Ideas.md', noteId: 'note-1' },
    ])
    expect(resolver('folder/IDEAS')).toBe('note-1')
    expect(resolver('IDEAS')).toBe('note-1')
  })

  it('returns null and invokes onUnresolved when nothing matches', () => {
    const onUnresolved = vi.fn()
    const resolver = createVaultLinkResolver(
      [{ relativePath: 'Note.md', noteId: 'note-1' }],
      onUnresolved,
    )
    expect(resolver('Ghost')).toBeNull()
    expect(onUnresolved).toHaveBeenCalledWith('Ghost')
  })

  it('does not invoke onUnresolved when a match is found', () => {
    const onUnresolved = vi.fn()
    const resolver = createVaultLinkResolver(
      [{ relativePath: 'Note.md', noteId: 'note-1' }],
      onUnresolved,
    )
    resolver('Note')
    expect(onUnresolved).not.toHaveBeenCalled()
  })

  it('normalizes backslashes and a leading "./" before matching', () => {
    const resolver = createVaultLinkResolver([
      { relativePath: 'folder/Note.md', noteId: 'note-1' },
    ])
    expect(resolver('.\\folder\\Note')).toBe('note-1')
    expect(resolver('./folder/Note')).toBe('note-1')
  })
})
