import { describe, expect, it } from 'vitest'
import { createNotebook, decodeNoteFormat, decodeNotebook, encodeNotebook } from '../codec'
import type { NotebookPageV1, NotebookSnapshotV1 } from '../types'

function validNotebook(): NotebookSnapshotV1 {
  return {
    version: 1,
    extension: { owner: 'future-writer' },
    pages: [{
      id: 'page-1', width: 595.28, height: 841.89,
      paper: { kind: 'grid', extension: 'kept' },
      objects: [{
        id: 'stroke-1', kind: 'stroke', actionId: 'action-1', color: '#123abc',
        width: 2, opacity: 1, points: [{ x: 12, y: 24, pressure: 0, vendor: { untouched: true } }], vendorData: { untouched: true },
      }],
    } as NotebookPageV1],
  }
}

describe('notebook codec', () => {
  it('creates one valid empty A4 page without normalizing legacy or future values', () => {
    expect(createNotebook()).toMatchObject({
      version: 1,
      pages: [{ width: 595.28, height: 841.89, paper: { kind: 'ruled' }, objects: [] }],
    })
    expect(createNotebook('ruled').pages).toHaveLength(1)
  })

  it('round trips unknown keys at every notebook level and preserves explicit zero pressure', () => {
    const source = validNotebook()
    const decoded = decodeNotebook(source)
    expect(decoded.status).toBe('valid')
    if (decoded.status !== 'valid') return
    expect(JSON.parse(JSON.stringify(decoded.snapshot))).toEqual(source)
    expect(JSON.parse(encodeNotebook(decoded.snapshot))).toEqual(source)
    expect(decoded.snapshot.pages[0].objects[0].points[0].pressure).toBe(0)
  })

  it('reports malformed and truncated JSON without replacing it with an empty notebook', () => {
    for (const source of ['{', '{"version":1,"pages":[']) {
      expect(decodeNotebook(source)).toMatchObject({ status: 'invalid', rawValue: source })
    }
  })

  it('gates future versions, unknown object kinds, duplicate IDs, and invalid geometry', () => {
    const future = { version: 2, pages: [] }
    expect(decodeNotebook(future)).toMatchObject({ status: 'unsupported-version' })

    const unknownKind = validNotebook()
    unknownKind.pages[0].objects[0] = { ...unknownKind.pages[0].objects[0], kind: 'shape' } as never
    expect(decodeNotebook(unknownKind)).toMatchObject({ status: 'unsupported-kind' })

    const duplicate = validNotebook()
    duplicate.pages.push({ ...duplicate.pages[0], id: 'page-1' })
    expect(decodeNotebook(duplicate)).toMatchObject({ status: 'invalid' })

    const malformed = validNotebook()
    malformed.pages[0].objects[0].points[0].x = Number.NaN
    expect(decodeNotebook(malformed)).toMatchObject({ status: 'invalid' })

    const unsafeFinite = validNotebook()
    unsafeFinite.pages[0].objects[0].points[0].x = Number.MAX_VALUE
    expect(decodeNotebook(unsafeFinite)).toMatchObject({ status: 'invalid' })
  })

  it('rejects an empty page list while accepting semantically empty ProseMirror paragraphs with unknown fields', () => {
    expect(decodeNotebook({ version: 1, pages: [] })).toMatchObject({ status: 'invalid' })
    const result = decodeNoteFormat({
      documentKind: 'notebook',
      notebook: validNotebook(),
      content: { extra: { future: true }, content: [{ attrs: { extension: 'preserved' }, type: 'paragraph' }], type: 'doc' },
    })
    expect(result).toMatchObject({ status: 'notebook', editable: true })
  })

  it('accepts a supported line dash and rejects unknown dash values without normalizing them away', () => {
    const dashed = validNotebook()
    dashed.pages[0].objects[0].dash = 'dashed'
    expect(decodeNotebook(dashed)).toMatchObject({ status: 'valid' })

    const dotted = validNotebook()
    dotted.pages[0].objects[0].dash = 'dotted'
    expect(decodeNotebook(dotted)).toMatchObject({ status: 'valid' })

    const invalid = validNotebook()
    invalid.pages[0].objects[0].dash = 'wavy' as never
    expect(decodeNotebook(invalid)).toMatchObject({ status: 'invalid' })
  })

  it('accepts any string stroke path mode, round trips it, and rejects non-string values', () => {
    for (const path of ['modeled', 'future-mode']) {
      const source = validNotebook()
      source.pages[0].objects[0].path = path
      const decoded = decodeNotebook(source)
      expect(decoded).toMatchObject({ status: 'valid' })
      expect(decodeNotebook(JSON.parse(encodeNotebook(source)))).toEqual(decoded)
      if (decoded.status === 'valid') expect(decoded.snapshot.pages[0].objects[0]).toMatchObject({ path })
    }
    const invalid = validNotebook()
    invalid.pages[0].objects[0].path = 3 as never
    expect(decodeNotebook(invalid)).toMatchObject({ status: 'invalid' })
  })

  it('reports page, object, point, and serialized-byte limit violations', () => {
    const tooManyPages = validNotebook()
    tooManyPages.pages = Array.from({ length: 1001 }, (_, index) => ({
      ...tooManyPages.pages[0], id: `page-${index}`,
    }))
    expect(decodeNotebook(tooManyPages)).toMatchObject({ status: 'limit-exceeded' })

    const tooManyPoints = validNotebook()
    tooManyPoints.pages[0].objects[0].points = Array.from({ length: 4097 }, () => ({ x: 0, y: 0 }))
    expect(decodeNotebook(tooManyPoints)).toMatchObject({ status: 'limit-exceeded' })
  })

  it('distinguishes ordinary legacy notes from safe, editable and unsupported notebook notes', () => {
    expect(decodeNoteFormat({ content: { type: 'doc', content: [] } })).toMatchObject({ status: 'document' })
    expect(decodeNoteFormat({
      documentKind: 'notebook', notebook: validNotebook(), content: { type: 'doc', content: [] },
    })).toMatchObject({ status: 'notebook', editable: true })
    expect(decodeNoteFormat({
      documentKind: 'notebook', notebook: { version: 2, pages: [] }, content: { type: 'doc', content: [] },
    })).toMatchObject({ status: 'unsupported', editable: false })
  })
})
