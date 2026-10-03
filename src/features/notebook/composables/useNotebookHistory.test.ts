import { describe, expect, it, vi } from 'vitest'
import { createNotebookHistory } from './useNotebookHistory'

describe('createNotebookHistory', () => {
  it('undoes and redoes one completed action without changing its snapshot', () => {
    const apply = vi.fn()
    const history = createNotebookHistory(apply)
    const before = { version: 1, pages: [] }
    const after = { version: 1, pages: [{ id: 'p2' }] }

    history.push(before, after, 1)
    history.undo()
    history.redo()

    expect(apply.mock.calls).toEqual([[before], [after]])
    expect(history.canUndo.value).toBe(true)
    expect(history.canRedo.value).toBe(false)
  })

  it('keeps the newest action when it alone exceeds the history byte budget', () => {
    const apply = vi.fn()
    const history = createNotebookHistory(apply, { maxBytes: 4 })
    const before = { id: 'before' }
    const after = { id: 'after' }

    history.push(before, after, 5)

    expect(history.canUndo.value).toBe(true)
    history.undo()
    expect(apply).toHaveBeenCalledWith(before)
  })

  it('clears both stacks when a restored document replaces the session', () => {
    const apply = vi.fn()
    const history = createNotebookHistory(apply)
    history.push({ id: 'a' }, { id: 'b' }, 1)

    history.reset()

    expect(history.canUndo.value).toBe(false)
    expect(history.canRedo.value).toBe(false)
  })

  it('retains snapshot identity without making large documents deeply reactive', () => {
    const apply = vi.fn()
    const history = createNotebookHistory(apply)
    const before = { page: { objects: [{ points: [{ x: 1 }] }] } }
    const after = { page: { objects: [{ points: [{ x: 2 }] }] } }
    history.push(before, after, 16)

    history.undo()

    expect(apply.mock.calls[0][0]).toBe(before)
    expect(apply.mock.calls[0][0].page).toBe(before.page)
  })
})
