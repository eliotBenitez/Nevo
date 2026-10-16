import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useToast } from './useToast'

const toast = useToast()

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  toast.toastState.items.map(item => item.id).forEach(toast.dismissToast)
  vi.useRealTimers()
})

describe('useToast actions', () => {
  it('keeps action toasts longer than plain ones', () => {
    toast.showToast({ message: 'plain' })
    toast.showToast({ message: 'with action', action: { label: 'Undo', run: () => {} } })
    vi.advanceTimersByTime(4600)
    expect(toast.toastState.items.map(item => item.message)).toEqual(['with action'])
    vi.advanceTimersByTime(2500)
    expect(toast.toastState.items).toHaveLength(0)
  })

  it('dismisses the toast and runs its action once', async () => {
    const run = vi.fn()
    const id = toast.showToast({ message: 'Deleted', action: { label: 'Undo', run } })
    await toast.runToastAction(id)
    await toast.runToastAction(id)
    expect(run).toHaveBeenCalledTimes(1)
    expect(toast.toastState.items).toHaveLength(0)
  })

  it('pauses auto-dismiss and restarts the full delay on resume', () => {
    const id = toast.showToast({ message: 'Deleted', duration: 1000 })
    vi.advanceTimersByTime(900)
    toast.pauseToast(id)
    vi.advanceTimersByTime(5000)
    expect(toast.toastState.items).toHaveLength(1)
    toast.resumeToast(id)
    vi.advanceTimersByTime(900)
    expect(toast.toastState.items).toHaveLength(1)
    vi.advanceTimersByTime(200)
    expect(toast.toastState.items).toHaveLength(0)
  })

  it('never starts a timer for persistent toasts on resume', () => {
    const id = toast.showToast({ message: 'Sticky', duration: 0 })
    toast.resumeToast(id)
    vi.advanceTimersByTime(60_000)
    expect(toast.toastState.items).toHaveLength(1)
  })
})
