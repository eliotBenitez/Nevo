import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MAX_ASSET_BYTES } from '../../../core/assets/assetLimits'
import type { WorkspaceBackend } from '../../../core/workspace-backend'
import { isNotebookPasteTargetIgnored, notebookImageFileName, useNotebookImageImport } from './useNotebookImageImport'

vi.mock('../../../i18n', () => ({ i18n: { global: { t: (key: string) => key } } }))

const clipboard = vi.hoisted(() => ({ readImage: vi.fn() }))
vi.mock('@tauri-apps/plugin-clipboard-manager', () => clipboard)
vi.mock('../../../utils/rgbaToPng', () => ({ rgbaToPngBytes: () => [1, 2, 3, 4] }))

function setup(overrides: { canImport?: boolean; insert?: (...args: unknown[]) => string | null } = {}) {
  const importImageAsset = vi.fn(async () => ({ src: '.nevo/assets/imported.png' }))
  const insertImage = vi.fn(overrides.insert ?? (() => 'image-id'))
  const api = useNotebookImageImport({
    getBackend: () => ({ importImageAsset } as unknown as WorkspaceBackend),
    insertImage: insertImage as never,
    canImport: () => overrides.canImport ?? true,
  })
  return { api, importImageAsset, insertImage }
}

function file(type: string, name = 'a.png', size = 3): File {
  const result = new File([new Uint8Array(3)], name, { type })
  if (size !== 3) Object.defineProperty(result, 'size', { value: size })
  return result
}

function pasteEvent(files: File[]): ClipboardEvent {
  return { clipboardData: { files }, preventDefault: vi.fn() } as unknown as ClipboardEvent
}

describe('useNotebookImageImport', () => {
  beforeEach(() => {
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: () => 'blob:x', revokeObjectURL: () => undefined }))
    vi.stubGlobal('Image', class {
      naturalWidth = 640
      naturalHeight = 480
      src = ''
      decode() { return Promise.resolve() }
    })
    clipboard.readImage.mockReset()
  })
  afterEach(() => vi.unstubAllGlobals())

  it('rejects svg files with the image type error', async () => {
    const { api, importImageAsset } = setup()
    expect(await api.importFile(file('image/svg+xml', 'a.svg'))).toBeNull()
    expect(api.error.value).toBe('notebook.errors.imageType')
    expect(importImageAsset).not.toHaveBeenCalled()
  })

  it('rejects oversized files before reading them', async () => {
    const { api, importImageAsset } = setup()
    expect(await api.importFile(file('image/png', 'big.png', MAX_ASSET_BYTES + 1))).toBeNull()
    expect(api.error.value).toBe('editor.assets.tooLarge')
    expect(importImageAsset).not.toHaveBeenCalled()
  })

  it('imports an allowed file and inserts it with its natural size', async () => {
    const { api, importImageAsset, insertImage } = setup()
    expect(await api.importFile(file('image/png'))).toBe('image-id')
    expect(importImageAsset).toHaveBeenCalledWith('a.png', expect.any(Uint8Array))
    expect(insertImage).toHaveBeenCalledWith('.nevo/assets/imported.png', 640, 480)
    expect(api.error.value).toBeNull()
    expect(api.importing.value).toBe(false)
  })

  it('names the asset after the MIME type so its src stays a supported raster path', async () => {
    const { api, importImageAsset } = setup()
    await api.importFile(file('image/jpeg', 'photo'))
    expect(importImageAsset).toHaveBeenLastCalledWith('photo.jpg', expect.any(Uint8Array))
    expect(notebookImageFileName('scan.jfif', 'image/jpeg')).toBe('scan.jpg')
    expect(notebookImageFileName('', 'image/webp')).toBe('notebook-image.webp')
    expect(notebookImageFileName('my.photo.PNG', 'image/png')).toBe('my.photo.png')
  })

  it('reports an import failure and clears the importing flag', async () => {
    const { api, importImageAsset } = setup()
    importImageAsset.mockRejectedValueOnce(new Error('disk'))
    expect(await api.importFile(file('image/webp', 'a.webp'))).toBeNull()
    expect(api.error.value).toBe('notebook.errors.imageImport')
    expect(api.importing.value).toBe(false)
  })

  it('does nothing when the notebook is not editable', async () => {
    const { api, importImageAsset } = setup({ canImport: false })
    expect(await api.importFile(file('image/png'))).toBeNull()
    expect(await api.onPaste(pasteEvent([file('image/png')]))).toBe(false)
    expect(importImageAsset).not.toHaveBeenCalled()
  })

  it('pastes an image from clipboard files and prevents the default paste', async () => {
    const { api, insertImage } = setup()
    const event = pasteEvent([file('text/plain', 'a.txt'), file('image/jpeg', 'p.jpg')])
    expect(await api.onPaste(event)).toBe(true)
    expect(event.preventDefault).toHaveBeenCalled()
    expect(insertImage).toHaveBeenCalledTimes(1)
  })

  it('falls back to the native clipboard image when no file is present', async () => {
    clipboard.readImage.mockResolvedValue({
      size: async () => ({ width: 32, height: 16 }),
      rgba: async () => new Uint8Array(32 * 16 * 4),
    })
    const { api, importImageAsset, insertImage } = setup()
    expect(await api.onPaste(pasteEvent([]))).toBe(true)
    expect(importImageAsset).toHaveBeenCalledWith('pasted-notebook-image.png', new Uint8Array([1, 2, 3, 4]))
    expect(insertImage).toHaveBeenCalledWith('.nevo/assets/imported.png', 32, 16)
  })

  it('ignores a paste when the native clipboard has no image', async () => {
    clipboard.readImage.mockRejectedValue(new Error('no image'))
    const { api, importImageAsset } = setup()
    expect(await api.onPaste(pasteEvent([]))).toBe(false)
    expect(importImageAsset).not.toHaveBeenCalled()
    expect(api.error.value).toBeNull()
  })

  it('leaves paste into inputs, textareas, and editable content alone', () => {
    const input = document.createElement('input')
    const area = document.createElement('textarea')
    const editable = document.createElement('div')
    editable.setAttribute('contenteditable', 'true')
    const child = document.createElement('span')
    editable.append(child)
    const plain = document.createElement('div')
    expect([input, area, editable, child].map(isNotebookPasteTargetIgnored)).toEqual([true, true, true, true])
    expect(isNotebookPasteTargetIgnored(plain)).toBe(false)
    expect(isNotebookPasteTargetIgnored(null)).toBe(false)
  })
})
