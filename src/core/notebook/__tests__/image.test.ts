import { describe, expect, it } from 'vitest'
import { createNotebook, decodeNotebook, decodeNoteFormat } from '../codec'
import { createNotebookExport } from '../export'
import { clampNotebookTranslation, eraseWholeNotebookStrokes, lassoSelectNotebookObjects } from '../geometry'
import { fitNotebookImage, isNotebookImageSrc, notebookImageCorners, notebookImageMatrix } from '../image'
import { addNotebookImage, duplicateNotebookObjects } from '../operations'
import { notebookSelectionBounds, transformNotebookSelection } from '../selectionTransform'
import { notebookPageSvg } from '../svg'
import { NOTEBOOK_A4_HEIGHT, NOTEBOOK_A4_WIDTH, NOTEBOOK_OBJECT_LIMIT, type NotebookImageV1, type NotebookObjectV1, type NotebookPageV1, type NotebookSnapshotV1, type NotebookStrokeV1 } from '../types'

function image(overrides: Partial<NotebookImageV1> = {}): NotebookImageV1 {
  return {
    id: 'img', actionId: 'img-action', kind: 'image', src: '.nevo/assets/photo.png', opacity: 1,
    points: notebookImageCorners({ x: 300, y: 400 }, 200, 100),
    ...overrides,
  }
}

function stroke(id: string, points: [number, number][], width = 2): NotebookStrokeV1 {
  return { id, actionId: `${id}-action`, kind: 'stroke', color: '#000000', width, opacity: 1, points: points.map(([x, y]) => ({ x, y })) }
}

function notebookWith(objects: NotebookObjectV1[]): NotebookSnapshotV1 {
  const notebook = createNotebook('plain')
  notebook.pages[0] = { ...notebook.pages[0], objects }
  return notebook
}

function pageWith(objects: NotebookObjectV1[]): NotebookPageV1 {
  return notebookWith(objects).pages[0]
}

describe('notebook image helpers', () => {
  it('accepts only single-segment raster asset paths', () => {
    expect(isNotebookImageSrc('.nevo/assets/a.png')).toBe(true)
    expect(isNotebookImageSrc('.nevo/assets/A.JPEG')).toBe(true)
    for (const bad of [
      '.nevo/assets/a.svg', '.nevo/assets/../a.png', '.nevo/assets/a\\b.png', '/abs/a.png', '.nevo/assets/sub/a.png',
      '.nevo/assets/', '.nevo/assets/noext', '.nevo/plugins/a.png', 'assets/a.png', '.nevo/assets/.png',
    ]) expect(isNotebookImageSrc(bad)).toBe(false)
    expect(isNotebookImageSrc(42)).toBe(false)
  })

  it('fits an image within 60% of the page, centered, keeping aspect ratio', () => {
    const wide = fitNotebookImage({ width: 2000, height: 1000 }, { width: NOTEBOOK_A4_WIDTH, height: NOTEBOOK_A4_HEIGHT })
    const width = wide[1].x - wide[0].x
    const height = wide[3].y - wide[0].y
    expect(width).toBeCloseTo(NOTEBOOK_A4_WIDTH * 0.6)
    expect(width / height).toBeCloseTo(2)
    expect((wide[0].x + wide[2].x) / 2).toBeCloseTo(NOTEBOOK_A4_WIDTH / 2)
    expect((wide[0].y + wide[2].y) / 2).toBeCloseTo(NOTEBOOK_A4_HEIGHT / 2)
    const tall = fitNotebookImage({ width: 100, height: 4000 }, { width: NOTEBOOK_A4_WIDTH, height: NOTEBOOK_A4_HEIGHT })
    expect(tall[3].y - tall[0].y).toBeCloseTo(NOTEBOOK_A4_HEIGHT * 0.6)
  })

  it('builds the unit-square matrix and keeps it consistent after rotation and scale', () => {
    expect(notebookImageMatrix(notebookImageCorners({ x: 60, y: 40 }, 100, 50))).toEqual([100, 0, 0, 50, 10, 15])
    const page = pageWith([image()])
    const rotated = transformNotebookSelection(page, ['img'], { angle: 90 }).objects[0]
    const [a, b, c, d] = notebookImageMatrix(rotated.points)
    expect(Math.hypot(a, b)).toBeCloseTo(200)
    expect(Math.hypot(c, d)).toBeCloseTo(100)
    expect(a * c + b * d).toBeCloseTo(0)
    const scaled = transformNotebookSelection(page, ['img'], { scale: 1.5 }).objects[0]
    const [sa, sb, sc, sd] = notebookImageMatrix(scaled.points)
    expect(Math.hypot(sa, sb)).toBeCloseTo(300)
    expect(Math.hypot(sc, sd)).toBeCloseTo(150)
  })
})

describe('notebook image codec', () => {
  it('decodes a valid image and keeps unknown fields', () => {
    const source = notebookWith([image({ vendor: { keep: true } })])
    const result = decodeNotebook(source)
    expect(result.status).toBe('valid')
    expect(decodeNoteFormat({ documentKind: 'notebook', content: { type: 'doc' }, notebook: source }).status).toBe('notebook')
  })

  it.each([
    ['svg', { src: '.nevo/assets/a.svg' }],
    ['parent segment', { src: '.nevo/assets/../a.png' }],
    ['backslash', { src: '.nevo/assets/a\\b.png' }],
    ['absolute', { src: '/etc/a.png' }],
    ['nested', { src: '.nevo/assets/x/a.png' }],
    ['three points', { points: notebookImageCorners({ x: 10, y: 10 }, 4, 4).slice(0, 3) }],
    ['five points', { points: [...notebookImageCorners({ x: 10, y: 10 }, 4, 4), { x: 0, y: 0 }] }],
    ['zero area', { points: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 0 }, { x: 30, y: 0 }] }],
    ['non finite point', { points: [{ x: 0, y: 0 }, { x: Number.NaN, y: 0 }, { x: 5, y: 5 }, { x: 0, y: 5 }] }],
    ['opacity high', { opacity: 1.5 }],
    ['opacity negative', { opacity: -0.1 }],
    ['missing actionId', { actionId: '' }],
  ])('rejects a malformed image (%s) as invalid', (_name, override) => {
    const result = decodeNotebook(notebookWith([image(override as Partial<NotebookImageV1>)]))
    expect(result.status).toBe('invalid')
    expect(result.diagnostics.length).toBeGreaterThan(0)
  })

  it('still reports unknown object kinds as unsupported', () => {
    const source = notebookWith([{ ...image(), kind: 'sticker' } as unknown as NotebookObjectV1])
    expect(decodeNotebook(source).status).toBe('unsupported-kind')
  })

  it('counts image points toward the notebook point total', () => {
    expect(decodeNotebook(notebookWith([image(), stroke('s', [[1, 1], [2, 2]])])).status).toBe('valid')
  })
})

describe('notebook image geometry', () => {
  const ink = stroke('ink', [[290, 400], [310, 400]], 8)

  it('partial and whole erasers leave images untouched', () => {
    const img = image()
    const objects = [img, ink]
    const whole = eraseWholeNotebookStrokes(objects, [{ x: 300, y: 400 }], 10)
    expect(whole).toEqual([img])
    expect(whole[0]).toBe(img)
    const untouched = eraseWholeNotebookStrokes([img], [{ x: 300, y: 400 }], 10)
    expect(untouched[0]).toBe(img)
  })

  it('lasso selects an image that is inside, crossing, or containing the polygon', () => {
    const objects = [image()]
    const inside = [{ x: 290, y: 390 }, { x: 310, y: 390 }, { x: 310, y: 410 }, { x: 290, y: 410 }]
    const crossing = [{ x: 150, y: 350 }, { x: 220, y: 350 }, { x: 220, y: 450 }, { x: 150, y: 450 }]
    const around = [{ x: 0, y: 0 }, { x: 590, y: 0 }, { x: 590, y: 800 }, { x: 0, y: 800 }]
    const outside = [{ x: 10, y: 10 }, { x: 30, y: 10 }, { x: 30, y: 30 }, { x: 10, y: 30 }]
    expect(lassoSelectNotebookObjects(objects, inside)).toEqual(['img'])
    expect(lassoSelectNotebookObjects(objects, crossing)).toEqual(['img'])
    expect(lassoSelectNotebookObjects(objects, around)).toEqual(['img'])
    expect(lassoSelectNotebookObjects(objects, outside)).toEqual([])
  })

  it('clamps translation without a stroke-width margin for images', () => {
    const img = image({ points: notebookImageCorners({ x: 100, y: 100 }, 200, 100) })
    expect(clampNotebookTranslation([img], -500, 0, NOTEBOOK_A4_WIDTH, NOTEBOOK_A4_HEIGHT)).toEqual({ dx: 0, dy: 0 })
    expect(clampNotebookTranslation([img], 1000, 0, NOTEBOOK_A4_WIDTH, NOTEBOOK_A4_HEIGHT).dx).toBeCloseTo(NOTEBOOK_A4_WIDTH - 200)
    const wide = stroke('w', [[10, 50], [50, 50]], 20)
    expect(clampNotebookTranslation([wide], -500, 0, NOTEBOOK_A4_WIDTH, NOTEBOOK_A4_HEIGHT).dx).toBe(0)
  })

  it('bounds an image without a width margin', () => {
    expect(notebookSelectionBounds([image()])).toEqual({ x: 200, y: 350, width: 200, height: 100 })
  })
})

describe('notebook image transform and operations', () => {
  it('rotating and scaling keeps a rectangle without adding a width field', () => {
    const page = pageWith([image()])
    const next = transformNotebookSelection(page, ['img'], { scale: 1.2, angle: 33 }).objects[0]
    expect('width' in next).toBe(false)
    const [tl, tr, br, bl] = next.points
    expect(tr.x - tl.x).toBeCloseTo(br.x - bl.x)
    expect(tr.y - tl.y).toBeCloseTo(br.y - bl.y)
    expect(Math.hypot(tr.x - tl.x, tr.y - tl.y) / Math.hypot(bl.x - tl.x, bl.y - tl.y)).toBeCloseTo(2)
    expect(decodeNotebook(notebookWith([next])).status).toBe('valid')
  })

  it('addNotebookImage appends on top, clones, and respects the object limit', () => {
    const base = notebookWith([stroke('s', [[1, 1], [2, 2]])])
    const img = image()
    const next = addNotebookImage(base, base.pages[0].id, img)
    expect(next.pages[0].objects.map(object => object.id)).toEqual(['s', 'img'])
    expect(next.pages[0].objects[1]).not.toBe(img)
    expect(next.pages[0].objects[1].points).not.toBe(img.points)
    expect(base.pages[0].objects).toHaveLength(1)
    const full = notebookWith(Array.from({ length: NOTEBOOK_OBJECT_LIMIT }, (_, index) => stroke(`s${index}`, [[1, 1]])))
    expect(() => addNotebookImage(full, full.pages[0].id, img)).toThrow(/limit/)
  })

  it('duplicates an image with fresh identity', () => {
    const base = notebookWith([image()])
    let n = 0
    const next = duplicateNotebookObjects(base, base.pages[0].id, ['img'], () => `new-${++n}`)
    const copy = next.pages[0].objects[1]
    expect(copy).toMatchObject({ kind: 'image', src: '.nevo/assets/photo.png', id: 'new-1' })
  })
})

describe('notebook image export and preview', () => {
  it('exports images with matrix and z-order pathIndex', () => {
    const snapshot = notebookWith([
      stroke('below', [[10, 10], [60, 10]]),
      image(),
      stroke('above', [[10, 30], [60, 30]]),
      image({ id: 'top', actionId: 'top-action', src: '.nevo/assets/top.webp', opacity: 0.5 }),
    ])
    const page = createNotebookExport(snapshot).pages[0]
    expect(page.paths.map(path => path.id)).toEqual(['below', 'above'])
    expect(page.images).toEqual([
      { id: 'img', src: '.nevo/assets/photo.png', opacity: 1, matrix: [200, 0, 0, 100, 200, 350], pathIndex: 1 },
      { id: 'top', src: '.nevo/assets/top.webp', opacity: 0.5, matrix: [200, 0, 0, 100, 200, 350], pathIndex: 2 },
    ])
  })

  it('exports an empty images array for ink-only pages', () => {
    expect(createNotebookExport(notebookWith([stroke('s', [[1, 1], [9, 9]])])).pages[0].images).toEqual([])
  })

  it('renders a gray placeholder polygon in the SVG preview', () => {
    const svg = notebookPageSvg(pageWith([image()]))
    expect(svg).toContain('<polygon')
    expect(svg).toContain('#eeeeee')
    expect(svg).toContain('#b5b5b5')
    expect(svg).not.toContain('<image')
    expect(svg).not.toContain('photo.png')
  })
})
