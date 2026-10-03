import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { effectScope } from 'vue'
import { useWorkspaceStore } from '../../../stores/workspace'
import { useNotebookToolPreferences } from './useNotebookToolPreferences'

describe('useNotebookToolPreferences', () => {
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

  it('starts from stored preferences with defaults for the rest', () => {
    useWorkspaceStore().appConfig.notebookTools = { markerColor: '#0ea5e9', strokeWidth: 3 }
    expect(useNotebookToolPreferences().initial).toEqual({
      penColor: '#000000', markerColor: '#0ea5e9', strokeWidth: 3, markerWidth: 12,
    })
  })

  it('debounces changes into one write of the merged preferences', () => {
    useWorkspaceStore().appConfig.notebookTools = { penColor: '#dc2626' }
    const preferences = useNotebookToolPreferences()
    preferences.remember({ markerColor: '#16A34A' })
    preferences.remember({ strokeWidth: 2.5, markerWidth: 16 })
    expect(save).not.toHaveBeenCalled()
    vi.advanceTimersByTime(800)
    expect(save).toHaveBeenCalledTimes(1)
    expect(save).toHaveBeenCalledWith({ notebookTools: {
      penColor: '#dc2626', markerColor: '#16a34a', strokeWidth: 2.5, markerWidth: 16,
    } })
  })

  it('does not write unchanged or invalid values', () => {
    useWorkspaceStore().appConfig.notebookTools = { penColor: '#dc2626', strokeWidth: 2 }
    const preferences = useNotebookToolPreferences()
    preferences.remember({ penColor: '#DC2626', strokeWidth: 2 })
    preferences.remember({ markerWidth: 99, markerColor: 'nope' })
    vi.advanceTimersByTime(2000)
    expect(save).not.toHaveBeenCalled()
  })

  it('flushes a pending write when the notebook closes', () => {
    const scope = effectScope()
    const preferences = scope.run(() => useNotebookToolPreferences())!
    preferences.remember({ markerWidth: 20 })
    scope.stop()
    expect(save).toHaveBeenCalledWith({ notebookTools: { markerWidth: 20 } })
  })
})
