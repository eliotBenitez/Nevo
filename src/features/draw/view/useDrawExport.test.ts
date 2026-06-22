import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref, type Ref } from 'vue'
import { useDrawExport } from './useDrawExport'
import type { DrawStroke } from '../../../utils/draw/drawEngine'

vi.mock('../../../utils/draw/drawEngine', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../../utils/draw/drawEngine')>()
  return {
    ...original,
    renderStrokesToSvgInner: vi.fn(async (strokes: DrawStroke[]) => {
      return strokes.map((s) => `<g id="${s.id}"></g>`).join('')
    }),
  }
})

describe('useDrawExport', () => {
  let strokes: Ref<DrawStroke[]>
  let bgColor: Ref<string>
  let camera: Ref<{ x: number; y: number; scale: number }>
  let viewport: Ref<{ w: number; h: number }>
  let selection: Ref<Set<string>>

  beforeEach(() => {
    strokes = ref<DrawStroke[]>([
      { type: 'rectangle', points: [{ x: 10, y: 10 }, { x: 110, y: 110 }], color: '#000', size: 3, id: 's1' },
      { type: 'ellipse', points: [{ x: 200, y: 200 }, { x: 300, y: 300 }], color: '#f00', size: 3, id: 's2' },
    ])
    bgColor = ref('transparent')
    camera = ref({ x: 100, y: 100, scale: 2 })
    viewport = ref({ w: 800, h: 600 })
    selection = ref(new Set<string>())
  })

  it('инициализирует настройки экспорта дефолтными значениями', () => {
    const drawExport = useDrawExport({
      strokes,
      bgColor,
      camera,
      viewport,
      selection,
      drawId: 'test-draw',
    })

    expect(drawExport.format.value).toBe('png')
    expect(drawExport.scope.value).toBe('all')
    expect(drawExport.transparent.value).toBe(false)
    expect(drawExport.exporting.value).toBe(false)
    expect(drawExport.errorMessage.value).toBe('')
  })

  it('performExport выдает ошибку при пустом выделении', async () => {
    const drawExport = useDrawExport({
      strokes,
      bgColor,
      camera,
      viewport,
      selection,
      drawId: 'test-draw',
    })

    drawExport.scope.value = 'selection'
    await drawExport.performExport()
    expect(drawExport.errorMessage.value).toBe('selectionEmpty')
  })

  it('успешный экспорт SVG для выделенного объекта', async () => {
    const downloadSpy = vi.fn()
    const drawExport = useDrawExport({
      strokes,
      bgColor,
      camera,
      viewport,
      selection,
      drawId: 'test-draw',
      downloadBlob: downloadSpy,
    })

    selection.value.add('s1')
    drawExport.scope.value = 'selection'
    drawExport.format.value = 'svg'

    await drawExport.performExport()

    expect(drawExport.errorMessage.value).toBe('')
    expect(downloadSpy).toHaveBeenCalledTimes(1)
    const [blob, filename] = downloadSpy.mock.calls[0]
    expect(filename).toBe('drawing-test-draw.svg')
    expect(blob.type).toBe('image/svg+xml;charset=utf-8')
  })

  it('экспорт с непрозрачным фоном использует bgColor', async () => {
    bgColor.value = '#ff0000'
    const downloadSpy = vi.fn()
    const drawExport = useDrawExport({
      strokes,
      bgColor,
      camera,
      viewport,
      selection,
      drawId: 'test-draw',
      downloadBlob: downloadSpy,
    })

    drawExport.format.value = 'svg'
    drawExport.scope.value = 'all'
    drawExport.transparent.value = false

    await drawExport.performExport()

    expect(downloadSpy).toHaveBeenCalledTimes(1)
    const blob = downloadSpy.mock.calls[0][0] as Blob
    const text = await blob.text()
    expect(text).toContain('fill="#ff0000"')
  })
})
