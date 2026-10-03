import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { extname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

// Tailwind v4's `bg-none` compiles to `background-image: none`, not the CSS
// shorthand `background: none` it was often migrated from. It leaves the
// background *colour* untouched, so a `<button>` keeps the webview's default
// light-grey fill (very visible in dark mode on WebKitGTK). Use
// `tw:bg-transparent` for "no background" instead.

const SRC_ROOT = join(fileURLToPath(import.meta.url), '..', '..')

function collectFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules') continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) collectFiles(full, out)
    else if (['.vue', '.ts'].includes(extname(full)) && !full.endsWith('.test.ts')) out.push(full)
  }
  return out
}

describe('tailwind background reset', () => {
  it('never uses tw:bg-none (it does not clear the background colour)', () => {
    const offenders: string[] = []
    for (const file of collectFiles(SRC_ROOT)) {
      readFileSync(file, 'utf8').split('\n').forEach((line, index) => {
        if (/tw:[\w:-]*bg-none\b/.test(line)) offenders.push(`${relative(SRC_ROOT, file)}:${index + 1}`)
      })
    }
    expect(offenders).toEqual([])
  })
})
