import { describe, expect, it } from 'vitest'
import {
  GLYPH_PREFIX,
  WORKSPACE_GLYPHS,
  getGlyphDef,
  getGlyphId,
  glyphToken,
  isGlyphToken,
} from './workspaceGlyphs'

describe('workspaceGlyphs', () => {
  it('curates 16-20 distinct, kebab-case glyphs with non-empty labels and paths', () => {
    expect(WORKSPACE_GLYPHS.length).toBeGreaterThanOrEqual(16)
    expect(WORKSPACE_GLYPHS.length).toBeLessThanOrEqual(20)

    const ids = new Set<string>()
    for (const glyph of WORKSPACE_GLYPHS) {
      expect(glyph.id).toMatch(/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/)
      expect(ids.has(glyph.id)).toBe(false)
      ids.add(glyph.id)
      expect(glyph.label.trim().length).toBeGreaterThan(0)
      expect(glyph.paths.length).toBeGreaterThan(0)
      for (const d of glyph.paths) {
        expect(typeof d).toBe('string')
        expect(d.trim().length).toBeGreaterThan(0)
      }
    }
  })

  it('builds a prefixed token from an id', () => {
    expect(glyphToken('orbit')).toBe(`${GLYPH_PREFIX}orbit`)
  })

  it('identifies glyph tokens', () => {
    expect(isGlyphToken('glyph:orbit')).toBe(true)
    expect(isGlyphToken('lucide:Star')).toBe(false)
    expect(isGlyphToken('N')).toBe(false)
    expect(isGlyphToken(null)).toBe(false)
    expect(isGlyphToken(undefined)).toBe(false)
  })

  it('extracts the bare id from a token', () => {
    expect(getGlyphId('glyph:orbit')).toBe('orbit')
    expect(getGlyphId('orbit')).toBeNull()
    expect(getGlyphId('glyph:')).toBeNull()
  })

  it('resolves a glyph definition from a full token or a bare id', () => {
    expect(getGlyphDef('glyph:orbit')?.id).toBe('orbit')
    expect(getGlyphDef('orbit')?.id).toBe('orbit')
    expect(getGlyphDef('glyph:not-a-real-glyph')).toBeNull()
    expect(getGlyphDef('lucide:Star')).toBeNull()
    expect(getGlyphDef(null)).toBeNull()
  })
})
