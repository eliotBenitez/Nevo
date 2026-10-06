import { describe, expect, it } from 'vitest'
import type { BlockNode, SidebarNotePreview } from '../../types/note'
import { i18n } from '../../i18n'
import { pluralChoice } from '../plural-index'
import { buildSidebarPreviewText, filterSidebarPreviewsByTags, notebookPreviewSummary, sortSidebarPreviews } from './sidebarNotePreviews'

describe('sidebar note previews', () => {
  it('builds preview text from blocks and skips empty service blocks', () => {
    const content: BlockNode = {
      type: 'doc',
      content: [
        { type: 'paragraph' },
        { type: 'image', attrs: { src: 'cover.png' } },
        { type: 'paragraph', content: [{ type: 'text', text: ' First   line ' }] },
        { type: 'heading', content: [{ type: 'text', text: 'Second line' }] },
      ],
    }

    expect(buildSidebarPreviewText(content)).toBe('First line · Second line')
  })

  it('filters selected tags with OR logic without changing incoming order', () => {
    const previews: SidebarNotePreview[] = [
      { noteId: 'a', title: 'A', icon: 'A', folderPath: '', updatedAt: '2026-01-01T10:00:00.000Z', tags: ['alpha'], previewText: '' },
      { noteId: 'b', title: 'B', icon: 'B', folderPath: '', updatedAt: '2026-01-03T10:00:00.000Z', tags: ['beta'], previewText: '' },
      { noteId: 'c', title: 'C', icon: 'C', folderPath: '', updatedAt: '2026-01-02T10:00:00.000Z', tags: ['gamma'], previewText: '' },
      { noteId: 'd', title: 'D', icon: 'D', folderPath: '', updatedAt: '2026-01-04T10:00:00.000Z', tags: [], previewText: '' },
    ]

    expect(filterSidebarPreviewsByTags(previews, new Set(['alpha', 'beta'])).map(item => item.noteId)).toEqual(['a', 'b'])
    expect(filterSidebarPreviewsByTags(previews, new Set()).map(item => item.noteId)).toEqual(['a', 'b', 'c', 'd'])
  })

  it('sorts sidebar previews by the selected sidebar mode', () => {
    const previews: SidebarNotePreview[] = [
      { noteId: 'a', title: 'Beta 2', icon: 'A', folderPath: '', updatedAt: '2026-01-01T10:00:00.000Z', tags: [], previewText: '' },
      { noteId: 'b', title: 'Alpha 10', icon: 'B', folderPath: '', updatedAt: '2026-01-03T10:00:00.000Z', tags: [], previewText: '' },
      { noteId: 'c', title: 'Alpha 2', icon: 'C', folderPath: '', updatedAt: '2026-01-02T10:00:00.000Z', tags: [], previewText: '' },
    ]

    expect(sortSidebarPreviews(previews, 'manual').map(item => item.noteId)).toEqual(['a', 'b', 'c'])
    expect(sortSidebarPreviews(previews, 'name-asc').map(item => item.noteId)).toEqual(['c', 'b', 'a'])
    expect(sortSidebarPreviews(previews, 'name-desc').map(item => item.noteId)).toEqual(['a', 'b', 'c'])
    expect(sortSidebarPreviews(previews, 'updated').map(item => item.noteId)).toEqual(['b', 'c', 'a'])
  })
})

describe('notebookPreviewSummary', () => {
  function summary(locale: 'en' | 'ru', preview: Pick<SidebarNotePreview, 'documentKind' | 'notebookPageCount'>) {
    const previous = i18n.global.locale.value
    i18n.global.locale.value = locale
    try {
      return notebookPreviewSummary(preview, i18n.global.t, count => pluralChoice(locale, count))
    } finally {
      i18n.global.locale.value = previous
    }
  }

  it('summarizes notebooks with a pluralized page count', () => {
    expect(summary('ru', { documentKind: 'notebook', notebookPageCount: 1 })).toBe('Тетрадь · 1 страница')
    expect(summary('ru', { documentKind: 'notebook', notebookPageCount: 3 })).toBe('Тетрадь · 3 страницы')
    expect(summary('ru', { documentKind: 'notebook', notebookPageCount: 5 })).toBe('Тетрадь · 5 страниц')
    expect(summary('en', { documentKind: 'notebook', notebookPageCount: 2 })).toBe('Notebook · 2 pages')
  })

  it('leaves ordinary notes to their text preview', () => {
    expect(summary('en', {})).toBeNull()
  })
})
