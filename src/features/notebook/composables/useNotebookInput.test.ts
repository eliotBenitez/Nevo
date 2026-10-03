import { afterEach, describe, expect, it, vi } from 'vitest'
import { createNotebookInput } from './useNotebookInput'
import { captureNotebookRulerGuide } from '../../../core/notebook/ruler'

function pointer(type: string, props: Record<string, unknown> = {}) {
  return {
    type,
    pointerId: 1,
    pointerType: 'pen',
    button: 0,
    clientX: 30,
    clientY: 50,
    pressure: 0.5,
    timeStamp: 10,
    preventDefault: vi.fn(),
    ...props,
  } as unknown as PointerEvent
}

function setup(tool: 'pen' | 'marker' | 'eraser' | 'lasso' = 'pen') {
  const element = {
    getBoundingClientRect: () => ({ left: 10, top: 20, width: 200, height: 300 }),
    setPointerCapture: vi.fn(),
    releasePointerCapture: vi.fn(),
  } as unknown as HTMLElement
  const onStroke = vi.fn()
  const onSuppressedTouch = vi.fn()
  const input = createNotebookInput({
    element: () => element,
    zoom: () => 2,
    tool: () => tool,
    onStroke,
    onSuppressedTouch,
  })
  return { input, element, onStroke, onSuppressedTouch }
}

describe('createNotebookInput', () => {
  afterEach(() => vi.useRealTimers())

  it('previews laser contact immediately without checkpointing or ruler snapping', () => {
    vi.useFakeTimers()
    const { element } = setup()
    const onCheckpoint = vi.fn(), onStroke = vi.fn(), rulerGuide = vi.fn()
    const input = createNotebookInput({ element: () => element, zoom: () => 2, tool: () => 'laser', onCheckpoint, onStroke, rulerGuide })
    input.pointerDown(pointer('pointerdown'))
    input.pointerMove(pointer('pointermove', { clientY: 90, timeStamp: 20 }))
    vi.advanceTimersByTime(4000)
    expect(input.activePoints.value.map(point => point.y)).toEqual([15, 35])
    expect(onCheckpoint).not.toHaveBeenCalled()
    expect(rulerGuide).not.toHaveBeenCalled()
    input.pointerUp(pointer('pointerup', { clientY: 100, timeStamp: 30 }))
    expect(onStroke).toHaveBeenCalledTimes(1)
    expect(onStroke.mock.calls[0][1]).toBe('laser')
  })

  it.each(['pen', 'marker'] as const)('keeps %s live preview and checkpoint ink on the captured ruler edge', tool => {
    vi.useFakeTimers()
    const { element } = setup()
    let pose = { x: 100, y: 42, angle: 0 }
    const onStroke = vi.fn()
    const onCheckpoint = vi.fn()
    const input = createNotebookInput({ element: () => element, zoom: () => 2, tool: () => tool,
      rulerGuide: point => captureNotebookRulerGuide(pose, point, 2), onStroke, onCheckpoint })
    input.pointerDown(pointer('pointerdown', { clientY: 54, pressure: 0.8 }))
    pose = { x: 200, y: 200, angle: 90 }
    input.pointerMove(pointer('pointermove', { clientX: 150, clientY: 80, pressure: 0.3, timeStamp: 20 }))
    vi.advanceTimersByTime(2000)
    expect(input.activePoints.value.map(p => p.y)).toEqual([16, 16])
    expect(onCheckpoint.mock.calls[0][0][1]).toMatchObject({ x: 70, y: 16, pressure: 0.3 })
    input.pointerUp(pointer('pointerup', { clientX: 160, clientY: 90, pressure: 0, timeStamp: 30 }))
    expect(onStroke.mock.calls[0][0].map((p: { y: number }) => p.y)).toEqual([16, 16, 16])
    expect(onStroke.mock.calls[0][0][2].pressure).toBe(0)
    expect(onStroke.mock.calls[0][3]).toBe(onCheckpoint.mock.calls[0][3])
  })

  it('does not constrain eraser, selection, or a stroke started away from the ruler', () => {
    for (const tool of ['eraser', 'lasso', 'pen'] as const) {
      const { element } = setup()
      const guide = vi.fn(point => captureNotebookRulerGuide({ x: 100, y: 200, angle: 0 }, point, 2))
      const onStroke = vi.fn()
      const input = createNotebookInput({ element: () => element, zoom: () => 2, tool: () => tool, rulerGuide: guide, onStroke })
      input.pointerDown(pointer('pointerdown'))
      input.pointerMove(pointer('pointermove', { clientY: 80, timeStamp: 20 }))
      input.pointerUp(pointer('pointerup', { clientY: 90, timeStamp: 30 }))
      expect(onStroke.mock.calls[0][0].map((p: { y: number }) => p.y)).toEqual([15, 30, 35])
      expect(guide).toHaveBeenCalledTimes(tool === 'pen' ? 1 : 0)
    }
  })

  it('uses page coordinates, keeps explicit zero pressure, and commits once on cancellation', () => {
    const { input, element, onStroke } = setup()
    input.pointerDown(pointer('pointerdown', { pressure: 0, pointerId: 7 }))
    input.pointerMove(pointer('pointermove', {
      pressure: 0,
      pointerId: 7,
      clientX: 34,
      clientY: 58,
      timeStamp: 20,
    }))
    input.pointerCancel(pointer('pointercancel', { pointerId: 7 }))
    input.pointerUp(pointer('pointerup', { pointerId: 7 }))

    expect(element.setPointerCapture).toHaveBeenCalledWith(7)
    expect(onStroke).toHaveBeenCalledTimes(1)
    expect(onStroke.mock.calls[0][0]).toEqual([
      { x: 10, y: 15, pressure: 0 },
      { x: 12, y: 19, pressure: 0 },
    ])
  })

  it('uses coalesced samples when available and deduplicates the dispatched final sample', () => {
    const { input, onStroke } = setup()
    input.pointerDown(pointer('pointerdown'))
    const final = pointer('pointermove', { clientX: 34, timeStamp: 20 })
    input.pointerMove(Object.assign(final, {
      getCoalescedEvents: () => [
        pointer('pointermove', { clientX: 32, timeStamp: 15 }),
        pointer('pointermove', { clientX: 34, timeStamp: 20 }),
      ],
    }))
    input.pointerUp(pointer('pointerup'))

    expect(onStroke.mock.calls[0][0]).toHaveLength(3)
    expect(onStroke.mock.calls[0][0][1]).toMatchObject({ x: 11 })
  })

  it('suppresses touch navigation during pen contact and until suppressed touches lift', () => {
    const { input, onSuppressedTouch } = setup()
    input.pointerDown(pointer('pointerdown', { pointerId: 5 }))
    input.pointerDown(pointer('pointerdown', { pointerId: 6, pointerType: 'touch' }))
    input.pointerUp(pointer('pointerup', { pointerId: 5 }))

    expect(input.isTouchNavigationSuppressed.value).toBe(true)
    input.pointerUp(pointer('pointerup', { pointerId: 6, pointerType: 'touch' }))
    expect(input.isTouchNavigationSuppressed.value).toBe(false)
    expect(onSuppressedTouch).toHaveBeenLastCalledWith(false)
  })

  it('freezes page coordinates and suppresses touches that began before the pen arrived', () => {
    let left = 10
    let zoom = 2
    const suppressedTouches = [4]
    const element = {
      getBoundingClientRect: () => ({ left, top: 20, width: 200, height: 300 }),
      setPointerCapture: vi.fn(),
      releasePointerCapture: vi.fn(),
    } as unknown as HTMLElement
    const onStroke = vi.fn()
    const input = createNotebookInput({
      element: () => element,
      zoom: () => zoom,
      tool: () => 'pen',
      onStroke,
      touchPointerIds: () => suppressedTouches,
    })
    input.pointerDown(pointer('pointerdown', { pointerId: 8 }))
    left = 100
    zoom = 4
    input.pointerMove(pointer('pointermove', { pointerId: 8, clientX: 34, clientY: 58, timeStamp: 20 }))
    input.pointerUp(pointer('pointerup', { pointerId: 8, timeStamp: 30 }))

    expect(onStroke.mock.calls[0][0][1]).toMatchObject({ x: 12, y: 19 })
    expect(input.isTouchNavigationSuppressed.value).toBe(true)
    input.pointerUp(pointer('pointerup', { pointerId: 4, pointerType: 'touch' }))
    expect(input.isTouchNavigationSuppressed.value).toBe(false)
  })

  it('uses the captured tool style and cancels lasso without committing a selection', () => {
    let color = '#000000'
    const element = {
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 300, height: 400 }),
      setPointerCapture: vi.fn(),
      releasePointerCapture: vi.fn(),
    } as unknown as HTMLElement
    const onStroke = vi.fn()
    const input = createNotebookInput({
      element: () => element,
      zoom: () => 1,
      tool: () => 'lasso',
      style: () => ({ color, width: 1.5, markerWidth: 12, eraserDiameter: 12 }),
      onStroke,
    })
    input.pointerDown(pointer('pointerdown', { pointerId: 9 }))
    color = '#ff0000'
    input.pointerMove(pointer('pointermove', { pointerId: 9, timeStamp: 20, clientX: 60 }))
    input.pointerCancel(pointer('pointercancel', { pointerId: 9 }))

    expect(onStroke).not.toHaveBeenCalled()
  })

  it('uses a stable half-pressure fallback for mouse input', () => {
    const { input, onStroke } = setup()
    input.pointerDown(pointer('pointerdown', { pointerType: 'mouse', pressure: 0, pointerId: 10 }))
    input.pointerUp(pointer('pointerup', { pointerType: 'mouse', pressure: 0, pointerId: 10, timeStamp: 20 }))

    expect(onStroke.mock.calls[0][0].every((point: { pressure?: number }) => point.pressure === 0.5)).toBe(true)
  })

  it('checkpoints a long active contact with the same action identity before final commit', async () => {
    vi.useFakeTimers()
    const element = {
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 300, height: 400 }),
      setPointerCapture: vi.fn(),
      releasePointerCapture: vi.fn(),
    } as unknown as HTMLElement
    const onStroke = vi.fn()
    const onCheckpoint = vi.fn()
    const input = createNotebookInput({ element: () => element, zoom: () => 1, tool: () => 'pen', onStroke, onCheckpoint })
    input.pointerDown(pointer('pointerdown', { pointerId: 20 }))
    input.pointerMove(pointer('pointermove', { pointerId: 20, timeStamp: 20, clientX: 40 }))
    await vi.advanceTimersByTimeAsync(2_000)
    const checkpointId = onCheckpoint.mock.calls[0][3]
    input.pointerUp(pointer('pointerup', { pointerId: 20, timeStamp: 30, clientX: 50 }))

    expect(checkpointId).toBe(onStroke.mock.calls[0][3])
    expect(onCheckpoint).toHaveBeenCalledOnce()
  })

  it('keeps a line as one committed stroke and snaps its endpoint to fifteen degrees while shift is held', () => {
    const element = {
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 400, height: 400 }),
      setPointerCapture: vi.fn(),
      releasePointerCapture: vi.fn(),
    } as unknown as HTMLElement
    const onStroke = vi.fn()
    const onCheckpoint = vi.fn()
    const input = createNotebookInput({ element: () => element, zoom: () => 1, tool: () => 'line', onStroke, onCheckpoint })
    input.pointerDown(pointer('pointerdown', { pointerId: 31, clientX: 50, clientY: 50 }))
    input.pointerMove(pointer('pointermove', { pointerId: 31, timeStamp: 20, clientX: 150, clientY: 70, shiftKey: true }))
    input.pointerUp(pointer('pointerup', { pointerId: 31, timeStamp: 30, clientX: 150, clientY: 70, shiftKey: true }))

    expect(onStroke).toHaveBeenCalledOnce()
    expect(onStroke.mock.calls[0][1]).toBe('line')
    expect(onStroke.mock.calls[0][0][0]).toEqual({ x: 50, y: 50, pressure: 0.5 })
    const end = onStroke.mock.calls[0][0].at(-1) as { x: number; y: number }
    const dx = end.x - 50
    const dy = end.y - 50
    const angle = Math.atan2(dy, dx)
    const step = Math.PI / 12
    expect(Math.hypot(dx, dy)).toBeCloseTo(Math.hypot(100, 20), 6)
    expect(Math.abs(angle / step - Math.round(angle / step))).toBeCloseTo(0, 6)
    expect(Math.abs(angle - Math.atan2(20, 100))).toBeGreaterThan(1e-6)
    expect(onCheckpoint).not.toHaveBeenCalled()
  })

  it('snaps a shape endpoint to a square with shift and keeps circles square without it', () => {
    const element = {
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 400, height: 400 }),
      setPointerCapture: vi.fn(),
      releasePointerCapture: vi.fn(),
    } as unknown as HTMLElement
    const onStroke = vi.fn()
    const onCheckpoint = vi.fn()
    const input = createNotebookInput({ element: () => element, zoom: () => 1, tool: () => 'rectangle', onStroke, onCheckpoint })
    input.pointerDown(pointer('pointerdown', { pointerId: 41, clientX: 50, clientY: 50 }))
    input.pointerMove(pointer('pointermove', { pointerId: 41, timeStamp: 20, clientX: 150, clientY: 90, shiftKey: true }))
    input.pointerUp(pointer('pointerup', { pointerId: 41, timeStamp: 30, clientX: 150, clientY: 90, shiftKey: true }))

    expect(onStroke).toHaveBeenCalledOnce()
    expect(onStroke.mock.calls[0][1]).toBe('rectangle')
    expect(onStroke.mock.calls[0][0][0]).toEqual({ x: 50, y: 50, pressure: 0.5 })
    expect(onStroke.mock.calls[0][0].at(-1)).toEqual({ x: 150, y: 150, pressure: 0.5 })
    expect(onCheckpoint).not.toHaveBeenCalled()
  })

  it('keeps the circle tool square even without shift', () => {
    const element = {
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 400, height: 400 }),
      setPointerCapture: vi.fn(),
      releasePointerCapture: vi.fn(),
    } as unknown as HTMLElement
    const onStroke = vi.fn()
    const input = createNotebookInput({ element: () => element, zoom: () => 1, tool: () => 'circle', onStroke })
    input.pointerDown(pointer('pointerdown', { pointerId: 42, clientX: 10, clientY: 10 }))
    input.pointerMove(pointer('pointermove', { pointerId: 42, timeStamp: 20, clientX: 110, clientY: 40 }))
    input.pointerUp(pointer('pointerup', { pointerId: 42, timeStamp: 30, clientX: 110, clientY: 40 }))

    expect(onStroke.mock.calls[0][0].at(-1)).toEqual({ x: 110, y: 110, pressure: 0.5 })
  })

  it('keeps a held arrow as preview until explicit input flush and commits it once', async () => {
    vi.useFakeTimers()
    const element = {
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 300, height: 400 }),
      setPointerCapture: vi.fn(),
      releasePointerCapture: vi.fn(),
    } as unknown as HTMLElement
    const onStroke = vi.fn()
    const onCheckpoint = vi.fn()
    const input = createNotebookInput({ element: () => element, zoom: () => 1, tool: () => 'arrow', onStroke, onCheckpoint })
    input.pointerDown(pointer('pointerdown', { pointerId: 21 }))
    input.pointerMove(pointer('pointermove', { pointerId: 21, timeStamp: 20, clientX: 100 }))
    await vi.advanceTimersByTimeAsync(6_000)
    expect(onCheckpoint).not.toHaveBeenCalled()
    expect(onStroke).not.toHaveBeenCalled()

    input.finish()
    input.pointerUp(pointer('pointerup', { pointerId: 21, timeStamp: 30 }))
    expect(onStroke).toHaveBeenCalledOnce()
    expect(onStroke.mock.calls[0][1]).toBe('arrow')
    expect(onStroke.mock.calls[0][0]).toEqual([
      { x: 30, y: 50, pressure: 0.5 },
      { x: 100, y: 50, pressure: 0.5 },
    ])
    expect(input.activePoints.value).toEqual([])
  })
})

describe('createNotebookInput draw-and-hold recognition', () => {
  afterEach(() => vi.useRealTimers())

  /** Pointer down plus three moves ending at (60, 90): enough samples to be eligible for snapping. */
  function startHeldStroke(input: ReturnType<typeof createNotebookInput>, down: Record<string, unknown> = {}): void {
    input.pointerDown(pointer('pointerdown', down))
    input.pointerMove(pointer('pointermove', { clientX: 40, clientY: 60, timeStamp: 13 }))
    input.pointerMove(pointer('pointermove', { clientX: 50, clientY: 75, timeStamp: 16 }))
    input.pointerMove(pointer('pointermove', { clientX: 60, clientY: 90, timeStamp: 20 }))
  }

  function setupHold(tool: 'pen' | 'marker' = 'pen', extra: Record<string, unknown> = {}) {
    vi.useFakeTimers()
    const element = {
      getBoundingClientRect: () => ({ left: 10, top: 20, width: 200, height: 300 }),
      setPointerCapture: vi.fn(),
      releasePointerCapture: vi.fn(),
    } as unknown as HTMLElement
    const clean = [{ x: 1, y: 1, pressure: 0.5 }, { x: 9, y: 9, pressure: 0.5 }]
    const recognizeHold = vi.fn((_points: unknown) => clean as typeof clean | null)
    const onRecognized = vi.fn()
    const onStroke = vi.fn()
    const input = createNotebookInput({
      element: () => element, zoom: () => 2, tool: () => tool, recognizeHold, onRecognized, onStroke, ...extra,
    })
    return { input, recognizeHold, onRecognized, onStroke, clean }
  }

  it('commits the recognized shape when the hold delay elapses and nothing more on release', () => {
    const { input, recognizeHold, onRecognized, onStroke, clean } = setupHold()
    startHeldStroke(input)
    vi.advanceTimersByTime(499)
    expect(recognizeHold).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(recognizeHold).toHaveBeenCalledTimes(1)
    expect(onRecognized).toHaveBeenCalledTimes(1)
    expect(onRecognized.mock.calls[0][0]).toEqual(clean)
    expect(input.activePoints.value).toEqual([])
    input.pointerMove(pointer('pointermove', { clientX: 120, clientY: 160, timeStamp: 30 }))
    input.pointerUp(pointer('pointerup', { clientX: 130, clientY: 170, timeStamp: 40 }))
    expect(onStroke).not.toHaveBeenCalled()
    expect(onRecognized).toHaveBeenCalledTimes(1)
    expect(input.isActive.value).toBe(false)
  })

  it('restarts the timer when the pointer moves beyond the tolerance and ignores jitter', () => {
    const { input, recognizeHold } = setupHold()
    startHeldStroke(input)
    vi.advanceTimersByTime(400)
    input.pointerMove(pointer('pointermove', { clientX: 61, clientY: 90, timeStamp: 30 }))
    vi.advanceTimersByTime(100)
    expect(recognizeHold).toHaveBeenCalledTimes(1)
    const second = setupHold()
    startHeldStroke(second.input)
    vi.advanceTimersByTime(400)
    second.input.pointerMove(pointer('pointermove', { clientX: 90, clientY: 90, timeStamp: 30 }))
    vi.advanceTimersByTime(400)
    expect(second.recognizeHold).not.toHaveBeenCalled()
    vi.advanceTimersByTime(100)
    expect(second.recognizeHold).toHaveBeenCalledTimes(1)
  })

  it('falls back to a normal stroke when nothing is recognized', () => {
    const { input, recognizeHold, onRecognized, onStroke } = setupHold()
    recognizeHold.mockReturnValue(null)
    startHeldStroke(input)
    vi.advanceTimersByTime(600)
    input.pointerUp(pointer('pointerup', { clientX: 80, clientY: 90, timeStamp: 30 }))
    expect(onRecognized).not.toHaveBeenCalled()
    expect(onStroke).toHaveBeenCalledTimes(1)
    expect(onStroke.mock.calls[0][0]).toHaveLength(5)
  })

  it('never recognizes marker strokes or ruler-guided strokes', () => {
    const marker = setupHold('marker')
    startHeldStroke(marker.input)
    vi.advanceTimersByTime(1000)
    expect(marker.recognizeHold).not.toHaveBeenCalled()
    const ruled = setupHold('pen', { rulerGuide: (point: { x: number; y: number }) => captureNotebookRulerGuide({ x: 100, y: 42, angle: 0 }, point, 2) })
    startHeldStroke(ruled.input, { clientY: 54 })
    vi.advanceTimersByTime(1000)
    expect(ruled.recognizeHold).not.toHaveBeenCalled()
  })

  it('does not snap a resting pen after a single jump and keeps drawing afterwards', () => {
    const { input, recognizeHold, onRecognized, onStroke } = setupHold()
    input.pointerDown(pointer('pointerdown'))
    input.pointerMove(pointer('pointermove', { clientX: 60, clientY: 90, timeStamp: 20 }))
    vi.advanceTimersByTime(15_000)
    expect(recognizeHold).not.toHaveBeenCalled()
    input.pointerMove(pointer('pointermove', { clientX: 120, clientY: 160, timeStamp: 15_020 }))
    input.pointerUp(pointer('pointerup', { clientX: 130, clientY: 170, timeStamp: 15_030 }))
    expect(onRecognized).not.toHaveBeenCalled()
    expect(onStroke).toHaveBeenCalledTimes(1)
    expect(onStroke.mock.calls[0][0]).toHaveLength(4)
  })

  it('ignores points that arrive after recognition', () => {
    const { input, onRecognized, clean } = setupHold()
    startHeldStroke(input)
    vi.advanceTimersByTime(500)
    input.pointerMove(pointer('pointermove', { clientX: 200, clientY: 200, timeStamp: 30 }))
    vi.advanceTimersByTime(50)
    expect(input.activePoints.value).toEqual([])
    input.pointerUp(pointer('pointerup', { clientX: 210, clientY: 210, timeStamp: 40 }))
    vi.advanceTimersByTime(1000)
    expect(onRecognized).toHaveBeenCalledTimes(1)
    expect(onRecognized.mock.calls[0][0]).toEqual(clean)
  })
})
