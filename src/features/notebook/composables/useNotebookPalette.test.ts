import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { effectScope } from 'vue'
import { useWorkspaceStore } from '../../../stores/workspace'
import { isNotebookInkTool, useNotebookPalette } from './useNotebookPalette'

describe('useNotebookPalette', () => {
  let save: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.useFakeTimers()
    setActivePinia(createPinia())
    save = vi.fn().mockResolvedValue(undefined)
    useWorkspaceStore().saveAppConfig = save as never
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('debounces recents into a single config write', () => {
    const palette = useNotebookPalette()
    palette.recordUse('#111111')
    palette.recordUse('#222222')
    expect(save).not.toHaveBeenCalled()
    expect(palette.quickColors.value).toEqual(['#222222', '#111111'])
    vi.advanceTimersByTime(800)
    expect(save).toHaveBeenCalledTimes(1)
    expect(save).toHaveBeenCalledWith({ notebookPalette: { presets: [], recents: ['#222222', '#111111'] } })
  })

  it('does not write when the first recent is reused', () => {
    useWorkspaceStore().appConfig.notebookPalette = { presets: [], recents: ['#111111', '#222222'] }
    const palette = useNotebookPalette()
    palette.recordUse('#111111')
    vi.advanceTimersByTime(2000)
    expect(save).not.toHaveBeenCalled()
  })

  it('handles presets and limits quick colors to five', () => {
    const palette = useNotebookPalette()
    palette.addPreset('#123456')
    palette.addPreset('#000000')
    expect(palette.presets.value).toEqual(['#123456'])
    palette.removePreset('#123456')
    for (let i = 1; i <= 7; i++) palette.recordUse(`#00000${i}`)
    expect(palette.recents.value).toHaveLength(7)
    expect(palette.quickColors.value).toHaveLength(5)
  })

  it('flushes a pending write when the scope is disposed', () => {
    const scope = effectScope()
    const palette = scope.run(() => useNotebookPalette())!
    palette.recordUse('#abcdef')
    expect(save).not.toHaveBeenCalled()
    scope.stop()
    expect(save).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(2000)
    expect(save).toHaveBeenCalledTimes(1)
  })

  it('treats only ink-producing tools as ink', () => {
    for (const tool of ['pen', 'marker', 'line', 'arrow', 'rectangle', 'ellipse', 'circle', 'triangle']) expect(isNotebookInkTool(tool)).toBe(true)
    for (const tool of ['eraser', 'lasso', 'move', 'hand', 'laser']) expect(isNotebookInkTool(tool)).toBe(false)
  })
})
