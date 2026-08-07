import { reactive, readonly } from 'vue'

export interface PasswordPromptOptions {
  title: string
  message?: string
  label: string
  placeholder?: string
  confirmLabel?: string
  cancelLabel?: string
  /** When `false`, the confirm button stays enabled for an empty value
   * (used for an optional export password). Defaults to `true`. */
  required?: boolean
  /** Shown as an inline error above the input, e.g. after a wrong-password retry. */
  errorMessage?: string | null
}

interface PasswordPromptState {
  open: boolean
  options: PasswordPromptOptions | null
}

const state = reactive<PasswordPromptState>({
  open: false,
  options: null,
})

let activeResolve: ((value: string | null) => void) | null = null

function resolveActive(value: string | null) {
  const resolve = activeResolve
  activeResolve = null
  state.open = false
  state.options = null
  resolve?.(value)
}

/** Resolves with the entered password (possibly `''` when not required), or
 * `null` if the prompt was cancelled. */
export function promptPassword(options: PasswordPromptOptions): Promise<string | null> {
  if (activeResolve) resolveActive(null)

  state.options = { ...options, required: options.required ?? true }
  state.open = true

  return new Promise<string | null>((resolve) => {
    activeResolve = resolve
  })
}

export function resolvePasswordPrompt(value: string | null) {
  resolveActive(value)
}

export function usePasswordPrompt() {
  return {
    promptPassword,
    passwordPromptState: readonly(state),
    resolvePasswordPrompt,
  }
}
