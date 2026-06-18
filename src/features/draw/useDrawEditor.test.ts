import { describe, it, expect, vi } from 'vitest'
import { useDrawEditor } from './useDrawEditor'
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
