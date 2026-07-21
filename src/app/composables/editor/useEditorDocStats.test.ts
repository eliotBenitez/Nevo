import { beforeEach, describe, expect, it } from 'vitest'
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
      () => 'note-1',
    )

    updateEditorStatsNow()

    expect(editorWordCount.value).toEqual({ words: 2, chars: 12 })
  })
})
