import { reactive, readonly } from 'vue'

export type ConfirmDialogVariant = 'default' | 'danger'

export interface ConfirmDialogOptions {
  message: string
  title?: string
  confirmLabel?: string
  cancelLabel?: string
  variant?: ConfirmDialogVariant
}

interface ConfirmDialogState {
  open: boolean
  options: ConfirmDialogOptions | null
}

const state = reactive<ConfirmDialogState>({
  open: false,
  options: null,
})

let activeResolve: ((value: boolean) => void) | null = null

function resolveActive(value: boolean) {
  const resolve = activeResolve
  activeResolve = null
  state.open = false
  state.options = null
  resolve?.(value)
}

export function confirm(options: ConfirmDialogOptions): Promise<boolean> {
  if (activeResolve) resolveActive(false)

  state.options = { ...options, variant: options.variant ?? 'default' }
  state.open = true

  return new Promise<boolean>((resolve) => {
    activeResolve = resolve
  })
}

export function resolveConfirmDialog(value: boolean) {
  resolveActive(value)
}

export function useConfirmDialog() {
  return {
    confirm,
    confirmDialogState: readonly(state),
    resolveConfirmDialog,
  }
}
