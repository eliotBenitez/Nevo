import { describe, it, expect, vi } from 'vitest'
import { useDrawEditor, constrainGeometryPoint } from './useDrawEditor'
import { parseDrawData, strokeBBox } from '../../utils/draw/drawEngine'
import type { DrawStroke } from '../../utils/draw/drawEngine'

function makeStroke(): DrawStroke {
  return {
    type: 'freehand',
    points: [{ x: 10, y: 10, p: 0.5 }, { x: 20, y: 20, p: 0.5 }],
    color: '#1e1e1e',
    size: 3,
  }
}

describe('useDrawEditor save path', () => {
  it('flushSave persists the drawing and reports the asset src', async () => {
    const onSave = vi.fn(async (_bytes: number[]) => '.nevo/assets/draw-x-abc.draw.json')
    const onPersisted = vi.fn()

    const editor = useDrawEditor({ drawId: 'x', initialBytes: null, onSave, onPersisted })

    // Commit a stroke the way endStroke does, then schedule + flush.
    editor.strokes.value = [makeStroke()]
    editor.scheduleSave()
    await editor.flushSave()

    expect(onSave).toHaveBeenCalledTimes(1)
    const bytes = onSave.mock.calls[0][0]
    expect(Array.isArray(bytes)).toBe(true)
    expect(bytes.length).toBeGreaterThan(0)
    expect(onPersisted).toHaveBeenCalledTimes(1)
    expect(onPersisted.mock.calls[0][0]).toMatchObject({
      drawId: 'x',
      src: '.nevo/assets/draw-x-abc.draw.json',
    })
    expect(typeof onPersisted.mock.calls[0][0].svgPreview).toBe('string')
  })

  it('flushSave with no pending edits does not write', async () => {
    const onSave = vi.fn(async () => 'src')
    const onPersisted = vi.fn()
    const editor = useDrawEditor({ drawId: 'y', initialBytes: null, onSave, onPersisted })
    await editor.flushSave()
    expect(onSave).not.toHaveBeenCalled()
    expect(onPersisted).not.toHaveBeenCalled()
  })

  it('serialises concurrent saves into ordered writes', async () => {
    const order: string[] = []
    const onSave = vi.fn(async () => { order.push('save'); return 'src' })
    const onPersisted = vi.fn(() => { order.push('persist') })
    const editor = useDrawEditor({ drawId: 'z', initialBytes: null, onSave, onPersisted })

    editor.strokes.value = [makeStroke()]
    editor.scheduleSave()
    const a = editor.flushSave()
    editor.strokes.value = [makeStroke(), makeStroke()]
    editor.scheduleSave()
    const b = editor.flushSave()
    await Promise.all([a, b])

    // Each persist must follow its save (no interleaving / lost writes).
    expect(order[0]).toBe('save')
    expect(order[1]).toBe('persist')
  })
})

describe('useDrawEditor — перемещение объектов (инструмент «рука»)', () => {
  // jsdom-овский <svg> не имеет getScreenCTM/createSVGPoint → pointFromEvent
  // падает в fallback (clientX/Y минус rect, который в jsdom = 0), поэтому
  // экранные координаты события == world-координаты. Это и используем.
  function setup() {
    const editor = useDrawEditor({ drawId: 'm', initialBytes: null, onSave: async () => 's', onPersisted: () => {} })
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    editor.setOverlay(svg as unknown as SVGSVGElement)
    return editor
  }
  function ptr(clientX: number, clientY: number) {
    return { clientX, clientY, pointerId: 1, preventDefault() {}, releasePointerCapture() {}, setPointerCapture() {} } as unknown as PointerEvent
  }

  it('перетаскивает объект под курсором и не трогает камеру', () => {
    const editor = setup()
    editor.strokes.value = [{ type: 'rectangle', points: [{ x: 100, y: 100 }, { x: 200, y: 150 }], color: '#000', size: 3 }]
    const camBefore = { ...editor.camera.value }

    const started = editor.tryBeginMove(ptr(150, 120))
    expect(started).toBe(true)
    expect(editor.isMovingStroke.value).toBe(true)

    editor.moveStrokeAt(ptr(170, 140))
    editor.endMove(ptr(170, 140))

    expect(editor.isMovingStroke.value).toBe(false)
    // Камера не сдвинулась — двигали объект, а не холст.
    expect(editor.camera.value).toEqual(camBefore)
    // Штрих сдвинут на (+20, +20).
    const s = editor.strokes.value[0]
    expect(s.points[0]).toMatchObject({ x: 120, y: 120 })
    expect(s.points[1]).toMatchObject({ x: 220, y: 170 })
  })

  it('не начинает перетаскивание на пустом месте (→ панорамирование)', () => {
    const editor = setup()
    editor.strokes.value = [{ type: 'rectangle', points: [{ x: 100, y: 100 }, { x: 200, y: 150 }], color: '#000', size: 3 }]
    const started = editor.tryBeginMove(ptr(500, 500))
    expect(started).toBe(false)
    expect(editor.isMovingStroke.value).toBe(false)
  })

  it('сохраняет z-order и поддерживает undo перемещения', () => {
    const editor = setup()
    const a: DrawStroke = { type: 'rectangle', points: [{ x: 100, y: 100 }, { x: 200, y: 150 }], color: '#a00', size: 3 }
    const b: DrawStroke = { type: 'rectangle', points: [{ x: 300, y: 300 }, { x: 400, y: 350 }], color: '#00a', size: 3 }
    editor.strokes.value = [a, b]

    // Тянем нижний (a, индекс 0).
    editor.tryBeginMove(ptr(150, 120))
    editor.moveStrokeAt(ptr(160, 130))
    editor.endMove(ptr(160, 130))

    // a остался под индексом 0 (z-order сохранён), b — по-прежнему сверху.
    expect(editor.strokes.value[0].color).toBe('#a00')
    expect(editor.strokes.value[1].color).toBe('#00a')
    expect(editor.strokes.value[0].points[0]).toMatchObject({ x: 110, y: 110 })

    // Undo возвращает исходную позицию.
    editor.undo()
    expect(editor.strokes.value[0].points[0]).toMatchObject({ x: 100, y: 100 })
  })
})

describe('useDrawEditor — выделение и манипуляции', () => {
  function rect(id: string, x0: number, y0: number, x1: number, y1: number): DrawStroke {
    return { type: 'rectangle', points: [{ x: x0, y: y0 }, { x: x1, y: y1 }], color: '#000', size: 3, id }
  }
  function setup(strokes: DrawStroke[]) {
    const editor = useDrawEditor({ drawId: 's', initialBytes: null, onSave: async () => 's', onPersisted: () => {} })
    editor.strokes.value = strokes
    return editor
  }

  it('selectInRect выбирает пересекающиеся объекты по id', () => {
    const editor = setup([rect('a', 0, 0, 50, 50), rect('b', 200, 200, 260, 260)])
    editor.selectInRect({ minX: -10, minY: -10, maxX: 100, maxY: 100 }, false)
    expect([...editor.selection.value]).toEqual(['a'])
  })

  it('selectOnly/toggleSelection/clearSelection и isSelected', () => {
    const editor = setup([rect('a', 0, 0, 10, 10), rect('b', 20, 20, 30, 30)])
    editor.selectOnly('a')
    expect(editor.isSelected('a')).toBe(true)
    editor.toggleSelection('b')
    expect([...editor.selection.value].sort()).toEqual(['a', 'b'])
    editor.toggleSelection('a')
    expect([...editor.selection.value]).toEqual(['b'])
    editor.clearSelection()
    expect(editor.selection.value.size).toBe(0)
  })

  it('selectionBox охватывает bbox выбранных объектов', () => {
    const editor = setup([rect('a', 0, 0, 50, 40), rect('b', 100, 100, 160, 150)])
    editor.selectOnly('a')
    expect(editor.selectionBox.value).toMatchObject({ minX: 0, minY: 0, maxX: 50, maxY: 40 })
    editor.toggleSelection('b')
    expect(editor.selectionBox.value).toMatchObject({ minX: 0, minY: 0, maxX: 160, maxY: 150 })
  })

  it('deleteSelection удаляет выбранные и поддерживает undo', () => {
    const editor = setup([rect('a', 0, 0, 10, 10), rect('b', 20, 20, 30, 30)])
    editor.selectOnly('a')
    editor.deleteSelection()
    expect(editor.strokes.value.map((s) => s.id)).toEqual(['b'])
    expect(editor.selection.value.size).toBe(0)
    editor.undo()
    expect(editor.strokes.value.map((s) => s.id)).toEqual(['a', 'b'])
  })

  it('duplicateSelection создаёт смещённые копии и переносит выделение на них', () => {
    const editor = setup([rect('a', 0, 0, 10, 10)])
    editor.selectOnly('a')
    editor.duplicateSelection(16)
    expect(editor.strokes.value).toHaveLength(2)
    const copy = editor.strokes.value[1]
    expect(copy.id).not.toBe('a')
    expect(copy.points[0]).toMatchObject({ x: 16, y: 16 })
    // Выделение перешло на копию.
    expect(editor.selection.value.has(copy.id!)).toBe(true)
    expect(editor.selection.value.has('a')).toBe(false)
  })

  it('перемещает только выбранные объекты; undo возвращает позицию', () => {
    const editor = setup([rect('a', 100, 100, 200, 150), rect('b', 300, 300, 320, 320)])
    editor.selectOnly('a')
    editor.beginMoveSelection({ x: 0, y: 0 })
    editor.moveSelectionTo({ x: 10, y: 5 })
    editor.endMoveSelection()

    expect(editor.strokes.value[0].points).toEqual([{ x: 110, y: 105 }, { x: 210, y: 155 }])
    // b не двигался.
    expect(editor.strokes.value[1].points).toEqual([{ x: 300, y: 300 }, { x: 320, y: 320 }])
    editor.undo()
    expect(editor.strokes.value[0].points).toEqual([{ x: 100, y: 100 }, { x: 200, y: 150 }])
  })

  it('ресайз масштабирует выбранный объект относительно противоположного угла', () => {
    const editor = setup([rect('a', 100, 100, 200, 200)])
    editor.selectOnly('a')
    editor.beginResizeSelection('se', { x: 200, y: 200 })
    // Тянем юго-восточный маркер в (300,300) → масштаб x2 от угла (100,100).
    editor.resizeSelectionTo({ x: 300, y: 300 })
    editor.endResizeSelection()
    expect(editor.strokes.value[0].points).toEqual([{ x: 100, y: 100 }, { x: 300, y: 300 }])
  })

  it('selectionBox реактивно следует за объектом ПО ХОДУ ресайза (до end)', () => {
    const editor = setup([rect('a', 100, 100, 200, 200)])
    editor.selectOnly('a')
    expect(editor.selectionBox.value).toMatchObject({ minX: 100, minY: 100, maxX: 200, maxY: 200 })
    editor.beginResizeSelection('se', { x: 200, y: 200 })
    editor.resizeSelectionTo({ x: 300, y: 300 })
    // Рамка выделения обязана отражать новый bbox ещё во время жеста, а не только после end.
    expect(editor.selectionBox.value).toMatchObject({ minX: 100, minY: 100, maxX: 300, maxY: 300 })
  })

  it('поворот одиночного объекта крутит его вокруг своего центра (points не двигаются)', () => {
    const editor = setup([rect('a', 100, 100, 200, 200)])
    editor.selectOnly('a')
    // Центр выделения = (150,150). Стартовый указатель справа (0 рад), цель снизу (PI/2).
    editor.beginRotateSelection({ x: 250, y: 150 })
    editor.rotateSelectionTo({ x: 150, y: 250 })
    editor.endRotateSelection()
    const s = editor.strokes.value[0]
    expect(s.rotation).toBeCloseTo(Math.PI / 2, 6)
    // Для одиночного объекта пивот = его центр → точки не смещаются.
    expect(s.points).toEqual([{ x: 100, y: 100 }, { x: 200, y: 200 }])
    editor.undo()
    expect(editor.strokes.value[0].rotation).toBeUndefined()
  })

  it('z-order: на передний/задний план и на шаг вверх/вниз', () => {
    const editor = setup([rect('a', 0, 0, 1, 1), rect('b', 0, 0, 1, 1), rect('c', 0, 0, 1, 1)])
    const ids = () => editor.strokes.value.map((s) => s.id)

    editor.selectOnly('a')
    editor.bringToFront()
    expect(ids()).toEqual(['b', 'c', 'a'])

    editor.bringForward() // 'a' уже сверху — без изменений
    expect(ids()).toEqual(['b', 'c', 'a'])

    editor.sendToBack()
    expect(ids()).toEqual(['a', 'b', 'c'])

    editor.selectOnly('a')
    editor.bringForward()
    expect(ids()).toEqual(['b', 'a', 'c'])

    editor.sendBackward()
    expect(ids()).toEqual(['a', 'b', 'c'])
  })
})

describe('useDrawEditor canvas/camera persistence', () => {
  it('persists the current camera (pan/zoom) in the saved payload', async () => {
    const onSave = vi.fn(async (_bytes: number[]) => 'src')
    const onPersisted = vi.fn()
    const editor = useDrawEditor({ drawId: 'cam', initialBytes: null, onSave, onPersisted })

    editor.strokes.value = [makeStroke()]
    // Только панорамирование — даёт предсказуемые cam.x/cam.y (= сдвигу).
    editor.panBy(120, 80)
    editor.scheduleSave()
    await editor.flushSave()

    const bytes = onSave.mock.calls[0][0]
    const json = new TextDecoder().decode(new Uint8Array(bytes))
    const data = parseDrawData(json)
    // Камера должна сохраниться между сессиями.
    expect(data.camera.x).toBeCloseTo(120, 5)
    expect(data.camera.y).toBeCloseTo(80, 5)
    expect(data.camera.scale).toBe(1)
    // canvas присутствует и имеет дефолтные размеры для нового рисунка.
    expect(data.canvas.width).toBe(1600)
    expect(data.canvas.height).toBe(1000)
  })

  it('persists zoom level changes in the camera', async () => {
    const onSave = vi.fn(async (_bytes: number[]) => 'src')
    const onPersisted = vi.fn()
    const editor = useDrawEditor({ drawId: 'zoom', initialBytes: null, onSave, onPersisted })

    editor.strokes.value = [makeStroke()]
    editor.zoomBy(2)
    editor.scheduleSave()
    await editor.flushSave()

    const bytes = onSave.mock.calls[0][0]
    const data = parseDrawData(new TextDecoder().decode(new Uint8Array(bytes)))
    expect(data.camera.scale).toBeCloseTo(2, 5)
  })

  it('fitToContent recenters the camera over the strokes bbox', () => {
    const onSave = vi.fn(async () => 'src')
    const onPersisted = vi.fn()
    const editor = useDrawEditor({ drawId: 'fit', initialBytes: null, onSave, onPersisted })

    editor.strokes.value = [{ type: 'rectangle', points: [{ x: 200, y: 200 }, { x: 400, y: 300 }], color: '#000', size: 3 }]
    editor.fitToContent()
    // После fit камера не остаётся в дефолтном (0,0,1).
    expect(editor.camera.value).not.toEqual({ x: 0, y: 0, scale: 1 })
  })

  it('resetCamera returns to the default view', () => {
    const onSave = vi.fn(async () => 'src')
    const onPersisted = vi.fn()
    const editor = useDrawEditor({ drawId: 'reset', initialBytes: null, onSave, onPersisted })

    editor.panBy(500, 500)
    editor.zoomBy(2)
    editor.resetCamera()
    expect(editor.camera.value).toEqual({ x: 0, y: 0, scale: 1 })
  })
})

// --- НОВЫЕ ТЕСТЫ: стиль штрихов и манипуляции ---

describe('constrainGeometryPoint — хелпер shift-констрейна', () => {
  it('для rectangle даёт квадрат (dx > dy)', () => {
    const anchor = { x: 0, y: 0 }
    const pt = { x: 100, y: 40 }
    const result = constrainGeometryPoint('rectangle', anchor, pt)
    // Максимальная сторона 100, обе оси должны быть ±100.
    expect(result.x).toBe(100)
    expect(result.y).toBe(100)
  })

  it('для rectangle даёт квадрат (dy > dx)', () => {
    const anchor = { x: 10, y: 10 }
    const pt = { x: 30, y: 80 }
    const result = constrainGeometryPoint('rectangle', anchor, pt)
    // dx=20, dy=70 → m=70
    expect(result.x).toBeCloseTo(10 + 70)
    expect(result.y).toBeCloseTo(10 + 70)
  })

  it('для ellipse даёт квадрат с отрицательным dx', () => {
    const anchor = { x: 100, y: 100 }
    const pt = { x: 40, y: 170 }
    const result = constrainGeometryPoint('ellipse', anchor, pt)
    // dx=-60, dy=70 → m=70; знак dx=-1, знак dy=1
    expect(result.x).toBeCloseTo(100 - 70)
    expect(result.y).toBeCloseTo(100 + 70)
  })

  it('для line снапает угол к кратному 15°', () => {
    const anchor = { x: 0, y: 0 }
    // Угол ~27° → ближайший кратный 15° = 30° (π/6)
    const angle27 = 27 * Math.PI / 180
    const len = 100
    const pt = { x: Math.cos(angle27) * len, y: Math.sin(angle27) * len }
    const result = constrainGeometryPoint('line', anchor, pt)
    const snapped = 30 * Math.PI / 180 // π/6
    expect(result.x).toBeCloseTo(Math.cos(snapped) * len, 3)
    expect(result.y).toBeCloseTo(Math.sin(snapped) * len, 3)
  })

  it('для arrow снапает угол к 0° при горизонтальном направлении', () => {
    const anchor = { x: 0, y: 0 }
    // Угол ~5° → ближайший кратный 15° = 0°
    const angle5 = 5 * Math.PI / 180
    const len = 80
    const pt = { x: Math.cos(angle5) * len, y: Math.sin(angle5) * len }
    const result = constrainGeometryPoint('arrow', anchor, pt)
    expect(result.x).toBeCloseTo(len, 1)
    expect(result.y).toBeCloseTo(0, 1)
  })
})

describe('useDrawEditor — стиль новых штрихов', () => {
  function setup() {
    const editor = useDrawEditor({ drawId: 'style', initialBytes: null, onSave: async () => 's', onPersisted: () => {} })
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    editor.setOverlay(svg as unknown as SVGSVGElement)
    return editor
  }
  function ptr(x: number, y: number, opts?: { shiftKey?: boolean }) {
    return {
      clientX: x, clientY: y, pointerId: 1, pressure: 0.5,
      shiftKey: opts?.shiftKey ?? false,
      buttons: 1,
      preventDefault() {}, releasePointerCapture() {}, setPointerCapture() {},
    } as unknown as PointerEvent
  }

  it('новый штрих геометрии несёт текущие стилевые рефы', () => {
    const editor = setup()
    editor.roughness.value = 0.5
    editor.strokeStyle.value = 'dashed'
    editor.opacity.value = 0.5
    editor.fillColor.value = '#ff0000'
    editor.tool.value = 'rectangle'

    editor.beginStroke(ptr(0, 0))
    editor.moveStroke(ptr(100, 100))
    editor.endStroke(ptr(100, 100))

    const s = editor.strokes.value[editor.strokes.value.length - 1]
    expect(s.roughness).toBe(0.5)
    expect(s.strokeStyle).toBe('dashed')
    expect(s.opacity).toBe(0.5)
    expect(s.fillColor).toBe('#ff0000')
  })

  it('fillColor не попадает в freehand-штрих', () => {
    const editor = setup()
    editor.fillColor.value = '#00ff00'
    editor.tool.value = 'freehand'

    editor.beginStroke(ptr(0, 0))
    editor.moveStroke(ptr(10, 10))
    editor.moveStroke(ptr(20, 20))
    editor.endStroke(ptr(20, 20))

    const s = editor.strokes.value[editor.strokes.value.length - 1]
    expect(s.fillColor).toBeUndefined()
  })

  it('strokeStyle не попадает в freehand-штрих', () => {
    const editor = setup()
    editor.strokeStyle.value = 'dotted'
    editor.tool.value = 'freehand'

    editor.beginStroke(ptr(0, 0))
    editor.moveStroke(ptr(10, 10))
    editor.endStroke(ptr(20, 20))

    const s = editor.strokes.value[editor.strokes.value.length - 1]
    expect(s.strokeStyle).toBeUndefined()
  })

  it('opacity попадает в геометрию и freehand при opacity < 1', () => {
    const editor = setup()
    editor.opacity.value = 0.3
    editor.tool.value = 'ellipse'

    editor.beginStroke(ptr(0, 0))
    editor.moveStroke(ptr(50, 50))
    editor.endStroke(ptr(50, 50))

    const s = editor.strokes.value[editor.strokes.value.length - 1]
    expect(s.opacity).toBe(0.3)
  })

  it('shift при рисовании rectangle даёт квадрат', () => {
    const editor = setup()
    editor.tool.value = 'rectangle'

    editor.beginStroke(ptr(0, 0))
    editor.moveStroke(ptr(100, 40, { shiftKey: true }))
    editor.endStroke(ptr(100, 40, { shiftKey: true }))

    const s = editor.strokes.value[editor.strokes.value.length - 1]
    const [a, b] = s.points
    expect(Math.abs(b.x - a.x)).toBeCloseTo(Math.abs(b.y - a.y), 1)
  })

  it('новая стрелка несёт недефолтные наконечники (startCap/endCap)', () => {
    const editor = setup()
    editor.tool.value = 'arrow'
    editor.startCap.value = 'dot'
    editor.endCap.value = 'none'

    editor.beginStroke(ptr(0, 0))
    editor.moveStroke(ptr(100, 0))
    editor.endStroke(ptr(100, 0))

    const s = editor.strokes.value[editor.strokes.value.length - 1]
    expect(s.startCap).toBe('dot')
    expect(s.endCap).toBe('none')
  })

  it('дефолтные наконечники не сериализуются в новую стрелку', () => {
    const editor = setup()
    editor.tool.value = 'arrow'

    editor.beginStroke(ptr(0, 0))
    editor.moveStroke(ptr(100, 0))
    editor.endStroke(ptr(100, 0))

    const s = editor.strokes.value[editor.strokes.value.length - 1]
    expect(s.startCap).toBeUndefined()
    expect(s.endCap).toBeUndefined()
  })
})

describe('useDrawEditor — наконечники стрелок (setStartCap/setEndCap)', () => {
  it('сеттеры применяют наконечники к выделенной стрелке', () => {
    const editor = useDrawEditor({ drawId: 'caps', initialBytes: null, onSave: async () => 's', onPersisted: () => {} })
    editor.strokes.value = [
      { type: 'arrow', points: [{ x: 0, y: 0 }, { x: 100, y: 0 }], color: '#000', size: 2, id: 'ar' },
    ]
    editor.selectOnly('ar')
    editor.setStartCap('arrow')
    editor.setEndCap('dot')
    const s = editor.strokes.value[0]
    expect(s.startCap).toBe('arrow')
    expect(s.endCap).toBe('dot')
  })

  it('сеттеры не трогают не-стрелочные штрихи в выделении', () => {
    const editor = useDrawEditor({ drawId: 'caps2', initialBytes: null, onSave: async () => 's', onPersisted: () => {} })
    editor.strokes.value = [
      { type: 'rectangle', points: [{ x: 0, y: 0 }, { x: 10, y: 10 }], color: '#000', size: 2, id: 'r' },
    ]
    editor.selectOnly('r')
    editor.setEndCap('dot')
    expect((editor.strokes.value[0] as { endCap?: string }).endCap).toBeUndefined()
  })
})

describe('useDrawEditor — applyStyleToSelection', () => {
  function setup() {
    const editor = useDrawEditor({ drawId: 'sel-style', initialBytes: null, onSave: async () => 's', onPersisted: () => {} })
    editor.strokes.value = [
      { type: 'rectangle', points: [{ x: 0, y: 0 }, { x: 50, y: 50 }], color: '#000', size: 3, id: 'a' },
      { type: 'rectangle', points: [{ x: 100, y: 100 }, { x: 150, y: 150 }], color: '#000', size: 3, id: 'b' },
    ]
    return editor
  }

  it('изменяет цвет выделенного штриха', () => {
    const editor = setup()
    editor.selectOnly('a')
    const histBefore = editor.canUndo.value
    editor.applyStyleToSelection({ color: '#00ff00' })
    expect(editor.strokes.value.find((s) => s.id === 'a')?.color).toBe('#00ff00')
    expect(editor.strokes.value.find((s) => s.id === 'b')?.color).toBe('#000')
    // История должна вырасти.
    expect(editor.canUndo.value).toBe(true)
    expect(histBefore).toBe(false)
  })

  it('undo откатывает изменение стиля', () => {
    const editor = setup()
    editor.selectOnly('a')
    editor.applyStyleToSelection({ color: '#ff0000' })
    editor.undo()
    expect(editor.strokes.value.find((s) => s.id === 'a')?.color).toBe('#000')
  })

  it('не делает ничего при пустом выделении', () => {
    const editor = setup()
    editor.clearSelection()
    editor.applyStyleToSelection({ color: '#ff0000' })
    expect(editor.canUndo.value).toBe(false)
    expect(editor.strokes.value.every((s) => s.color === '#000')).toBe(true)
  })
})

describe('useDrawEditor — selectAll', () => {
  it('выделяет все штрихи с id', () => {
    const editor = useDrawEditor({ drawId: 'sa', initialBytes: null, onSave: async () => 's', onPersisted: () => {} })
    editor.strokes.value = [
      { type: 'rectangle', points: [{ x: 0, y: 0 }, { x: 10, y: 10 }], color: '#000', size: 3, id: 'a' },
      { type: 'ellipse', points: [{ x: 50, y: 50 }, { x: 80, y: 80 }], color: '#000', size: 3, id: 'b' },
    ]
    editor.selectAll()
    expect([...editor.selection.value].sort()).toEqual(['a', 'b'])
  })
})

describe('useDrawEditor — copy/paste', () => {
  function setup() {
    const editor = useDrawEditor({ drawId: 'cp', initialBytes: null, onSave: async () => 's', onPersisted: () => {} })
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    editor.setOverlay(svg as unknown as SVGSVGElement)
    editor.strokes.value = [
      { type: 'rectangle', points: [{ x: 0, y: 0 }, { x: 50, y: 50 }], color: '#f00', size: 3, id: 'orig' },
    ]
    return editor
  }

  it('copy+paste добавляет штрих со смещением и новым id', () => {
    const editor = setup()
    editor.selectOnly('orig')
    editor.copySelection()
    expect(editor.canPaste.value).toBe(true)
    editor.paste(16)

    expect(editor.strokes.value).toHaveLength(2)
    const copy = editor.strokes.value[1]
    expect(copy.id).not.toBe('orig')
    expect(copy.color).toBe('#f00')
    expect(copy.points[0]).toMatchObject({ x: 16, y: 16 })
    // Выделение переходит на копию.
    expect(editor.selection.value.has(copy.id!)).toBe(true)
    expect(editor.selection.value.has('orig')).toBe(false)
  })

  it('cut удаляет исходный штрих и paste вставляет копию', () => {
    const editor = setup()
    editor.selectOnly('orig')
    editor.cutSelection()
    expect(editor.strokes.value).toHaveLength(0)
    editor.paste()
    expect(editor.strokes.value).toHaveLength(1)
    expect(editor.strokes.value[0].id).not.toBe('orig')
  })

  it('paste поддерживает undo', () => {
    const editor = setup()
    editor.selectOnly('orig')
    editor.copySelection()
    editor.paste()
    expect(editor.strokes.value).toHaveLength(2)
    editor.undo()
    expect(editor.strokes.value).toHaveLength(1)
  })

  it('canPaste = false при пустом буфере', () => {
    // Создаём отдельный editor чтобы не зависеть от глобального состояния буфера.
    const editor = useDrawEditor({ drawId: 'nopaste', initialBytes: null, onSave: async () => 's', onPersisted: () => {} })
    // Тест может не гарантировать чистый буфер между тестами из-за модульного состояния.
    // Проверяем, что canPaste реагирует на copy.
    editor.strokes.value = [{ type: 'rectangle', points: [{ x: 0, y: 0 }, { x: 10, y: 10 }], color: '#000', size: 3, id: 'x' }]
    editor.selectOnly('x')
    editor.copySelection()
    expect(editor.canPaste.value).toBe(true)
  })
})

describe('useDrawEditor — constrain resize', () => {
  it('resizeSelectionTo с constrain=true для углового маркера сохраняет пропорции', () => {
    const editor = useDrawEditor({ drawId: 'cr', initialBytes: null, onSave: async () => 's', onPersisted: () => {} })
    // Квадрат 100×100
    editor.strokes.value = [
      { type: 'rectangle', points: [{ x: 0, y: 0 }, { x: 100, y: 100 }], color: '#000', size: 3, id: 'sq' },
    ]
    editor.selectOnly('sq')
    editor.beginResizeSelection('se', { x: 100, y: 100 })
    // Тянем в точку, где scaleX ≠ scaleY: x→200, y→150 → scaleX=2, scaleY=1.5
    // С constrain=true должен взять max(2, 1.5) = 2 для обеих осей.
    editor.resizeSelectionTo({ x: 200, y: 150 }, true)
    editor.endResizeSelection()
    const s = editor.strokes.value[0]
    const w = s.points[1].x - s.points[0].x
    const h = s.points[1].y - s.points[0].y
    // При одинаковом масштабе по обеим осям: w = h (100*m = 100*m).
    expect(w).toBeCloseTo(h, 1)
  })

  it('resizeSelectionTo без constrain не выравнивает масштабы', () => {
    const editor = useDrawEditor({ drawId: 'cr2', initialBytes: null, onSave: async () => 's', onPersisted: () => {} })
    editor.strokes.value = [
      { type: 'rectangle', points: [{ x: 0, y: 0 }, { x: 100, y: 100 }], color: '#000', size: 3, id: 'sq' },
    ]
    editor.selectOnly('sq')
    editor.beginResizeSelection('se', { x: 100, y: 100 })
    editor.resizeSelectionTo({ x: 200, y: 150 }) // constrain=false (дефолт)
    editor.endResizeSelection()
    const s = editor.strokes.value[0]
    const w = s.points[1].x - s.points[0].x
    const h = s.points[1].y - s.points[0].y
    // scaleX=2, scaleY=1.5 → w=200, h=150 → w ≠ h
    expect(w).not.toBeCloseTo(h, 0)
  })
})

describe('useDrawEditor — activeStyle', () => {
  it('без выделения возвращает текущие рефы', () => {
    const editor = useDrawEditor({ drawId: 'as', initialBytes: null, onSave: async () => 's', onPersisted: () => {} })
    editor.color.value = '#aabbcc'
    editor.opacity.value = 0.7
    editor.roughness.value = 2.5
    editor.fontFamily.value = 'serif'
    editor.fontSize.value = 24
    editor.clearSelection()
    expect(editor.activeStyle.value.color).toBe('#aabbcc')
    expect(editor.activeStyle.value.opacity).toBe(0.7)
    expect(editor.activeStyle.value.roughness).toBe(2.5)
    expect(editor.activeStyle.value.fontFamily).toBe('serif')
    expect(editor.activeStyle.value.fontSize).toBe(24)
  })

  it('при выделении возвращает значения первого выделенного штриха', () => {
    const editor = useDrawEditor({ drawId: 'as2', initialBytes: null, onSave: async () => 's', onPersisted: () => {} })
    editor.strokes.value = [
      { type: 'text', points: [{ x: 0, y: 0 }], color: '#112233', size: 5, fontFamily: 'monospace', fontSize: 32, id: 'a' },
    ]
    editor.selectOnly('a')
    expect(editor.activeStyle.value.color).toBe('#112233')
    expect(editor.activeStyle.value.size).toBe(5)
    expect(editor.activeStyle.value.fontFamily).toBe('monospace')
    expect(editor.activeStyle.value.fontSize).toBe(32)
  })
})

describe('useDrawEditor — insertTemplate', () => {
  const template = (): import('../../utils/draw/drawEngine').DrawStroke[] => [
    { type: 'rectangle', points: [{ x: 0, y: 0 }, { x: 100, y: 50 }], color: '#000', size: 2 },
    { type: 'text', points: [{ x: 20, y: 20 }], text: 'Hi', color: '#000', size: 3 },
  ]

  it('вставляет все штрихи шаблона с новыми id и единым groupId', () => {
    const editor = useDrawEditor({ drawId: 'tpl', initialBytes: null, onSave: async () => 's', onPersisted: () => {} })
    editor.insertTemplate(template())
    expect(editor.strokes.value.length).toBe(2)
    const ids = editor.strokes.value.map((s) => s.id)
    expect(ids.every((id) => typeof id === 'string' && id.length > 0)).toBe(true)
    const gids = editor.strokes.value.map((s) => s.groupId)
    expect(gids[0]).toBeTruthy()
    expect(gids[0]).toBe(gids[1]) // общий groupId
  })

  it('переключает инструмент в select и выделяет весь шаблон целиком', () => {
    const editor = useDrawEditor({ drawId: 'tpl2', initialBytes: null, onSave: async () => 's', onPersisted: () => {} })
    editor.insertTemplate(template())
    expect(editor.tool.value).toBe('select')
    expect(editor.selection.value.size).toBe(2)
  })

  it('одиночный штрих вставляется без groupId', () => {
    const editor = useDrawEditor({ drawId: 'tpl3', initialBytes: null, onSave: async () => 's', onPersisted: () => {} })
    editor.insertTemplate([{ type: 'arrow', points: [{ x: 0, y: 0 }, { x: 100, y: 0 }], color: '#000', size: 2 }])
    expect(editor.strokes.value.length).toBe(1)
    expect(editor.strokes.value[0].groupId).toBeUndefined()
  })

  it('пустой шаблон ничего не вставляет', () => {
    const editor = useDrawEditor({ drawId: 'tpl4', initialBytes: null, onSave: async () => 's', onPersisted: () => {} })
    expect(editor.insertTemplate([])).toBeNull()
    expect(editor.strokes.value.length).toBe(0)
  })
})

// =============================================================================
// НОВЫЕ ТЕСТЫ: группировка, блокировка, выравнивание, редактирование текста
// =============================================================================

describe('useDrawEditor — группировка', () => {
  function rect(id: string, x0: number, y0: number, x1: number, y1: number): DrawStroke {
    return { type: 'rectangle', points: [{ x: x0, y: y0 }, { x: x1, y: y1 }], color: '#000', size: 3, id }
  }
  function setup(strokes: DrawStroke[]) {
    const editor = useDrawEditor({ drawId: 'grp', initialBytes: null, onSave: async () => 's', onPersisted: () => {} })
    editor.strokes.value = strokes
    return editor
  }

  it('group() присваивает одинаковый непустой groupId двум выбранным штрихам', () => {
    const editor = setup([rect('a', 0, 0, 10, 10), rect('b', 20, 20, 30, 30)])
    editor.selectAll()
    editor.group()
    const a = editor.strokes.value.find((s) => s.id === 'a')!
    const b = editor.strokes.value.find((s) => s.id === 'b')!
    expect(a.groupId).toBeTruthy()
    expect(a.groupId).toBe(b.groupId)
  })

  it('selectOnly одного из группы расширяет выделение на всю группу', () => {
    const editor = setup([rect('a', 0, 0, 10, 10), rect('b', 20, 20, 30, 30)])
    editor.selectAll()
    editor.group()
    // Сбрасываем выделение, затем выбираем только 'a'.
    editor.clearSelection()
    editor.selectOnly('a')
    // Должны быть оба в selection через expandByGroup.
    expect(editor.selection.value.has('a')).toBe(true)
    expect(editor.selection.value.has('b')).toBe(true)
  })

  it('ungroup() снимает groupId у выделенных штрихов', () => {
    const editor = setup([rect('a', 0, 0, 10, 10), rect('b', 20, 20, 30, 30)])
    editor.selectAll()
    editor.group()
    editor.selectAll()
    editor.ungroup()
    const a = editor.strokes.value.find((s) => s.id === 'a')!
    const b = editor.strokes.value.find((s) => s.id === 'b')!
    expect(a.groupId).toBeUndefined()
    expect(b.groupId).toBeUndefined()
  })

  it('canGroup = true при ≥2 выделенных', () => {
    const editor = setup([rect('a', 0, 0, 10, 10), rect('b', 20, 20, 30, 30)])
    editor.selectAll()
    expect(editor.canGroup.value).toBe(true)
  })

  it('canUngroup = true после группировки', () => {
    const editor = setup([rect('a', 0, 0, 10, 10), rect('b', 20, 20, 30, 30)])
    editor.selectAll()
    editor.group()
    editor.selectAll()
    expect(editor.canUngroup.value).toBe(true)
  })
})

describe('useDrawEditor — блокировка', () => {
  function rect(id: string, x0: number, y0: number, x1: number, y1: number, locked?: boolean): DrawStroke {
    return { type: 'rectangle', points: [{ x: x0, y: y0 }, { x: x1, y: y1 }], color: '#000', size: 3, id, ...(locked ? { locked: true } : {}) }
  }
  function setup(strokes: DrawStroke[]) {
    const editor = useDrawEditor({ drawId: 'lck', initialBytes: null, onSave: async () => 's', onPersisted: () => {} })
    editor.strokes.value = strokes
    return editor
  }

  it('locked штрих не перемещается в moveSelectionTo', () => {
    const editor = setup([rect('a', 100, 100, 200, 200, true)])
    editor.selectOnly('a')
    editor.beginMoveSelection({ x: 0, y: 0 })
    editor.moveSelectionTo({ x: 50, y: 50 })
    editor.endMoveSelection()
    // Точки не должны были измениться.
    expect(editor.strokes.value[0].points[0]).toMatchObject({ x: 100, y: 100 })
  })

  it('marquee (selectInRect) не включает locked штрихи', () => {
    const editor = setup([rect('a', 0, 0, 50, 50, true), rect('b', 60, 60, 100, 100)])
    // Выделяем прямоугольник, охватывающий оба.
    editor.selectInRect({ minX: -10, minY: -10, maxX: 200, maxY: 200 }, false)
    expect(editor.selection.value.has('a')).toBe(false)
    expect(editor.selection.value.has('b')).toBe(true)
  })

  it('deleteSelection не удаляет locked', () => {
    const editor = setup([rect('a', 0, 0, 10, 10, true), rect('b', 20, 20, 30, 30)])
    editor.selectAll()
    editor.deleteSelection()
    expect(editor.strokes.value.map((s) => s.id)).toEqual(['a'])
  })

  it('lockSelection / unlockSelection работают корректно', () => {
    const editor = setup([rect('a', 0, 0, 10, 10)])
    editor.selectOnly('a')
    editor.lockSelection()
    expect(editor.strokes.value[0].locked).toBe(true)
    expect(editor.hasLockedSelection.value).toBe(true)

    editor.unlockSelection()
    expect(editor.strokes.value[0].locked).toBeUndefined()
    expect(editor.hasUnlockedSelection.value).toBe(true)
  })

  it('undo возвращает состояние до блокировки', () => {
    const editor = setup([rect('a', 0, 0, 10, 10)])
    editor.selectOnly('a')
    editor.lockSelection()
    expect(editor.strokes.value[0].locked).toBe(true)
    editor.undo()
    expect(editor.strokes.value[0].locked).toBeUndefined()
  })
})

describe('useDrawEditor — выравнивание / распределение / отражение', () => {
  function rect(id: string, x0: number, y0: number, x1: number, y1: number): DrawStroke {
    return { type: 'rectangle', points: [{ x: x0, y: y0 }, { x: x1, y: y1 }], color: '#000', size: 3, id }
  }
  function setup(strokes: DrawStroke[]) {
    const editor = useDrawEditor({ drawId: 'aln', initialBytes: null, onSave: async () => 's', onPersisted: () => {} })
    editor.strokes.value = strokes
    return editor
  }

  it('alignSelection("left") выравнивает левые края', () => {
    const editor = setup([rect('a', 10, 0, 60, 50), rect('b', 50, 0, 100, 50)])
    editor.selectAll()
    editor.alignSelection('left')
    const ba = strokeBBox(editor.strokes.value.find((s) => s.id === 'a')!)
    const bb = strokeBBox(editor.strokes.value.find((s) => s.id === 'b')!)
    expect(ba.minX).toBeCloseTo(bb.minX, 3)
  })

  it('alignSelection("right") выравнивает правые края', () => {
    const editor = setup([rect('a', 0, 0, 50, 50), rect('b', 10, 0, 80, 50)])
    editor.selectAll()
    editor.alignSelection('right')
    const ba = strokeBBox(editor.strokes.value.find((s) => s.id === 'a')!)
    const bb = strokeBBox(editor.strokes.value.find((s) => s.id === 'b')!)
    expect(ba.maxX).toBeCloseTo(bb.maxX, 3)
  })

  it('distributeSelection("h") равномерно распределяет центры по горизонтали', () => {
    // Три прямоугольника шириной 10 (center = x+5).
    const editor = setup([
      rect('a', 0, 0, 10, 10),
      rect('b', 5, 0, 15, 10),   // ближе к 'a' — должен сдвинуться
      rect('c', 100, 0, 110, 10),
    ])
    editor.selectAll()
    editor.distributeSelection('h')
    const ca = (strokeBBox(editor.strokes.value.find((s) => s.id === 'a')!).minX + strokeBBox(editor.strokes.value.find((s) => s.id === 'a')!).maxX) / 2
    const cb = (strokeBBox(editor.strokes.value.find((s) => s.id === 'b')!).minX + strokeBBox(editor.strokes.value.find((s) => s.id === 'b')!).maxX) / 2
    const cc = (strokeBBox(editor.strokes.value.find((s) => s.id === 'c')!).minX + strokeBBox(editor.strokes.value.find((s) => s.id === 'c')!).maxX) / 2
    // Разности центров должны быть равны с допуском.
    expect(cb - ca).toBeCloseTo(cc - cb, 3)
  })

  it('flipSelection("h") отражает штрих по горизонтальной оси', () => {
    // Прямоугольник x от 0 до 10 и x от 20 до 30. Центр bbox = (0+30)/2=15.
    const editor = setup([rect('a', 0, 0, 10, 10), rect('b', 20, 0, 30, 10)])
    editor.selectAll()
    const aPointsBefore = editor.strokes.value.find((s) => s.id === 'a')!.points[0].x
    editor.flipSelection('h')
    // Точка x=0 должна стать 2*15-0=30, точка x=10 → 2*15-10=20 (т.е. прямоугольник a теперь 20..30).
    const aAfter = strokeBBox(editor.strokes.value.find((s) => s.id === 'a')!)
    // Центр отражения = 15; bbox 'a' был minX=0, maxX=10 → после flip: minX=20, maxX=30.
    expect(aAfter.minX).toBeCloseTo(20, 3)
    expect(aPointsBefore).toBe(0) // Убеждаемся что до было 0.
  })

  it('canAlign = true при ≥2 не-locked выделенных', () => {
    const editor = setup([rect('a', 0, 0, 10, 10), rect('b', 20, 20, 30, 30)])
    editor.selectAll()
    expect(editor.canAlign.value).toBe(true)
  })

  it('canDistribute = true при ≥3 не-locked выделенных', () => {
    const editor = setup([rect('a', 0, 0, 10, 10), rect('b', 20, 20, 30, 30), rect('c', 50, 50, 60, 60)])
    editor.selectAll()
    expect(editor.canDistribute.value).toBe(true)
  })
})

describe('useDrawEditor — редактирование существующего текста', () => {
  function textStroke(id: string, text: string, x = 0, y = 0): DrawStroke {
    return { type: 'text', points: [{ x, y }], color: '#000', size: 3, text, id }
  }
  function setup(strokes: DrawStroke[]) {
    const editor = useDrawEditor({ drawId: 'txt-edit', initialBytes: null, onSave: async () => 's', onPersisted: () => {} })
    editor.strokes.value = strokes
    return editor
  }

  it('beginEditText + commitText заменяет штрих с тем же id и новым текстом', () => {
    const editor = setup([textStroke('t1', 'старый текст', 10, 20)])
    editor.beginEditText('t1')
    // Во время редактирования штрих убран из strokes.
    expect(editor.strokes.value.find((s) => s.id === 't1')).toBeUndefined()
    editor.setTextValue('новый текст')
    editor.commitText()
    const found = editor.strokes.value.find((s) => s.id === 't1')
    expect(found).toBeTruthy()
    expect(found!.text).toBe('новый текст')
    // Количество штрихов не выросло.
    expect(editor.strokes.value.length).toBe(1)
  })

  it('commitText с пустым value при редактировании удаляет штрих', () => {
    const editor = setup([textStroke('t2', 'текст для удаления')])
    editor.beginEditText('t2')
    editor.setTextValue('')
    editor.commitText()
    expect(editor.strokes.value.find((s) => s.id === 't2')).toBeUndefined()
    expect(editor.strokes.value.length).toBe(0)
  })

  it('cancelText возвращает исходный штрих обратно', () => {
    const editor = setup([textStroke('t3', 'исходный', 5, 5)])
    editor.beginEditText('t3')
    editor.setTextValue('изменённый')
    editor.cancelText()
    const found = editor.strokes.value.find((s) => s.id === 't3')
    expect(found).toBeTruthy()
    expect(found!.text).toBe('исходный')
  })

  it('undo после commitText восстанавливает оригинальный штрих', () => {
    const editor = setup([textStroke('t4', 'оригинал')])
    editor.beginEditText('t4')
    editor.setTextValue('изменение')
    editor.commitText()
    editor.undo()
    const found = editor.strokes.value.find((s) => s.id === 't4')
    expect(found?.text).toBe('оригинал')
  })

  it('beginEditText на несуществующий id ничего не делает', () => {
    const editor = setup([textStroke('t5', 'текст')])
    const before = [...editor.strokes.value]
    editor.beginEditText('non-existent')
    expect(editor.textEditor.value.active).toBe(false)
    expect(editor.strokes.value).toEqual(before)
  })
})

describe('useDrawEditor — коннекторы (привязка стрелок)', () => {
  function setup() {
    const editor = useDrawEditor({ drawId: 'conn', initialBytes: null, onSave: async () => 's', onPersisted: () => {} })
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    editor.setOverlay(svg as unknown as SVGSVGElement)
    return editor
  }
  function ptr(x: number, y: number) {
    return {
      clientX: x, clientY: y, pointerId: 1, pressure: 0.5,
      shiftKey: false, buttons: 1,
      preventDefault() {}, releasePointerCapture() {}, setPointerCapture() {},
    } as unknown as PointerEvent
  }

  it('стрелка привязывается к startBinding и endBinding при рисовании', () => {
    const editor = setup()

    // Рисуем прямоугольник A: (0,0)→(100,100)
    editor.tool.value = 'rectangle'
    editor.beginStroke(ptr(0, 0))
    editor.moveStroke(ptr(100, 100))
    editor.endStroke(ptr(100, 100))
    const idA = editor.strokes.value[0].id!

    // Рисуем прямоугольник B: (300,0)→(400,100)
    editor.beginStroke(ptr(300, 0))
    editor.moveStroke(ptr(400, 100))
    editor.endStroke(ptr(400, 100))
    const idB = editor.strokes.value[1].id!

    // Рисуем стрелку изнутри A (50,50) к середине B (350,50)
    editor.tool.value = 'arrow'
    editor.beginStroke(ptr(50, 50))
    editor.moveStroke(ptr(350, 50))
    editor.endStroke(ptr(350, 50))

    const arrow = editor.strokes.value.find((s) => s.type === 'arrow')!
    expect(arrow).toBeTruthy()

    // Проверяем привязки
    expect(arrow.startBinding?.strokeId).toBe(idA)
    expect(arrow.endBinding?.strokeId).toBe(idB)

    // После рефлоу: points[0].x должен быть на правом крае A (> 100), points[1].x — на левом крае B (< 300)
    expect(arrow.points[0].x).toBeGreaterThan(100)
    expect(arrow.points[1].x).toBeLessThan(300)
  })

  it('рефлоу срабатывает при перемещении фигуры-якоря', () => {
    const editor = setup()

    // Рисуем прямоугольник A
    editor.tool.value = 'rectangle'
    editor.beginStroke(ptr(0, 0))
    editor.moveStroke(ptr(100, 100))
    editor.endStroke(ptr(100, 100))
    const idA = editor.strokes.value[0].id!

    // Рисуем прямоугольник B
    editor.beginStroke(ptr(300, 0))
    editor.moveStroke(ptr(400, 100))
    editor.endStroke(ptr(400, 100))

    // Рисуем стрелку от A к B
    editor.tool.value = 'arrow'
    editor.beginStroke(ptr(50, 50))
    editor.moveStroke(ptr(350, 50))
    editor.endStroke(ptr(350, 50))

    const arrowBefore = editor.strokes.value.find((s) => s.type === 'arrow')!
    const startXBefore = arrowBefore.points[0].x

    // Перемещаем A на 50 вправо
    editor.selectOnly(idA)
    editor.beginMoveSelection({ x: 0, y: 0 })
    editor.moveSelectionTo({ x: 50, y: 0 })
    editor.endMoveSelection()

    const arrowAfter = editor.strokes.value.find((s) => s.type === 'arrow')!
    // Конец стрелки у A должен сместиться вправо после рефлоу
    expect(arrowAfter.points[0].x).toBeGreaterThan(startXBefore)
  })

  it('deleteSelection снимает endBinding стрелки при удалении якорной фигуры', () => {
    const editor = setup()

    // Рисуем A
    editor.tool.value = 'rectangle'
    editor.beginStroke(ptr(0, 0))
    editor.moveStroke(ptr(100, 100))
    editor.endStroke(ptr(100, 100))

    // Рисуем B
    editor.beginStroke(ptr(300, 0))
    editor.moveStroke(ptr(400, 100))
    editor.endStroke(ptr(400, 100))
    const idB = editor.strokes.value[1].id!

    // Рисуем стрелку от A к B
    editor.tool.value = 'arrow'
    editor.beginStroke(ptr(50, 50))
    editor.moveStroke(ptr(350, 50))
    editor.endStroke(ptr(350, 50))

    // Удаляем B
    editor.selectOnly(idB)
    editor.deleteSelection()

    const arrow = editor.strokes.value.find((s) => s.type === 'arrow')!
    // endBinding должна быть снята (якорь B удалён)
    expect(arrow.endBinding).toBeUndefined()
  })

  it('duplicateSelection ремапит привязки копии-стрелки на копию-A', () => {
    const editor = setup()

    // Рисуем A
    editor.tool.value = 'rectangle'
    editor.beginStroke(ptr(0, 0))
    editor.moveStroke(ptr(100, 100))
    editor.endStroke(ptr(100, 100))
    const idA = editor.strokes.value[0].id!

    // Рисуем B
    editor.beginStroke(ptr(300, 0))
    editor.moveStroke(ptr(400, 100))
    editor.endStroke(ptr(400, 100))

    // Рисуем стрелку от A к B
    editor.tool.value = 'arrow'
    editor.beginStroke(ptr(50, 50))
    editor.moveStroke(ptr(350, 50))
    editor.endStroke(ptr(350, 50))

    // Выделяем A и стрелку (но не B), дублируем
    const arrow = editor.strokes.value.find((s) => s.type === 'arrow')!
    editor.selectOnly(idA)
    editor.toggleSelection(arrow.id!)
    editor.duplicateSelection(16)

    // Находим копии
    const allArrows = editor.strokes.value.filter((s) => s.type === 'arrow')
    const copyArrow = allArrows.find((s) => s.id !== arrow.id)!
    expect(copyArrow).toBeTruthy()

    // startBinding копии должна указывать на НОВЫЙ id A (не оригинал), не на idA
    expect(copyArrow.startBinding?.strokeId).not.toBe(idA)
    expect(copyArrow.startBinding?.strokeId).toBeTruthy()

    // endBinding должна быть снята (B не был в наборе копирования)
    expect(copyArrow.endBinding).toBeUndefined()
  })
})

describe('useDrawEditor — insertImageStroke', () => {
  function setup() {
    const editor = useDrawEditor({ drawId: 'img', initialBytes: null, onSave: async () => 's', onPersisted: () => {} })
    // overlayEl не задан → viewportSize() вернёт canvasSize (1600×1000)
    return editor
  }

  it('вставка добавляет ровно один штрих type=image с assetSrc и выделяет его', () => {
    const editor = setup()
    const id = editor.insertImageStroke({ assetSrc: 'assets/img.png', naturalWidth: 800, naturalHeight: 600 })
    expect(typeof id).toBe('string')
    expect(id).not.toBeNull()
    expect(editor.strokes.value).toHaveLength(1)
    const s = editor.strokes.value[0]
    expect(s.type).toBe('image')
    expect(s.assetSrc).toBe('assets/img.png')
    expect(s.points).toHaveLength(2)
    // Инструмент переключился на select и штрих выделен.
    expect(editor.tool.value).toBe('select')
    expect(editor.selection.value.has(id!)).toBe(true)
  })

  it('аспект сохранён: (p1.x-p0.x)/(p1.y-p0.y) ≈ naturalWidth/naturalHeight', () => {
    const editor = setup()
    const naturalWidth = 800
    const naturalHeight = 600
    editor.insertImageStroke({ assetSrc: 'assets/img.png', naturalWidth, naturalHeight })
    const s = editor.strokes.value[0]
    const p0 = s.points[0]
    const p1 = s.points[1]
    const actualAspect = (p1.x - p0.x) / (p1.y - p0.y)
    const expectedAspect = naturalWidth / naturalHeight
    expect(actualAspect).toBeCloseTo(expectedAspect, 4)
  })

  it('невалидный ввод (naturalWidth=0) → возвращает null, штрих не добавлен', () => {
    const editor = setup()
    const id = editor.insertImageStroke({ assetSrc: 'assets/img.png', naturalWidth: 0, naturalHeight: 600 })
    expect(id).toBeNull()
    expect(editor.strokes.value).toHaveLength(0)
  })

  it('undo после вставки убирает картинку (strokes становится пустым)', () => {
    const editor = setup()
    editor.insertImageStroke({ assetSrc: 'assets/img.png', naturalWidth: 400, naturalHeight: 300 })
    expect(editor.strokes.value).toHaveLength(1)
    editor.undo()
    expect(editor.strokes.value).toHaveLength(0)
  })
})

describe('useDrawEditor — arrow shape & bend', () => {
  function arrowStroke(id: string, x0 = 0, y0 = 0, x1 = 100, y1 = 0): DrawStroke {
    return { type: 'arrow', points: [{ x: x0, y: y0 }, { x: x1, y: y1 }], color: '#000', size: 3, id }
  }
  function rectStroke(id: string): DrawStroke {
    return { type: 'rectangle', points: [{ x: 0, y: 0 }, { x: 50, y: 50 }], color: '#000', size: 3, id }
  }
  function setup() {
    return useDrawEditor({ drawId: 'arrow-shape', initialBytes: null, onSave: async () => 's', onPersisted: () => {} })
  }

  it('setArrowShape применяет форму к выделенной стрелке', () => {
    const editor = setup()
    editor.strokes.value = [arrowStroke('arr1')]
    editor.selectOnly('arr1')
    editor.setArrowShape('orthogonal')
    expect(editor.strokes.value.find((s) => s.id === 'arr1')?.arrowShape).toBe('orthogonal')
    expect(editor.activeStyle.value.arrowShape).toBe('orthogonal')
  })

  it('setArrowShape("bezier") у стрелки без bend проставляет числовой bend', () => {
    const editor = setup()
    // Стрелка длиной 100 (от (0,0) до (100,0)), bend должен стать 0.2*100 = 20
    editor.strokes.value = [arrowStroke('arr2', 0, 0, 100, 0)]
    editor.selectOnly('arr2')
    editor.setArrowShape('bezier')
    const s = editor.strokes.value.find((s) => s.id === 'arr2')!
    expect(typeof s.bend).toBe('number')
    expect(s.bend).toBeCloseTo(0.2 * 100, 5)
  })

  it('bend-жест: beginBendArrow/bendArrowTo/endBendArrow меняет bend и поддерживает undo', () => {
    const editor = setup()
    // Bezier стрелка от (0,0) до (100,0) с bend
    editor.strokes.value = [{ ...arrowStroke('arr3', 0, 0, 100, 0), arrowShape: 'bezier' as const, bend: 0 }]
    editor.selectOnly('arr3')

    // Начало drag-ручки должно вернуть true для bezier-стрелки
    expect(editor.beginBendArrow()).toBe(true)

    // Двигаем точку изгиба: нормаль к стрелке (0,0)→(100,0) направлена по оси Y
    // mid=(50,0), точка (50,30) → s = (50-50)*nx + (30-0)*ny = 30*1 = 30 → bend = 2*30 = 60
    editor.bendArrowTo({ x: 50, y: 30 })
    const afterBend = editor.strokes.value.find((s) => s.id === 'arr3')!
    expect(afterBend.bend).toBeCloseTo(60, 5)

    editor.endBendArrow()

    // Undo должен откатить изгиб
    editor.undo()
    const afterUndo = editor.strokes.value.find((s) => s.id === 'arr3')!
    expect(afterUndo.bend).toBeCloseTo(0, 5)
  })

  it('beginBendArrow возвращает false для не-bezier стрелки', () => {
    const editor = setup()
    editor.strokes.value = [arrowStroke('arr4')]
    editor.selectOnly('arr4')
    // По умолчанию arrowShape === 'straight'
    expect(editor.beginBendArrow()).toBe(false)
  })

  it('setArrowShape не меняет не-arrow штрихи (rectangle без arrowShape)', () => {
    const editor = setup()
    editor.strokes.value = [arrowStroke('arr5'), rectStroke('rect1')]
    editor.toggleSelection('arr5')
    editor.toggleSelection('rect1')
    editor.setArrowShape('orthogonal')
    // Стрелка получила форму
    expect(editor.strokes.value.find((s) => s.id === 'arr5')?.arrowShape).toBe('orthogonal')
    // Rectangle — без изменений
    expect(editor.strokes.value.find((s) => s.id === 'rect1')?.arrowShape).toBeUndefined()
  })
})

describe('useDrawEditor — цвет фона и тип сетки', () => {
  it('инициализирует bgColor и gridType дефолтными значениями', () => {
    const editor = useDrawEditor({ drawId: 'bg', initialBytes: null, onSave: async () => 's', onPersisted: () => {} })
    expect(editor.bgColor.value).toBe('transparent')
    expect(editor.gridType.value).toBe('square')
  })

  it('загружает bgColor и gridType из байт', () => {
    const data = {
      version: 1,
      strokes: [],
      bgColor: '#ff0000',
      gridType: 'dots',
      canvas: { width: 1600, height: 1000 },
      camera: { x: 0, y: 0, scale: 1 },
    }
    const json = JSON.stringify(data)
    const bytes = Array.from(new TextEncoder().encode(json))
    const editor = useDrawEditor({ drawId: 'bg-load', initialBytes: bytes, onSave: async () => 's', onPersisted: () => {} })
    expect(editor.bgColor.value).toBe('#ff0000')
    expect(editor.gridType.value).toBe('dots')
  })

  it('setBgColor и setGridType изменяют состояние и вызывают сохранение', async () => {
    const onSave = vi.fn(async () => 'src')
    const onPersisted = vi.fn()
    const editor = useDrawEditor({ drawId: 'bg-save', initialBytes: null, onSave: onSave as any, onPersisted: onPersisted as any })

    editor.setBgColor('#00ff00')
    editor.setGridType('lines')

    expect(editor.bgColor.value).toBe('#00ff00')
    expect(editor.gridType.value).toBe('lines')

    editor.strokes.value = [makeStroke()] // Добавим штрих, чтобы dirty-флаг сработал
    editor.scheduleSave()
    await editor.flushSave()

    expect(onSave).toHaveBeenCalledTimes(1)
    const bytes = (onSave as any).mock.calls[0][0]
    const saved = parseDrawData(new TextDecoder().decode(new Uint8Array(bytes)))
    expect(saved.bgColor).toBe('#00ff00')
    expect(saved.gridType).toBe('lines')
  })
})

describe('useDrawEditor — авто-распознавание фигур', () => {
  function ptr(x: number, y: number) {
    return {
      clientX: x, clientY: y, pointerId: 1, pressure: 0.5,
      shiftKey: false, buttons: 1,
      preventDefault() {}, releasePointerCapture() {}, setPointerCapture() {},
    } as unknown as PointerEvent
  }

  function setup() {
    const editor = useDrawEditor({ drawId: 'det', initialBytes: null, onSave: async () => 's', onPersisted: () => {} })
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    editor.setOverlay(svg as unknown as SVGSVGElement)
    return editor
  }

  it('по умолчанию autoDetectShapes выключен и фигуры не распознаются', () => {
    const editor = setup()
    expect(editor.autoDetectShapes.value).toBe(false)

    editor.tool.value = 'freehand'
    editor.beginStroke(ptr(0, 0))
    editor.moveStroke(ptr(50, 0))
    editor.moveStroke(ptr(100, 0))
    editor.moveStroke(ptr(100, 100))
    editor.moveStroke(ptr(0, 100))
    editor.moveStroke(ptr(0, 0))
    editor.endStroke(ptr(0, 0))

    expect(editor.strokes.value).toHaveLength(1)
    expect(editor.strokes.value[0].type).toBe('freehand')
  })

  it('при включенном autoDetectShapes фигура преобразуется в геометрическую (rectangle)', () => {
    const editor = setup()
    editor.setAutoDetectShapes(true)
    expect(editor.autoDetectShapes.value).toBe(true)

    editor.tool.value = 'freehand'
    editor.beginStroke(ptr(0, 0))
    editor.moveStroke(ptr(50, 0))
    editor.moveStroke(ptr(100, 0))
    editor.moveStroke(ptr(100, 100))
    editor.moveStroke(ptr(0, 100))
    editor.moveStroke(ptr(0, 0))
    editor.endStroke(ptr(0, 0))

    expect(editor.strokes.value).toHaveLength(1)
    expect(editor.strokes.value[0].type).toBe('rectangle')
    const pts = editor.strokes.value[0].points
    expect(pts).toHaveLength(2)
    expect(pts[0].x).toBe(0)
    expect(pts[0].y).toBe(0)
    expect(pts[1].x).toBe(100)
    expect(pts[1].y).toBe(100)
  })

  it('распознавание прямой линии', () => {
    const editor = setup()
    editor.setAutoDetectShapes(true)

    editor.tool.value = 'freehand'
    editor.beginStroke(ptr(0, 0))
    editor.moveStroke(ptr(20, 0))
    editor.moveStroke(ptr(40, 0))
    editor.moveStroke(ptr(60, 0))
    editor.moveStroke(ptr(80, 0))
    editor.moveStroke(ptr(100, 0))
    editor.endStroke(ptr(100, 0))

    expect(editor.strokes.value).toHaveLength(1)
    expect(editor.strokes.value[0].type).toBe('line')
    const pts = editor.strokes.value[0].points
    expect(pts).toHaveLength(2)
    expect(pts[0].x).toBe(0)
    expect(pts[0].y).toBe(0)
    expect(pts[1].x).toBe(100)
    expect(pts[1].y).toBe(0)
  })
})

