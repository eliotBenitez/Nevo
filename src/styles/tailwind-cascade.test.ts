import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

// Tailwind utilities live in `@layer utilities`; any unlayered rule beats them
// regardless of specificity. The global focus-ring fallbacks must therefore sit
// in `@layer base`, or `tw:focus-visible:outline-none` on migrated controls is
// silently overridden and they render a double focus ring.
const STYLES_DIR = join(fileURLToPath(import.meta.url), '..')

describe('Tailwind cascade contract', () => {
  it('declares the layer order before any utilities are emitted', () => {
    const tailwind = readFileSync(join(STYLES_DIR, 'tailwind.css'), 'utf-8')
    expect(tailwind.trimStart().startsWith('@layer theme, base, components, utilities;')).toBe(true)
  })

  it('keeps the global focus-ring fallbacks inside @layer base', () => {
    const base = readFileSync(join(STYLES_DIR, 'base.css'), 'utf-8')
    const layerStart = base.indexOf('@layer base {')
    expect(layerStart).toBeGreaterThanOrEqual(0)
    for (const selector of [
      ':where(button, a, input, select, textarea, [tabindex]):focus-visible',
      '[data-focus-ring="high-contrast"] *:focus-visible',
    ]) {
      expect(base.indexOf(selector)).toBeGreaterThan(layerStart)
    }
  })

  // .nv-btn is a compatibility hook: plain-template consumers still apply it
  // directly instead of `tw:` utilities. Unlayered, it would beat a
  // `tw:`-utility override on the same element regardless of specificity, so
  // it must sit in `@layer components` (below `utilities` in the declared
  // order) like the other shared hooks (`.nv-chip`, `.nv-kbd`).
  it('keeps the shared .nv-btn compatibility hook inside @layer components', () => {
    const primitives = readFileSync(join(STYLES_DIR, 'primitives.css'), 'utf-8')
    const layerStart = primitives.indexOf('@layer components {')
    expect(layerStart).toBeGreaterThanOrEqual(0)
    const btnRuleIndex = primitives.indexOf('.nv-btn {')
    expect(btnRuleIndex).toBeGreaterThan(layerStart)

    // Confirm it is still nested inside that same layer block, not a later
    // sibling block: find the matching closing brace by tracking depth.
    let depth = 0
    let closeIndex = -1
    for (let i = layerStart; i < primitives.length; i++) {
      if (primitives[i] === '{') depth++
      else if (primitives[i] === '}') {
        depth--
        if (depth === 0) {
          closeIndex = i
          break
        }
      }
    }
    expect(closeIndex).toBeGreaterThan(btnRuleIndex)
  })

  it('keeps the shared .search-field hook inside @layer components', () => {
    const panels = readFileSync(join(STYLES_DIR, 'settings-panels.css'), 'utf-8')
    const layerStart = panels.indexOf('@layer components {')
    expect(layerStart).toBeGreaterThanOrEqual(0)
    expect(panels.indexOf('.search-field {')).toBeGreaterThan(layerStart)
    expect(panels.indexOf('.search-input {')).toBeGreaterThan(layerStart)
  })

  it('keeps the shared .ui-input hook inside @layer components', () => {
    const panels = readFileSync(join(STYLES_DIR, 'settings-panels.css'), 'utf-8')
    const ruleIndex = panels.indexOf('.ui-input,')
    const layerStart = panels.lastIndexOf('@layer components {', ruleIndex)
    expect(layerStart).toBeGreaterThanOrEqual(0)
    // The layer block must still be open where the rule starts.
    const between = panels.slice(layerStart, ruleIndex)
    expect(between.split('{').length - between.split('}').length).toBeGreaterThan(0)
  })
})
