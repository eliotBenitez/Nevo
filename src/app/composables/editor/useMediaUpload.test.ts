import { beforeEach, describe, expect, it, vi } from 'vitest'
import { EditorState } from 'prosemirror-state'
import { nevoBaseSchema } from '../../../editor-core/schema'
import { noteCommands } from '../../../tauri/commands'
import { useMediaUpload } from './useMediaUpload'

vi.mock('../../../tauri/commands', () => ({
  noteCommands: { pickAndImportAsset: vi.fn() },
}))
vi.mock('../../../tauri/mediaServer', () => ({
  ensureMediaServer: vi.fn(async () => undefined),
  mediaHttpUrl: vi.fn(() => null),
}))

describe('useMediaUpload audio source changes', () => {
  beforeEach(() => vi.clearAllMocks())

  it('preserves bookmarks when the picker is cancelled and resets them after replacing the source', async () => {
    const mediaType = nevoBaseSchema.nodes.media_block!
    let state = EditorState.create({
      schema: nevoBaseSchema,
      doc: nevoBaseSchema.node('doc', null, [mediaType.create({
        kind: 'audio', src: 'old.mp3', name: 'Old', bookmarks: [{ id: 'keep', time: 8, label: 'Saved point' }],
      })]),
    })
    const view = {
      get state() { return state },
      dispatch(transaction: Parameters<typeof state.apply>[0]) { state = state.apply(transaction) },
    }
    const core = { editorView: view } as Parameters<typeof useMediaUpload>[0]
    const picker = vi.mocked(noteCommands.pickAndImportAsset)
    const { requestMediaPicker } = useMediaUpload(core, () => '/workspace', vi.fn())

    picker.mockResolvedValueOnce(null)
    requestMediaPicker(0, 'audio')
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(state.doc.firstChild?.attrs.bookmarks).toEqual([{ id: 'keep', time: 8, label: 'Saved point' }])

    picker.mockResolvedValueOnce({ src: 'new.mp3', fileName: 'New.mp3', hash: 'new-hash', deduplicated: false, bytes: 100 })
    requestMediaPicker(0, 'audio')
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(state.doc.firstChild?.attrs).toMatchObject({ src: 'new.mp3', name: 'New.mp3', bookmarks: [] })
  })
})
