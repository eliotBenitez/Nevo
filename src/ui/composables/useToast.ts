import { reactive, readonly } from 'vue'

export type ToastVariant = 'success' | 'error' | 'info'

export interface ToastOptions {
  message: string
  title?: string
  variant?: ToastVariant
  /** Auto-dismiss delay in ms. `0` keeps the toast until dismissed manually. */
  duration?: number
}

export interface ToastItem {
  id: number
  message: string
  title?: string
  variant: ToastVariant
  duration: number
}

interface ToastState {
  items: ToastItem[]
}

const MAX_VISIBLE = 4
const DEFAULT_DURATION = 4500

const state = reactive<ToastState>({ items: [] })
const timers = new Map<number, ReturnType<typeof setTimeout>>()
let nextId = 1

function dismissToast(id: number): void {
  const timer = timers.get(id)
  if (timer) {
    clearTimeout(timer)
    timers.delete(id)
  }
  const index = state.items.findIndex(item => item.id === id)
  if (index !== -1) state.items.splice(index, 1)
}

function showToast(options: ToastOptions): number {
  const id = nextId++
  const duration = options.duration ?? DEFAULT_DURATION
  state.items.push({
    id,
    message: options.message,
    title: options.title,
    variant: options.variant ?? 'info',
    duration,
  })

  while (state.items.length > MAX_VISIBLE) {
    const oldest = state.items[0]
    if (!oldest) break
    dismissToast(oldest.id)
  }

  if (duration > 0) {
    timers.set(id, setTimeout(() => dismissToast(id), duration))
  }
  return id
}

export function useToast() {
  return {
    toastState: readonly(state),
    showToast,
    dismissToast,
  }
}
