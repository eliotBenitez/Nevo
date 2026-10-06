import { ref } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import { createNotebook } from '../../../core/notebook/codec'
import { useNotebookDocument } from './useNotebookDocument'
import { createNotebookInput } from './useNotebookInput'
import { useNotebookInteraction } from './useNotebookInteraction'
import { createNotebookViewport } from './useNotebookViewport'

function pointer(pointerId: number, pointerType: string, clientX: number, clientY: number, props: Record<string, unknown> = {}) {
  return {
    pointerId, pointerType, clientX, clientY, button: 0, preventDefault: vi.fn(),
    target: { closest: (selector: string) => selector === '.notebook-view__scroller' ? {} : null }, ...props,
  } as unknown as PointerEvent
}

function setup() {
  const element = {
    scrollTop: 200, scrollLeft: 0, clientHeight: 500, clientWidth: 400,
    setPointerCapture: vi.fn(), releasePointerCapture: vi.fn(), focus: vi.fn(),
    dataset: {} as DOMStringMap, addEventListener: vi.fn(),
    getBoundingClientRect: () => ({ top: 0, left: 0, width: 400, height: 500 }),
  } as unknown as HTMLElement
  const scroller = ref<HTMLElement | null>(element)
  const document = useNotebookDocument(createNotebook(), vi.fn())
  const viewport = createNotebookViewport(() => document.snapshot.value.pages.length)
  viewport.attach(() => scroller.value)
  const input = createNotebookInput({
    element: () => element, zoom: () => viewport.zoom.value, tool: () => 'pen', onStroke: vi.fn(),
    touchPointerIds: () => interaction.touchPointerIds(),
  })
  const interaction: ReturnType<typeof useNotebookInteraction> = useNotebookInteraction({
    input, viewport, scroller, tool: ref('pen'), activePageId: ref(document.currentPage.value.id), document,
  })
  return { element, scroller, viewport, interaction, document, input }
}

describe('useNotebookInteraction', () => {
  it('keeps ruler handle touches out of page navigation and ink', () => {
    const { interaction, element, input } = setup()
    const target = document.createElement('div')
    target.className = 'notebook-ruler'
    interaction.onPointerDown(pointer(1, 'touch', 100, 100, { target }))
    interaction.onPointerMove(pointer(1, 'touch', 160, 140, { target }))
    interaction.onPointerUp(pointer(1, 'touch', 160, 140, { target }))
    expect(interaction.touchPointerIds()).toEqual([])
    expect(element.scrollTop).toBe(200)
    expect(input.isActive.value).toBe(false)
  })
  it('releases suppressed gutter touches when they end at the root', () => {
    const { interaction, input, element } = setup()
    interaction.onPointerDown(pointer(1, 'touch', 100, 100))
    interaction.onPagePointerDown('page', pointer(2, 'pen', 120, 100))
    expect(input.isTouchNavigationSuppressed.value).toBe(true)
    interaction.onPagePointerUp(pointer(2, 'pen', 120, 100))
    interaction.onPointerUp(pointer(1, 'touch', 100, 100))
    expect(input.isTouchNavigationSuppressed.value).toBe(false)
    interaction.onPointerDown(pointer(3, 'touch', 100, 100))
    interaction.onPointerMove(pointer(3, 'touch', 80, 75))
    expect(element.scrollTop).toBe(225)
    expect(element.scrollLeft).toBe(20)
  })

  it('ignores the right mouse button for ink', () => {
    const { interaction, input, document } = setup()
    interaction.onPagePointerDown(document.currentPage.value.id, pointer(1, 'mouse', 100, 100, { button: 2 }))
    expect(input.isActive.value).toBe(false)
  })

  it('focuses the notebook for shortcuts and finishes ink released outside its page', () => {
    const { interaction, input, element, document } = setup()
    interaction.onPagePointerDown(document.currentPage.value.id, pointer(1, 'mouse', 100, 100))
    expect(element.focus).toHaveBeenCalledWith({ preventScroll: true })
    // Pointer focus is marked so the canvas focus ring stays keyboard-only.
    expect(element.dataset.pointerFocus).toBe('')
    const blur = vi.mocked(element.addEventListener).mock.calls.find(([type]) => type === 'blur')?.[1] as () => void
    blur()
    expect(element.dataset.pointerFocus).toBeUndefined()
    interaction.onPointerUp(pointer(1, 'mouse', 120, 100))
    expect(input.isActive.value).toBe(false)
  })

  it('pans one finger in the direction of the gesture and zooms two fingers at their midpoint', () => {
    const { element, viewport, interaction } = setup()
    interaction.onPointerDown(pointer(1, 'touch', 100, 100))
    interaction.onPointerMove(pointer(1, 'touch', 100, 75))
    expect(element.scrollTop).toBe(225)
    interaction.onPointerDown(pointer(2, 'touch', 200, 75))
    interaction.onPointerMove(pointer(2, 'touch', 220, 75))
    expect(viewport.zoom.value).toBeCloseTo(1.2)
    interaction.onPointerUp(pointer(1, 'touch', 100, 75))
    interaction.onPointerUp(pointer(2, 'touch', 220, 75))
  })

  it('does not run notebook shortcuts from a dialog', () => {
    const { document, interaction } = setup()
    const before = document.snapshot.value
    document.history.push(before, { ...before, future: true })
    interaction.onKeyDown({
      key: 'z', code: 'KeyZ', ctrlKey: true, metaKey: false, shiftKey: false,
      defaultPrevented: false, target: { closest: () => ({}) }, preventDefault: vi.fn(),
    } as unknown as KeyboardEvent)
    expect(document.history.canUndo.value).toBe(true)
  })

  it('flips the selection with Shift+H and Shift+V by physical key, on any layout', () => {
    const { document, interaction } = setup()
    const page = document.currentPage.value
    const initial = {
      ...document.snapshot.value,
      pages: [{ ...page, objects: [{
        id: 'a', actionId: 'a', kind: 'stroke' as const, color: '#123456', width: 2, opacity: 1,
        points: [{ x: 40, y: 50 }, { x: 100, y: 80 }],
      }] }],
    }
    document.setExternalSnapshot(initial)
    const key = (props: Record<string, unknown>) => {
      const event = {
        ctrlKey: false, metaKey: false, altKey: false, shiftKey: true, defaultPrevented: false,
        target: { closest: () => null, matches: () => false }, preventDefault: vi.fn(), ...props,
      } as unknown as KeyboardEvent
      interaction.onKeyDown(event)
      return event
    }
    const points = () => document.snapshot.value.pages[0].objects[0].points.map(point => [point.x, point.y])

    expect(key({ key: 'H', code: 'KeyH' }).preventDefault).not.toHaveBeenCalled()
    expect(document.snapshot.value).toBe(initial)

    document.selectedObjectIds.value = ['a']
    expect(key({ key: 'Р', code: 'KeyH' }).preventDefault).toHaveBeenCalled()
    expect(points()).toEqual([[100, 50], [40, 80]])
    key({ key: 'М', code: 'KeyV' })
    expect(points()).toEqual([[100, 80], [40, 50]])

    const flipped = document.snapshot.value
    key({ key: 'H', code: 'KeyH', ctrlKey: true })
    key({ key: 'h', code: 'KeyH', shiftKey: false })
    key({ key: 'H', code: 'KeyH', target: { closest: () => null, matches: () => true } })
    expect(document.snapshot.value).toBe(flipped)
  })
})
