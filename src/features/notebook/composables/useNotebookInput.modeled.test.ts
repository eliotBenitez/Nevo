import { afterEach, describe, expect, it, vi } from 'vitest'
import { createNotebookInput } from './useNotebookInput'
import type { NotebookInputTool } from './useNotebookInput'
import { captureNotebookRulerGuide } from '../../../core/notebook/ruler'

function pointer(type: string, props: Record<string, unknown> = {}) {
  return {
    type, pointerId: 1, pointerType: 'pen', button: 0, clientX: 10, clientY: 20, pressure: 0.5, timeStamp: 1000,
    preventDefault: vi.fn(), ...props,
  } as unknown as PointerEvent
}

const element = {
  getBoundingClientRect: () => ({ left: 10, top: 20, width: 400, height: 600 }),
  setPointerCapture: vi.fn(),
  releasePointerCapture: vi.fn(),
} as unknown as HTMLElement

function create(tool: NotebookInputTool, extra: Partial<Parameters<typeof createNotebookInput>[0]> = {}) {
  const onStroke = vi.fn()
  const onCheckpoint = vi.fn()
  const input = createNotebookInput({
    element: () => element, zoom: () => 1, tool: () => tool, modelStrokes: () => true, onStroke, onCheckpoint, ...extra,
  })
  return { input, onStroke, onCheckpoint }
}

/** A wobbly rightward stroke sampled every 8 ms. */
function draw(input: ReturnType<typeof createNotebookInput>, count = 30, finish = true) {
  input.pointerDown(pointer('pointerdown'))
  for (let index = 1; index < count; index += 1) {
    input.pointerMove(pointer('pointermove', {
      clientX: 10 + index * 4, clientY: 20 + (index % 2 === 0 ? 3 : -3), pressure: 0.2 + index / 60, timeStamp: 1000 + index * 8,
    }))
  }
  if (finish) input.pointerUp(pointer('pointerup', { clientX: 10 + count * 4, clientY: 20, pressure: 0.6, timeStamp: 1000 + count * 8 }))
}

afterEach(() => vi.useRealTimers())

describe('createNotebookInput stroke modeling', () => {
  it.each(['pen', 'marker'] as const)('models %s strokes, marks the gesture and ends at the lift point', tool => {
    const { input, onStroke } = create(tool)
    draw(input)
    expect(onStroke).toHaveBeenCalledTimes(1)
    const [points, , style] = onStroke.mock.calls[0]
    expect(style.modeled).toBe(true)
    expect(points.length).toBeGreaterThan(30)
    const end = points[points.length - 1]
    expect(Math.hypot(end.x - 120, end.y)).toBeLessThan(1)
    // modeling smooths the +-3 px zigzag
    const middle = points.slice(10, -10).map((point: { y: number }) => Math.abs(point.y))
    expect(Math.max(...middle)).toBeLessThan(3)
  })

  it('does not model without opt-in', () => {
    const onStroke = vi.fn()
    const input = createNotebookInput({ element: () => element, zoom: () => 1, tool: () => 'pen', onStroke })
    draw(input, 5)
    expect(onStroke.mock.calls[0][0]).toHaveLength(5 + 1)
    expect(onStroke.mock.calls[0][2].modeled).toBeUndefined()
  })

  it.each(['eraser', 'lasso', 'line', 'arrow', 'circle', 'laser'] as const)('never models the %s tool', tool => {
    const { input, onStroke } = create(tool)
    draw(input, 6)
    expect(onStroke).toHaveBeenCalledTimes(1)
    expect(onStroke.mock.calls[0][0]).toHaveLength(6 + 1)
    expect(onStroke.mock.calls[0][2].modeled).toBeUndefined()
  })

  it('does not model a stroke that follows a ruler edge', () => {
    const { input, onStroke } = create('pen', {
      rulerGuide: point => captureNotebookRulerGuide({ x: 60, y: 26, angle: 0 }, point, 1),
    })
    draw(input, 6)
    expect(onStroke.mock.calls[0][0]).toHaveLength(6 + 1)
    expect(onStroke.mock.calls[0][2].modeled).toBeUndefined()
  })

  it('previews with the prediction but stores only modeled points; checkpoints stay prefixes', () => {
    vi.useFakeTimers()
    const { input, onStroke, onCheckpoint } = create('pen')
    draw(input, 20, false)
    vi.advanceTimersByTime(40)
    const preview = [...input.activePoints.value]
    expect(input.isModeled.value).toBe(true)
    vi.advanceTimersByTime(2000)
    expect(onCheckpoint).toHaveBeenCalledTimes(1)
    const checkpoint = onCheckpoint.mock.calls[0][0]
    expect(onCheckpoint.mock.calls[0][2].modeled).toBe(true)
    expect(preview.length).toBeGreaterThan(checkpoint.length)
    expect(preview.slice(0, checkpoint.length)).toEqual(checkpoint)

    input.pointerUp(pointer('pointerup', { clientX: 100, clientY: 20, timeStamp: 1000 + 20 * 8 }))
    const final = onStroke.mock.calls[0][0]
    expect(final.length).toBeGreaterThan(checkpoint.length)
    expect(final.slice(0, checkpoint.length)).toEqual(checkpoint)
    expect(input.activePoints.value).toEqual([])
    expect(input.isModeled.value).toBe(false)
  })

  it('keeps hold recognition on the raw samples and commits the recognized shape unmodeled', () => {
    vi.useFakeTimers()
    const recognizeHold = vi.fn((points: Array<{ x: number; y: number }>) => [points[0], points[points.length - 1]])
    const onRecognized = vi.fn()
    const { input, onStroke } = create('pen', { recognizeHold, onRecognized, holdDelayMs: 300 })
    input.pointerDown(pointer('pointerdown'))
    input.pointerMove(pointer('pointermove', { clientX: 50, clientY: 20, timeStamp: 1010 }))
    input.pointerMove(pointer('pointermove', { clientX: 90, clientY: 22, timeStamp: 1020 }))
    input.pointerMove(pointer('pointermove', { clientX: 130, clientY: 24, timeStamp: 1030 }))
    vi.advanceTimersByTime(400)
    expect(recognizeHold).toHaveBeenCalledTimes(1)
    expect(recognizeHold.mock.calls[0][0]).toEqual([
      { x: 0, y: 0, pressure: 0.5 }, { x: 40, y: 0, pressure: 0.5 }, { x: 80, y: 2, pressure: 0.5 },
      { x: 120, y: 4, pressure: 0.5 },
    ])
    expect(onRecognized).toHaveBeenCalledTimes(1)
    expect(onRecognized.mock.calls[0][1].modeled).toBeUndefined()
    input.pointerUp(pointer('pointerup', { clientX: 130, clientY: 24, timeStamp: 1040 }))
    expect(onStroke).not.toHaveBeenCalled()
  })

  it('stores nothing on explicit cancel and starts the next stroke cleanly', () => {
    const { input, onStroke } = create('pen')
    draw(input, 10, false)
    input.cancel()
    expect(onStroke).not.toHaveBeenCalled()
    expect(input.activePoints.value).toEqual([])
    draw(input, 10)
    expect(onStroke).toHaveBeenCalledTimes(1)
    expect(onStroke.mock.calls[0][0][0]).toMatchObject({ x: 0, y: 0 })
  })

  it('keeps a tap as a single point', () => {
    const { input, onStroke } = create('pen')
    input.pointerDown(pointer('pointerdown'))
    input.pointerUp(pointer('pointerup'))
    expect(onStroke.mock.calls[0][0]).toEqual([{ x: 0, y: 0, pressure: 0.5 }])
  })
})
