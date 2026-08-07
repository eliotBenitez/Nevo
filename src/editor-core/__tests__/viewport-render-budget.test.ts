import { describe, expect, it, vi } from 'vitest'
import { createViewportRenderBudget } from '../node-views/viewportRenderBudget'

describe('createViewportRenderBudget', () => {
  it('evicts the least recently retained entry when the budget is exceeded', () => {
    const budget = createViewportRenderBudget(2)
    const first = {}
    const second = {}
    const third = {}
    const suspendFirst = vi.fn(() => true)
    const suspendSecond = vi.fn(() => true)

    budget.retain(first, suspendFirst)
    budget.retain(second, suspendSecond)
    budget.retain(third, () => true)

    expect(suspendFirst).toHaveBeenCalledOnce()
    expect(suspendSecond).not.toHaveBeenCalled()
    expect(budget.size()).toBe(2)
  })

  it('refreshes recency and preserves protected entries', () => {
    const budget = createViewportRenderBudget(1)
    const protectedEntry = {}
    const evictableEntry = {}
    const suspendProtected = vi.fn(() => false)
    const suspendEvictable = vi.fn(() => true)

    budget.retain(protectedEntry, suspendProtected)
    budget.retain(evictableEntry, suspendEvictable)

    expect(suspendProtected).toHaveBeenCalledOnce()
    expect(suspendEvictable).toHaveBeenCalledOnce()
    expect(budget.size()).toBe(1)
  })

  it('removes released entries without suspending them', () => {
    const budget = createViewportRenderBudget(1)
    const key = {}
    const suspend = vi.fn(() => true)

    budget.retain(key, suspend)
    budget.release(key)

    expect(budget.size()).toBe(0)
    expect(suspend).not.toHaveBeenCalled()
  })
})
