import { mount } from '@vue/test-utils'
import { defineComponent } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { NOTEBOOK_LASER_LIFETIME_MS, useNotebookLaser } from './useNotebookLaser'

function open() {
  return mount(defineComponent({ setup: () => useNotebookLaser(), template: '<div />' }))
}

describe('notebook laser lifetime', () => {
  afterEach(() => vi.useRealTimers())
  const style = { color: '#ef4444', width: 2.5 }
  const points = [{ x: 30, y: 40 }, { x: 80, y: 90 }]

  it('captures the released path and style and expires each trail independently', () => {
    vi.useFakeTimers()
    const wrapper = open()
    wrapper.vm.add(points, style, 'page-1')
    const trace = wrapper.vm.traces[0]!
    expect(trace.path).toBeTruthy()
    expect(trace).toMatchObject({ color: '#ef4444', pageId: 'page-1', width: 2.5, head: { x: 80, y: 90 } })
    vi.advanceTimersByTime(800)
    wrapper.vm.add(points, { ...style, color: '#00ff00' }, 'page-2')
    vi.advanceTimersByTime(NOTEBOOK_LASER_LIFETIME_MS - 800)
    expect(wrapper.vm.traces).toHaveLength(1)
    expect(wrapper.vm.traces[0]!.pageId).toBe('page-2')
    vi.advanceTimersByTime(800)
    expect(wrapper.vm.traces).toEqual([])
    wrapper.unmount()
  })

  it('bounds temporary history and cancels timers on disposal, including late input finalization', () => {
    vi.useFakeTimers()
    const wrapper = open()
    const add = wrapper.vm.add
    for (let i = 0; i < 40; i++) add(points, style, 'page-1')
    expect(wrapper.vm.traces.length).toBeLessThanOrEqual(32)
    expect(vi.getTimerCount()).toBe(wrapper.vm.traces.length)
    wrapper.unmount()
    expect(vi.getTimerCount()).toBe(0)
    add(points, style, 'page-1')
    expect(vi.getTimerCount()).toBe(0)
  })
})
