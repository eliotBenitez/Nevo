import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderKatexToString } from './katex'

describe('renderKatexToString', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('does not warn for display-mode line breaks', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)

    const html = renderKatexToString('a \\\\ b', { displayMode: true, throwOnError: true })

    expect(html).toContain('katex-display')
    expect(warn).not.toHaveBeenCalledWith(expect.stringContaining('newLineInDisplayMode'))
  })
})
