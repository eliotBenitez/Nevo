import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { compile } from 'tailwindcss'

// Tailwind v4 reads `z-*` utilities from the `--z-index-*` theme namespace.
// A `--z-*` declaration is silently ignored and the class emits no CSS, which
// left NvModal and the onboarding overlays at `z-index: auto`.
const STYLES_DIR = join(fileURLToPath(import.meta.url), '..')
const require = createRequire(import.meta.url)

async function buildUtilities(candidates: string[]): Promise<string> {
  const input = readFileSync(join(STYLES_DIR, 'tailwind.css'), 'utf-8')
  const compiler = await compile(input, {
    base: STYLES_DIR,
    async loadStylesheet(id, base) {
      const path = id.startsWith('tailwindcss/')
        ? require.resolve(id)
        : join(base, id)
      return { path, base: dirname(path), content: readFileSync(path, 'utf-8') }
    },
  })
  return compiler.build(candidates)
}

describe('tailwind z-index theme', () => {
  it.each([
    ['tw:z-nv-scrim', '--z-scrim'],
    ['tw:z-nv-modal', '--z-modal'],
    ['tw:z-nv-popover', '--z-popover'],
  ])('%s emits z-index from %s', async (candidate, token) => {
    const css = await buildUtilities([candidate])
    expect(css).toMatch(new RegExp(`z-index:\\s*var\\(${token}\\)`))
  })
})
