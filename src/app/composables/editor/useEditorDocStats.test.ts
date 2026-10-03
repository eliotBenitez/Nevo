import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { nevoBaseSchema } from '../../../editor-core/schema'
import { useGraphStore } from '../../../stores/graph'
import type { EditorCore } from './useEditorCore'
import { useEditorDocStats } from './useEditorDocStats'

function createCore(content: unknown): EditorCore {
  return {
    editorView: {
      state: { doc: nevoBaseSchema.nodeFromJSON(content) },
    },
  } as EditorCore
}

describe('useEditorDocStats', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('counts separate blocks without merging their words', () => {
    const core = createCore({
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Первый' }] },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'про', marks: [{ type: 'strong' }] },
            { type: 'text', text: 'ект' },
          ],
        },
      ],
    })
    const { editorWordCount, updateEditorStatsNow } = useEditorDocStats(
      core,
      () => ({ editor: { editorStatsVisibility: 'corner' } }) as never,
      () => 'note-1',
    )

    updateEditorStatsNow()

    expect(editorWordCount.value).toEqual({ words: 2, chars: 12 })
  })

  it('defers large-document stats until the browser is idle', () => {
    vi.useFakeTimers()
    let runIdle: (() => void) | null = null
    vi.stubGlobal('requestIdleCallback', vi.fn((callback: IdleRequestCallback) => {
      runIdle = () => callback({
        didTimeout: false,
        timeRemaining: () => 10,
      })
      return 1
    }))
    vi.stubGlobal('cancelIdleCallback', vi.fn())
    const core = createCore({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Old' }] }],
    })
    const stats = useEditorDocStats(
      core,
      () => ({ editor: { editorStatsVisibility: 'corner' } }) as never,
      () => 'note-1',
    )
    stats.updateEditorStatsNow()

    const nextDoc = nevoBaseSchema.nodeFromJSON({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'New value' }] }],
    })
    const editorView = core.editorView as { state: { doc: typeof nextDoc } }
    editorView.state.doc = nextDoc
    stats.onTransactionDoc(nextDoc)
    vi.advanceTimersByTime(200)

    expect(stats.editorWordCount.value).toEqual({ words: 1, chars: 3 })
    const idleCallback = runIdle as (() => void) | null
    expect(idleCallback).not.toBeNull()
    idleCallback?.()
    expect(stats.editorWordCount.value).toEqual({ words: 2, chars: 9 })

    stats.clearTimers()
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('flushes a pending graph extraction during teardown', () => {
    const graphStore = useGraphStore()
    const updateNoteEdges = vi.spyOn(graphStore, 'updateNoteEdges').mockImplementation(async () => {})
    const core = createCore({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Linked' }] }],
    })
    const stats = useEditorDocStats(
      core,
      () => ({ editor: { editorStatsVisibility: 'hidden' } }) as never,
      () => 'note-1',
    )

    stats.scheduleGraphUpdate(core.editorView!.state.doc)
    stats.clearTimers()

    expect(updateNoteEdges).toHaveBeenCalledOnce()
    expect(updateNoteEdges).toHaveBeenCalledWith('note-1', [])
  })

  function linkedDoc(noteId: string) {
    return nevoBaseSchema.nodeFromJSON({
      type: 'doc',
      content: [{
        type: 'paragraph',
        content: [{
          type: 'text',
          text: 'Linked',
          marks: [{ type: 'internal_link', attrs: { noteId, anchor: null } }],
        }],
      }],
    })
  }

  it('skips a redundant backend call when two consecutive updates extract the same links', () => {
    const graphStore = useGraphStore()
    const updateNoteEdges = vi.spyOn(graphStore, 'updateNoteEdges').mockImplementation(async () => {})
    const core = createCore({ type: 'doc', content: [{ type: 'paragraph' }] })
    const stats = useEditorDocStats(
      core,
      () => ({ editor: { editorStatsVisibility: 'hidden' } }) as never,
      () => 'note-1',
    )

    stats.scheduleGraphUpdate(linkedDoc('target-1'))
    stats.clearTimers()
    // A different Node instance (e.g. re-parsed from the same JSON) with the
    // same links must still be recognized as unchanged.
    stats.scheduleGraphUpdate(linkedDoc('target-1'))
    stats.clearTimers()

    expect(updateNoteEdges).toHaveBeenCalledOnce()
  })

  it('sends a second update once the extracted links actually change', () => {
    const graphStore = useGraphStore()
    const updateNoteEdges = vi.spyOn(graphStore, 'updateNoteEdges').mockImplementation(async () => {})
    const core = createCore({ type: 'doc', content: [{ type: 'paragraph' }] })
    const stats = useEditorDocStats(
      core,
      () => ({ editor: { editorStatsVisibility: 'hidden' } }) as never,
      () => 'note-1',
    )

    stats.scheduleGraphUpdate(linkedDoc('target-1'))
    stats.clearTimers()
    stats.scheduleGraphUpdate(linkedDoc('target-2'))
    stats.clearTimers()

    expect(updateNoteEdges).toHaveBeenCalledTimes(2)
    expect(updateNoteEdges).toHaveBeenLastCalledWith('note-1', expect.arrayContaining([
      expect.objectContaining({ target: 'target-2' }),
    ]))
  })
})
