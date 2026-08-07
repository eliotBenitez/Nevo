import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { EditorView } from 'prosemirror-view'
import { nevoBaseSchema } from '../schema'
import { createMathNodeView } from '../node-views/math'

vi.mock('../../utils/katex', () => ({
  isKatexLoaded: () => true,
  loadKatex: vi.fn(),
  renderKatexToString: (latex: string) => `<span data-latex="${latex}">${latex}</span>`,
}))

beforeEach(() => {
  vi.stubGlobal('IntersectionObserver', class {
    constructor() {}
    observe = vi.fn()
    unobserve = vi.fn()
    disconnect = vi.fn()
    takeRecords = () => []
    root = null
    rootMargin = ''
    thresholds = []
  })
  vi.stubGlobal('ResizeObserver', undefined)
})

afterEach(() => {
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

describe('math node view viewport fallback', () => {
  it.each([
    ['math_inline', 'x^2'],
    ['math_block', '\\int_0^1 x dx'],
  ] as const)('renders a visible %s before IntersectionObserver emits', async (type, latex) => {
    const root = document.createElement('div')
    root.className = 'doc-body'
    Object.defineProperty(root, 'getBoundingClientRect', {
      configurable: true,
      value: () => new DOMRect(0, 0, 800, 600),
    })
    const node = nevoBaseSchema.nodes[type]!.create({
      latex,
      displayMode: type === 'math_block',
    })
    const nodeView = createMathNodeView(node, {} as EditorView, false)
    Object.defineProperty(nodeView.dom, 'getBoundingClientRect', {
      configurable: true,
      value: () => new DOMRect(0, 120, 200, 72),
    })
    root.append(nodeView.dom)
    document.body.append(root)

    await Promise.resolve()
    await Promise.resolve()

    expect(nodeView.dom.querySelector('[data-latex]')?.textContent).toBe(latex)
    nodeView.destroy?.()
  })
})
