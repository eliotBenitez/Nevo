import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { nevoBaseSchema } from '../../../editor-core/schema'
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
})
