import { afterEach, describe, expect, it, vi } from 'vitest'
import { getMermaidTheme, onMermaidThemeChange } from '../node-views/mermaidTheme'

afterEach(() => {
  document.documentElement.classList.remove('theme-dark', 'theme-light')
})

describe('Mermaid theme', () => {
  it('falls back to stock themes without canvas and notifies only when the palette changes', async () => {
    document.documentElement.classList.add('theme-light')
    const listener = vi.fn()
    const stop = onMermaidThemeChange(listener)
    expect(getMermaidTheme().config).toEqual({ theme: 'neutral' })

    document.documentElement.setAttribute('data-unrelated', 'x')
    document.documentElement.style.setProperty('--ui-scale', '1')
    await Promise.resolve()
    expect(listener).not.toHaveBeenCalled()

    document.documentElement.classList.replace('theme-light', 'theme-dark')
    await Promise.resolve()
    expect(listener).toHaveBeenCalledTimes(1)
    expect(getMermaidTheme().config).toEqual({ theme: 'dark' })

    stop()
    document.documentElement.style.removeProperty('--ui-scale')
    document.documentElement.removeAttribute('data-unrelated')
  })
})
