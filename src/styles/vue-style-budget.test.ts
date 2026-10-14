import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

// Ratchet for scoped CSS in Vue components. Styling for Vue-owned elements
// belongs in `tw:` utilities (see ARCHITECTURE.md); a `<style>` block keeps
// only what Tailwind cannot express (`:deep()`, keyframes, pseudo-elements,
// runtime variables). If this fails, move the new rules to `tw:` utilities.
// If the budget drops, lower it so the gain is kept.
const VUE_STYLE_LINE_BUDGET = 909

const SRC_ROOT = join(fileURLToPath(import.meta.url), '..', '..')

function collectVueFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) collectVueFiles(full, out)
    else if (extname(full) === '.vue') out.push(full)
  }
  return out
}

function styleLineCount(source: string): number {
  let count = 0
  for (const match of source.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/g)) {
    count += match[1].split('\n').filter((line) => line.trim() !== '').length
  }
  return count
}

describe('vue <style> budget', () => {
  it('does not grow the non-blank CSS lines inside Vue <style> blocks', () => {
    const total = collectVueFiles(SRC_ROOT)
      .reduce((sum, file) => sum + styleLineCount(readFileSync(file, 'utf8')), 0)
    expect(total).toBeLessThanOrEqual(VUE_STYLE_LINE_BUDGET)
  })
})
