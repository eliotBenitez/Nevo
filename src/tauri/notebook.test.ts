import { beforeEach, describe, expect, it, vi } from 'vitest'

const invoke = vi.hoisted(() => vi.fn())
vi.mock('@tauri-apps/api/core', () => ({ invoke }))
vi.mock('../utils/logger', () => ({ appLogger: { error: vi.fn() } }))

import { createNotebook, exportNotebookPdf, exportNotebookSource } from './notebook'
import type { NotebookExportV1 } from '../core/notebook/types'

describe('notebook Tauri wrappers', () => {
  beforeEach(() => {
    invoke.mockReset()
  })

  it('creates a notebook with the workspace folder, title, icon and paper', async () => {
    const note = { id: 'note-1', documentKind: 'notebook' }
    invoke.mockResolvedValue(note)

    await expect(createNotebook({
      workspacePath: 'C:/notes',
      folderId: 'folder-1',
      title: 'Lecture',
      icon: 'notebook',
      paper: 'ruled',
    })).resolves.toBe(note)
    expect(invoke).toHaveBeenCalledWith('create_notebook', {
      workspacePath: 'C:/notes',
      folderId: 'folder-1',
      title: 'Lecture',
      icon: 'notebook',
      paper: 'ruled',
    })
  })

  it('exports a structured immutable page snapshot and preserves cancellation', async () => {
    const pages: NotebookExportV1['pages'] = [{
      id: 'page-1',
      width: 595.28,
      height: 841.89,
      paper: { kind: 'plain', lines: [] },
      paths: [],
      images: [],
    }]
    invoke.mockResolvedValue({ status: 'cancelled' })

    await expect(exportNotebookPdf({
      workspacePath: 'C:/notes',
      noteId: 'note-1',
      fileName: 'Lecture.pdf',
      pages,
    })).resolves.toEqual({ status: 'cancelled' })
    expect(invoke).toHaveBeenCalledWith('export_notebook_pdf', {
      workspacePath: 'C:/notes',
      noteId: 'note-1',
      fileName: 'Lecture.pdf',
      pages,
    })
  })

  it('logs and rethrows native errors', async () => {
    invoke.mockRejectedValue(new Error('denied'))
    await expect(exportNotebookPdf({
      workspacePath: '/workspace',
      noteId: 'n',
      fileName: 'n.pdf',
      pages: [],
    })).rejects.toThrow('denied')
  })

  it('exports an unsupported notebook source through the native save picker', async () => {
    invoke.mockResolvedValue({ status: 'exported' })
    await expect(exportNotebookSource({ workspacePath: '/workspace', noteId: 'note-raw' })).resolves.toEqual({ status: 'exported' })
    expect(invoke).toHaveBeenCalledWith('export_note_source', { workspacePath: '/workspace', noteId: 'note-raw' })
  })
})
