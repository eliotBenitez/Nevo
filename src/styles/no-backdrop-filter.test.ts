import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { extname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

// The Borderless redesign removed all surface blur (redesign spec §3, §10.1).
// This is a style-contract test, not a lint rule: it fails the build the
// moment any `backdrop-filter` declaration (or a reference to it, such as in
// a `transition` list or a doc comment) reappears anywhere under `src/`.
const THIS_FILE = fileURLToPath(import.meta.url)
const SRC_ROOT = join(THIS_FILE, '..', '..')
const SELF = relative(SRC_ROOT, THIS_FILE)
const SCANNED_EXTENSIONS = new Set(['.css', '.vue', '.ts'])
const SKIP_DIRS = new Set(['node_modules', 'dist', '.git'])

function collectFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue
    const fullPath = join(dir, entry)
    const stat = statSync(fullPath)
    if (stat.isDirectory()) {
      collectFiles(fullPath, out)
    } else if (SCANNED_EXTENSIONS.has(extname(entry))) {
      out.push(fullPath)
    }
  }
  return out
}

describe('no backdrop-filter in production sources', () => {
  it('contains no backdrop-filter declarations or references under src/', () => {
    const offenders: string[] = []

    for (const filePath of collectFiles(SRC_ROOT)) {
      const relPath = relative(SRC_ROOT, filePath)
      if (relPath === SELF) continue
      const content = readFileSync(filePath, 'utf-8')
      if (content.includes('backdrop-filter')) {
        offenders.push(relPath)
      }
    }

    expect(offenders).toEqual([])
  })
})

// Legacy glass-era token names stay defined in tokens.css only as a deprecated
// compatibility layer for user `.nevo/custom.css`; product code must use the
// semantic tokens (redesign spec §6.4).
const LEGACY_TOKEN = /--(?:glass-(?:1|2|3|titlebar)|line-(?:1|2|3|strong)|text-(?:1|2|3|4|inv)|canvas-(?:0|1)|wash-(?:a|b)|shadow-(?:1|2|pop|subtle|strong)|bg-(?:1|2|3)|border-2|border-muted|accent-glow|danger-glow|success-glow|workspace-divider)(?![\w-])/
const LEGACY_ALLOWED = new Set([join('styles', 'tokens.css')])

describe('no legacy glass-era tokens in production sources', () => {
  it('uses semantic tokens everywhere outside the tokens compatibility layer', () => {
    const offenders: string[] = []

    for (const filePath of collectFiles(SRC_ROOT)) {
      const relPath = relative(SRC_ROOT, filePath)
      // Tests may name legacy tokens to assert they are no longer written.
      if (relPath === SELF || LEGACY_ALLOWED.has(relPath) || relPath.endsWith('.test.ts')) continue
      const match = readFileSync(filePath, 'utf-8').match(LEGACY_TOKEN)
      if (match) offenders.push(`${relPath}: ${match[0]}`)
    }

    expect(offenders).toEqual([])
  })
})
