import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { WorkspaceBackend } from '../../../core/workspace-backend'
import { noteCommands } from '../../../tauri/commands'
import { useEditorAssetActions } from './useEditorAssetActions'

vi.mock('../../../tauri/commands', () => ({
  noteCommands: {
    openWorkspaceAsset: vi.fn(),
    pickAndImportAsset: vi.fn(),
  },
  workspaceCommands: {
    cleanupOrphanedAssets: vi.fn(async () => undefined),
  },
}))

vi.mock('../../../utils/logger', () => ({
  appLogger: {
    warn: vi.fn(async () => undefined),
    error: vi.fn(async () => undefined),
  },
}))

function backend(overrides: Partial<WorkspaceBackend>): WorkspaceBackend {
  return {
    handle: { kind: 'local', path: '/workspace' },
    ...overrides,
  } as WorkspaceBackend
}

async function flushAsyncWork() {
  await Promise.resolve()
  await Promise.resolve()
}

describe('useEditorAssetActions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('imports a local cover with the native picker', async () => {
    vi.mocked(noteCommands.pickAndImportAsset).mockResolvedValue({
      src: '.nevo/assets/local-cover.png',
      fileName: 'local-cover.png',
      hash: 'hash',
      deduplicated: false,
      bytes: 3,
    })
    const emitCover = vi.fn()
    const localBackend = backend({
      handle: { kind: 'local', path: '/workspace' },
    })
    const actions = useEditorAssetActions({
      getWorkspacePath: () => '/workspace',
      getBackend: () => localBackend,
      getCover: () => null,
      emitCover,
      clickCoverInput: vi.fn(),
    })

    actions.onRequestCoverImage()
    await flushAsyncWork()

    expect(noteCommands.pickAndImportAsset).toHaveBeenCalledWith('/workspace', 'image')
    expect(emitCover).toHaveBeenCalledWith('image:.nevo/assets/local-cover.png')
  })

  it('uploads a cover as bytes through the backend when no workspace path is available', async () => {
    const importImageAsset = vi.fn(async () => ({
      src: '.nevo/assets/cover.jpg',
      hash: 'hash',
      deduplicated: false,
      bytes: 3,
    }))
    const emitCover = vi.fn()
    const actions = useEditorAssetActions({
      getWorkspacePath: () => null,
      getBackend: () => backend({ importImageAsset }),
      getCover: () => null,
      emitCover,
      clickCoverInput: vi.fn(),
    })
    const input = document.createElement('input')
    const file = new File(['abc'], 'cover.jpg', { type: 'image/jpeg' })
    Object.defineProperty(input, 'files', { configurable: true, value: [file] })

    await actions.onCoverImageInputChange({ target: input } as unknown as Event)

    expect(importImageAsset).toHaveBeenCalledWith('cover.jpg', new Uint8Array([97, 98, 99]))
    expect(emitCover).toHaveBeenCalledWith('image:.nevo/assets/cover.jpg')
    expect(input.value).toBe('')
  })

  it('rejects a cover image over the size limit without reading its bytes', async () => {
    const importImageAsset = vi.fn()
    const emitCover = vi.fn()
    const actions = useEditorAssetActions({
      getWorkspacePath: () => null,
      getBackend: () => backend({ importImageAsset }),
      getCover: () => null,
      emitCover,
      clickCoverInput: vi.fn(),
    })
    const input = document.createElement('input')
    const oversized = new File([new Uint8Array(101 * 1024 * 1024)], 'huge.jpg', { type: 'image/jpeg' })
    const arrayBuffer = vi.spyOn(oversized, 'arrayBuffer')
    Object.defineProperty(input, 'files', { configurable: true, value: [oversized] })

    await actions.onCoverImageInputChange({ target: input } as unknown as Event)

    expect(arrayBuffer).not.toHaveBeenCalled()
    expect(importImageAsset).not.toHaveBeenCalled()
    expect(emitCover).not.toHaveBeenCalled()
    expect(input.value).toBe('')
  })

  it('deletes a replaced cover only after a successful save', async () => {
    const deleteUnreferencedAsset = vi.fn(async () => true)
    const actions = useEditorAssetActions({
      getWorkspacePath: () => '/workspace',
      getBackend: () => backend({
        handle: { kind: 'local', path: '/workspace' },
        deleteUnreferencedAsset,
      }),
      getCover: () => 'image:.nevo/assets/old-cover.jpg',
      emitCover: vi.fn(),
      clickCoverInput: vi.fn(),
    })

    actions.updateCover(null)
    expect(deleteUnreferencedAsset).not.toHaveBeenCalled()

    actions.afterSuccessfulSave()
    await flushAsyncWork()

    expect(deleteUnreferencedAsset).toHaveBeenCalledWith('.nevo/assets/old-cover.jpg')
  })
})
