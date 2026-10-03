import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { extname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

// Tailwind utilities all live in `@layer utilities` at equal specificity, so
// when an element carries two `tw:` utilities for the same property (and the
// same variant, e.g. both unprefixed, or both `hover:`), the browser picks a
// winner by Tailwind's generated CSS *sort order* — not by which class was
// written last in the template, and not by "the conditional one should win
// because it's more specific intent". That sort order is stable but is not
// something authors should have to reason about.
//
// The classic shape of this bug: a static `class="..."` carries an idle
// utility (e.g. `tw:bg-transparent`) and a `:class="cond && '...'"` binding
// adds a *different* utility for the *same* property (e.g. `tw:bg-accent`)
// only when a condition holds. Both utilities are present in the DOM at
// once whenever the condition is true, and whichever one "wins" is an
// implementation detail of Tailwind's utility ordering, not the author's
// intent. See docs/superpowers/plans/2026-09-25-tailwindcss-features.md and
// the git history around commit ae81e49 for the real bugs this caught (an
// `.is-open` state that silently lost to an unrelated `:hover` idle style,
// etc.) — the fix is always to make the branches mutually exclusive: give
// each state its own complete set of utilities for the properties it
// touches, so only one utility for a given (variant, property) pair is ever
// in the class list at a time.
//
// This test is a style contract, not a general linter: it flags a `tw:`
// utility that appears in a static `class="..."` attribute while a
// same-variant, same-property-family `tw:` utility also appears somewhere
// inside that same element's `:class="..."` (or `v-bind:class="..."`)
// expression — inside an array entry, an object key (`{ 'tw:x': cond }`),
// a ternary branch, or an `&&` guard. It does not try to prove whether two
// *dynamic* branches could co-occur (see NvDatePicker's calendar day cells,
// fixed by hand for that reason) — only the far more common and far more
// mechanically checkable static-vs-dynamic case.
//
// It also cannot see through a `:class="someHelperFn(...)"` call (e.g.
// `pickerBtnClass()` in KanbanCardProperties.vue, `itemClass()` in
// NvGlyphPicker.vue) — the conflicting utilities there live inside the
// helper's return value in `<script setup>`, not as a literal in the
// template, so there is nothing for a textual scan to find. Those were
// audited and fixed by hand; this test is a tripwire for new *literal*
// static/conditional pairs, not a substitute for review when a component
// factors its state classes into a function.

const THIS_FILE = fileURLToPath(import.meta.url)
const SRC_ROOT = join(THIS_FILE, '..', '..')
const SCANNED_EXTENSION = '.vue'
const SKIP_DIRS = new Set(['node_modules', 'dist', '.git'])

function collectVueFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue
    const fullPath = join(dir, entry)
    const stat = statSync(fullPath)
    if (stat.isDirectory()) {
      collectVueFiles(fullPath, out)
    } else if (extname(entry) === SCANNED_EXTENSION) {
      out.push(fullPath)
    }
  }
  return out
}

// A property "family": two utilities in the same family set the same CSS
// property (or the same tightly-coupled group, e.g. all four `border-*-color`
// longhands via the `border` shorthand utilities), so two of them on one
// element for the same variant are a real conflict. Ordered so a longer,
// more specific prefix is tried before a shorter one that would also match
// (e.g. `border-solid`/`border-transparent` must not be classified as the
// `border-color` family before the border-style/width exclusion below runs).
const DISPLAY_UTILITIES = new Set([
  'flex', 'grid', 'hidden', 'block', 'inline-flex', 'inline-block', 'inline', 'contents', 'inline-grid',
])
const POSITION_UTILITIES = new Set(['absolute', 'relative', 'fixed', 'sticky', 'static'])
const TEXT_SIZE_RE = /^text-(xs|sm|base|lg|xl|\d?xl|\[\d)/
const TEXT_ALIGN_UTILITIES = new Set(['text-left', 'text-center', 'text-right'])
const FONT_WEIGHT_RE = /^font-(thin|extralight|light|normal|medium|semibold|bold|extrabold|black|\[\d)/
const BORDER_COLOR_EXCLUDE_RE = /^border-(\d|\[\d|x|y|t|b|l|r|solid|dashed|dotted|double|none|hidden|0)/
const OUTLINE_EXCLUDE_RE = /^outline-(\d|\[\d|none|solid|dashed|dotted|double|offset)/

// [prefix, family] — checked in order, first match wins.
const PREFIX_FAMILIES: [string, string][] = [
  ['bg-', 'bg'],
  ['text-', 'text?'],
  ['border-', 'border?'],
  ['rounded', 'radius'],
  ['px-', 'px'], ['py-', 'py'], ['p-', 'p'],
  ['pl-', 'pl'], ['pr-', 'pr'], ['pt-', 'pt'], ['pb-', 'pb'],
  ['mt-', 'mt'], ['mb-', 'mb'], ['ml-', 'ml'], ['mr-', 'mr'], ['mx-', 'mx'], ['my-', 'my'],
  ['w-', 'w'], ['h-', 'h'],
  ['min-w-', 'minw'], ['max-w-', 'maxw'], ['min-h-', 'minh'], ['max-h-', 'maxh'],
  ['gap-', 'gap'],
  ['opacity-', 'opacity'],
  ['shadow', 'shadow'],
  ['font-', 'font?'],
  ['z-', 'z'],
  ['cursor-', 'cursor'],
  ['translate-x', 'tx'], ['translate-y', 'ty'],
  ['left-', 'left'], ['right-', 'right'], ['top-', 'top'], ['bottom-', 'bottom'],
  ['grid-cols-', 'gcols'],
  ['justify-', 'justify'],
  ['items-', 'items'],
  ['outline-', 'outline?'],
  ['leading-', 'leading'],
  ['tracking-', 'tracking'],
  ['size-', 'size'],
]

/** Property family for one bare (variant-stripped, `!`/`-` stripped) utility body, or null if untracked. */
function familyOf(utility: string): string | null {
  if (DISPLAY_UTILITIES.has(utility)) return 'display'
  if (POSITION_UTILITIES.has(utility)) return 'position'
  for (const [prefix, family] of PREFIX_FAMILIES) {
    if (!utility.startsWith(prefix)) continue
    switch (family) {
      case 'text?':
        if (TEXT_SIZE_RE.test(utility)) return 'text-size'
        if (TEXT_ALIGN_UTILITIES.has(utility)) return 'text-align'
        return 'text-color'
      case 'font?':
        return FONT_WEIGHT_RE.test(utility) ? 'font-weight' : 'font-family'
      case 'border?':
        return BORDER_COLOR_EXCLUDE_RE.test(utility) ? null : 'border-color'
      case 'outline?':
        return OUTLINE_EXCLUDE_RE.test(utility) ? null : 'outline-color'
      default:
        return family
    }
  }
  return null
}

interface ClassUsage {
  /** variant chain, e.g. '' (none), 'hover', 'max-[719px]:hover' */
  variant: string
  family: string
  classes: string[]
}

/** Split a space-joined blob of class tokens into (variant, family) -> classes, keeping only tracked `tw:` utilities. */
function collectTailwindUsages(classBlob: string): Map<string, ClassUsage> {
  const usages = new Map<string, ClassUsage>()
  for (const token of classBlob.split(/\s+/)) {
    if (!token.startsWith('tw:')) continue
    const body = token.slice(3)
    const segments = body.split(':')
    const bareUtility = segments[segments.length - 1].replace(/^!/, '').replace(/^-/, '')
    const variant = segments.slice(0, -1).join(':')
    const family = familyOf(bareUtility)
    if (!family) continue
    const key = `${variant}\u0000${family}`
    const existing = usages.get(key)
    if (existing) {
      existing.classes.push(token)
    } else {
      usages.set(key, { variant, family, classes: [token] })
    }
  }
  return usages
}

/** All single-quoted string literal bodies inside a `:class="..."` expression — covers array entries, ternary branches, `&&` guards, and object keys/values alike, since Tailwind class lists in this codebase are always written as plain quoted strings regardless of the surrounding JS shape. */
function extractQuotedLiterals(expression: string): string {
  const literals: string[] = []
  const re = /'([^']*)'/g
  let match: RegExpExecArray | null
  while ((match = re.exec(expression))) {
    literals.push(match[1])
  }
  return literals.join(' ')
}

// Matches one opening tag's attribute blob. Attribute values are always
// double-quoted in this codebase's templates, so `"[^"]*"` consumes a whole
// quoted value (including any `<`/`>`/newline inside it) before the bare
// `[^<>"]` branch resumes — this is what lets the same regex work across
// multi-line tags without a dotall flag.
const TAG_RE = /<[a-zA-Z][\w-]*\s+((?:[^<>"]|"[^"]*")*)>/g
const STATIC_CLASS_RE = /(?<![:\w-])class="([^"]*)"/
const DYNAMIC_CLASS_RE = /(?:^|\s)(?::class|v-bind:class)="([^"]*)"/

describe('no conflicting static/conditional Tailwind classes', () => {
  it('never pairs a static tw: utility with a same-property conditional one on the same element', () => {
    const offenders: string[] = []

    for (const filePath of collectVueFiles(SRC_ROOT)) {
      const relPath = relative(SRC_ROOT, filePath)
      const fullSource = readFileSync(filePath, 'utf-8')
      // Only the template can carry `class`/`:class`; stop before <style> so
      // an unrelated `<` inside a style rule can never confuse the tag scan.
      const templateSource = fullSource.split('<style')[0]

      let tagMatch: RegExpExecArray | null
      TAG_RE.lastIndex = 0
      while ((tagMatch = TAG_RE.exec(templateSource))) {
        const attrs = tagMatch[1]
        const staticMatch = STATIC_CLASS_RE.exec(attrs)
        const dynamicMatch = DYNAMIC_CLASS_RE.exec(attrs)
        if (!staticMatch || !dynamicMatch) continue

        const staticUsages = collectTailwindUsages(staticMatch[1])
        const dynamicUsages = collectTailwindUsages(extractQuotedLiterals(dynamicMatch[1]))

        for (const [key, staticUsage] of staticUsages) {
          const dynamicUsage = dynamicUsages.get(key)
          if (!dynamicUsage) continue
          const line = templateSource.slice(0, tagMatch.index).split('\n').length
          const variantLabel = staticUsage.variant || 'base'
          offenders.push(
            `${relPath}:${line}: [${variantLabel}] ${staticUsage.family}: `
            + `static ${JSON.stringify(staticUsage.classes)} vs conditional ${JSON.stringify(dynamicUsage.classes)}`,
          )
        }
      }
    }

    expect(offenders).toEqual([])
  })
})
