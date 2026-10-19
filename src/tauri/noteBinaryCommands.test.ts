import { beforeEach, describe, expect, it, vi } from 'vitest'

const invoke = vi.hoisted(() => vi.fn())
vi.mock('@tauri-apps/api/core', () => ({ invoke }))
vi.mock('../utils/logger', () => ({ appLogger: { error: vi.fn() } }))
import { noteCommands } from './commands'

describe('note commands with a raw binary body', () => {
  beforeEach(() => invoke.mockReset())
  const bytes = new Uint8Array([1, 2, 3])

  it('sends the draw asset bytes raw with encoded headers', async () => {
    await noteCommands.saveDrawAsset('C:/путь', 'draw 1', bytes)
    expect(invoke).toHaveBeenCalledWith('save_draw_asset', bytes, {
      headers: { 'nv-workspace-path': encodeURIComponent('C:/путь'), 'nv-draw-id': 'draw%201' },
    })
  })

  it('sends export bytes raw with an encoded file name', async () => {
    await noteCommands.exportDrawFile('рис.png', bytes)
    await noteCommands.exportNoteDocx('заметка.docx', bytes)
    expect(invoke).toHaveBeenNthCalledWith(1, 'export_draw_file', bytes, { headers: { 'nv-file-name': encodeURIComponent('рис.png') } })
    expect(invoke).toHaveBeenNthCalledWith(2, 'export_note_docx', bytes, { headers: { 'nv-file-name': encodeURIComponent('заметка.docx') } })
  })
})
