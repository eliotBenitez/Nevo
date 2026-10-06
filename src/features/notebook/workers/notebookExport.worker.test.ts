import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createNotebook } from '../../../core/notebook/codec'
import type { NotebookExportPage, NotebookSnapshotV1 } from '../../../core/notebook/types'

describe('notebook export worker', () => {
  let handler: ((event: MessageEvent) => void) | undefined
  let postMessage: ReturnType<typeof vi.fn>
  let response: unknown

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  beforeEach(async () => {
    handler = undefined
    response = undefined
    postMessage = vi.fn((message: unknown) => { response = structuredClone(message) })
    vi.stubGlobal('self', {
      addEventListener: (_type: string, listener: (event: MessageEvent) => void) => { handler = listener },
      postMessage,
    })
    vi.resetModules()
    await import('./notebookExport.worker')
  })

  it('posts a pages array for blank ruled and plain notebooks', () => {
    const ruledSnapshot = createNotebook('ruled')
    const plainSnapshot = createNotebook('plain')
    const sourceBefore = JSON.stringify([ruledSnapshot, plainSnapshot])
    const ruledRequest = structuredClone({ id: 1, snapshot: ruledSnapshot, includePaper: true })
    const plainRequest = structuredClone({ id: 2, snapshot: plainSnapshot, includePaper: true })
    handler?.({ data: structuredClone(ruledRequest) } as MessageEvent)
    const ruled = response as { id: number; ok: boolean; pages: NotebookExportPage[] }
    handler?.({ data: structuredClone(plainRequest) } as MessageEvent)
    const plain = response as { id: number; ok: boolean; pages: NotebookExportPage[] }

    expect(ruled).toMatchObject({ id: 1, ok: true })
    expect(Array.isArray(ruled.pages)).toBe(true)
    expect(ruled.pages[0]).toMatchObject({ width: 595.28, height: 841.89, paper: { kind: 'ruled' } })
    expect(ruled.pages[0].paper.lines.length).toBeGreaterThan(0)
    expect(plain.pages[0]).toMatchObject({ paper: { kind: 'plain', lines: [] }, paths: [], images: [] })
    expect(JSON.stringify([ruledSnapshot, plainSnapshot])).toBe(sourceBefore)
  })

  it('posts converted paths for multiple pages and omits paper when requested', () => {
    const snapshot = createNotebook('grid')
    const firstPage = snapshot.pages[0]
    firstPage.id = 'page-1'
    firstPage.objects.push({
      id: 'stroke-1',
      actionId: 'action-1',
      kind: 'stroke',
      color: '#111111',
      width: 2,
      opacity: 1,
      points: [{ x: 10, y: 20 }, { x: 30, y: 40 }],
      extension: { retained: true },
    })
    const secondPage = structuredClone(firstPage)
    secondPage.id = 'page-2'
    secondPage.objects[0].id = 'stroke-2'
    secondPage.objects[0].actionId = 'action-2'
    snapshot.pages.push(secondPage)
    snapshot.extension = { retained: true }
    const sourceBefore = JSON.stringify(snapshot)
    const request = structuredClone({ id: 3, snapshot, includePaper: false })

    handler?.({ data: structuredClone(request) } as MessageEvent)

    const exportResponse = response as { id: number; ok: boolean; pages: NotebookExportPage[] }
    expect(exportResponse).toMatchObject({ id: 3, ok: true })
    expect(exportResponse.pages).toHaveLength(2)
    expect(exportResponse.pages.map(page => page.id)).toEqual([firstPage.id, 'page-2'])
    expect(exportResponse.pages[0].paper).toEqual({ kind: 'grid', lines: [] })
    expect(exportResponse.pages[0].paths[0].commands.length).toBeGreaterThan(0)
    expect(exportResponse.pages[1].paths[0].commands).toEqual(exportResponse.pages[0].paths[0].commands)
    expect(JSON.stringify(snapshot)).toBe(sourceBefore)
  })

  it('posts an error response when snapshot conversion fails', () => {
    handler?.({ data: structuredClone({ id: 4, snapshot: {} as NotebookSnapshotV1, includePaper: true }) } as MessageEvent)

    expect(response).toEqual({ id: 4, ok: false, error: expect.any(String) })
  })
})
