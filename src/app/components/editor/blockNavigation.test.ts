import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  BLOCK_SEARCH_HIGHLIGHT_CLASS,
  focusBlockSearchTarget,
} from './blockNavigation'

describe('focusBlockSearchTarget', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    document.body.innerHTML = ''
  })

  it('scrolls to the target block and removes the transient highlight', () => {
    document.body.innerHTML = `
      <div class="doc-editor">
        <div class="ProseMirror">
          <p>first</p>
          <p>second</p>
          <p>third</p>
        </div>
      </div>
    `

    const editorRoot = document.querySelector('.doc-editor') as HTMLDivElement
    const targetBlock = editorRoot.querySelectorAll('.ProseMirror > *')[1] as HTMLElement
    const scrollIntoView = vi.fn()
    targetBlock.scrollIntoView = scrollIntoView

    const applied = focusBlockSearchTarget(editorRoot, {
      noteId: 'note-1',
      blockIndex: 1,
      query: 'second',
      snippet: 'second',
    })

    expect(applied).toBe(true)
    expect(scrollIntoView).toHaveBeenCalled()
    expect(targetBlock.classList.contains(BLOCK_SEARCH_HIGHLIGHT_CLASS)).toBe(true)

    vi.runAllTimers()

    expect(targetBlock.classList.contains(BLOCK_SEARCH_HIGHLIGHT_CLASS)).toBe(false)
  })
})
