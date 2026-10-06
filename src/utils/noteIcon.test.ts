import { describe, expect, it } from 'vitest'
import { lucideExportNameFromToken, lucideTokenFromExportName } from './noteIcon'

describe('lucideExportNameFromToken legacy brand aliases', () => {
  it('maps brand icons removed in Lucide v1 to their closest current glyph', () => {
    expect(lucideExportNameFromToken('lucide:github')).toBe('GitBranch')
    expect(lucideExportNameFromToken('lucide:gitlab')).toBe('GitBranch')
    expect(lucideExportNameFromToken('lucide:twitter')).toBe('Bird')
    expect(lucideExportNameFromToken('lucide:figma')).toBe('Component')
    expect(lucideExportNameFromToken('lucide:chrome')).toBe('Globe')
  })

  it('also maps the Lucide-prefixed alias spellings the old picker offered', () => {
    expect(lucideExportNameFromToken('lucide:lucide-github')).toBe('GitBranch')
    expect(lucideExportNameFromToken('lucide:lucide-twitter')).toBe('Bird')
  })

  it('leaves current icon names untouched', () => {
    expect(lucideExportNameFromToken('lucide:star')).toBe('Star')
    expect(lucideExportNameFromToken('lucide:git-branch')).toBe('GitBranch')
  })

  it('still rejects non-lucide tokens', () => {
    expect(lucideExportNameFromToken('emoji:⭐')).toBeNull()
    expect(lucideExportNameFromToken('')).toBeNull()
  })
})

describe('lucideTokenFromExportName', () => {
  it('keeps producing kebab tokens for current exports', () => {
    expect(lucideTokenFromExportName('GitBranch')).toBe('lucide:git-branch')
  })
})
