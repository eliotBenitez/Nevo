import { describe, expect, it, vi } from 'vitest'
import { createNotebook } from '../../../core/notebook/codec'
import { createNotebookExport } from '../../../core/notebook/export'
import { renderNotebookExport, useNotebookExport } from './useNotebookExport'

describe('notebook vector export', () => {
  it('sends an immutable structured snapshot to the worker and keeps blank pages', async () => {
    const snapshot = createNotebook('ruled')
    const listeners = new Map<string, (event: MessageEvent) => void>()
    let clonedRequest: { id: number; snapshot: typeof snapshot; includePaper: boolean } | undefined
    const terminate = vi.fn()
    const pages = await renderNotebookExport(snapshot, false, () => ({
      addEventListener: (type, handler) => { listeners.set(type, handler as (event: MessageEvent) => void) },
      removeEventListener: type => { listeners.delete(type) },
      terminate,
      postMessage: request => {
        clonedRequest = structuredClone(request)
        queueMicrotask(() => listeners.get('message')?.({ data: { id: request.id, ok: true, pages: createNotebookExport(clonedRequest!.snapshot, clonedRequest!.includePaper).pages } } as MessageEvent))
      },
    }))

    expect(clonedRequest?.snapshot.pages).toHaveLength(1)
    expect(pages).toHaveLength(1)
    expect(pages[0].paths).toEqual([])
    expect(pages[0].paper.lines).toEqual([])
    expect(terminate).toHaveBeenCalledOnce()
  })

  it('requires a durable flush before exporting and names the PDF safely', async () => {
    const pauseInput = vi.fn()
    const resumeInput = vi.fn()
    const flushDurably = vi.fn().mockResolvedValue({ ok: true })
    const render = vi.fn().mockResolvedValue([])
    const savePdf = vi.fn().mockResolvedValue({ status: 'exported' })
    const exporter = useNotebookExport({
      noteId: 'note-1',
      workspacePath: '/workspace',
      title: () => 'Notes: Week 1?',
      snapshot: createNotebook,
      pauseInput,
      resumeInput,
      flushDurably,
      render,
      savePdf,
      onError: vi.fn(),
    })

    await expect(exporter.exportPdf()).resolves.toBe(true)
    expect(pauseInput).toHaveBeenCalledOnce()
    expect(resumeInput).toHaveBeenCalledOnce()
    expect(flushDurably).toHaveBeenCalledOnce()
    expect(savePdf).toHaveBeenCalledWith(expect.objectContaining({ fileName: 'Notes  Week 1.pdf' }))
  })

  it('does not render or export stale pages when durable flush fails', async () => {
    const render = vi.fn()
    const savePdf = vi.fn()
    const onError = vi.fn()
    const exporter = useNotebookExport({
      noteId: 'note-1',
      workspacePath: '/workspace',
      title: () => 'Notes',
      snapshot: createNotebook,
      pauseInput: vi.fn(),
      resumeInput: vi.fn(),
      flushDurably: vi.fn().mockResolvedValue({ ok: false, error: new Error('disk full') }),
      render,
      savePdf,
      onError,
    })

    await expect(exporter.exportPdf()).resolves.toBe(false)
    expect(render).not.toHaveBeenCalled()
    expect(savePdf).not.toHaveBeenCalled()
    expect(onError).toHaveBeenCalledOnce()
  })
})
