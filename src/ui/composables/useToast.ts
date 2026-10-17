import { reactive, readonly } from 'vue'

export type ToastVariant = 'success' | 'error' | 'info'

export interface ToastAction {
  label: string
  run: () => void | Promise<void>
}

export interface ToastOptions {
  message: string
  title?: string
  variant?: ToastVariant
  /** Auto-dismiss delay in ms. `0` keeps the toast until dismissed manually. */
  duration?: number
  /** A single follow-up such as "Undo"; running it dismisses the toast. */
  action?: ToastAction
}

export interface ToastItem {
  id: number
  message: string
  title?: string
  variant: ToastVariant
  duration: number
  action?: ToastAction
}

interface ToastState {
  items: ToastItem[]
}

const MAX_VISIBLE = 4
const DEFAULT_DURATION = 4500
// Long enough to read the message and reach the action button.
const ACTION_DURATION = 7000

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
  const duration = options.duration ?? (options.action ? ACTION_DURATION : DEFAULT_DURATION)
  state.items.push({
    id,
    message: options.message,
    title: options.title,
    variant: options.variant ?? 'info',
    duration,
    action: options.action,
  })

  while (state.items.length > MAX_VISIBLE) {
    const oldest = state.items[0]
    if (!oldest) break
    dismissToast(oldest.id)
  }

  startTimer(id, duration)
  return id
}

function startTimer(id: number, duration: number): void {
  if (duration > 0) timers.set(id, setTimeout(() => dismissToast(id), duration))
}

/** Stops auto-dismiss while the pointer or keyboard focus is on the toast. */
function pauseToast(id: number): void {
  const timer = timers.get(id)
  if (!timer) return
  clearTimeout(timer)
  timers.delete(id)
}

/** Restarts the full delay so a toast never vanishes right after the user looks away. */
function resumeToast(id: number): void {
  const item = state.items.find(entry => entry.id === id)
  if (item && !timers.has(id)) startTimer(id, item.duration)
}

async function runToastAction(id: number): Promise<void> {
  const action = state.items.find(entry => entry.id === id)?.action
  dismissToast(id)
  await action?.run()
}

export function useToast() {
  return {
    toastState: readonly(state),
    showToast,
    dismissToast,
    pauseToast,
    resumeToast,
    runToastAction,
  }
}
