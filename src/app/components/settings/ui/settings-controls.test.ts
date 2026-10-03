import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

function vueFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name)
    return entry.isDirectory() ? vueFiles(path) : path.endsWith('.vue') ? [path] : []
  })
}

describe('settings control accessibility', () => {
  it('gives every settings switch an accessible name', () => {
    for (const path of vueFiles('src/app/components/settings')) {
      const source = readFileSync(path, 'utf8')
      for (const toggle of source.matchAll(/<NvToggle\b[\s\S]*?\/>/g)) {
        expect(toggle[0], `${path} has an unnamed switch`).toMatch(/(?:aria-label|aria-labelledby|\blabel)=/)
      }
    }
  })
})
