import { normalizeHex } from '../../utils/colorConversion'

export const NOTEBOOK_RECENT_LIMIT = 8
export const NOTEBOOK_PRESET_LIMIT = 24
export const NOTEBOOK_QUICK_LIMIT = 5

export interface NotebookBuiltinColor {
  color: string
  /** Suffix of the `notebook.palette.colors.<name>` i18n key. */
  name: string
}

export const NOTEBOOK_BUILTIN_COLORS: readonly NotebookBuiltinColor[] = [
  { color: '#000000', name: 'black' },
  { color: '#4b5563', name: 'graphite' },
  { color: '#1d4ed8', name: 'blue' },
  { color: '#0ea5e9', name: 'sky' },
  { color: '#dc2626', name: 'red' },
  { color: '#ea580c', name: 'orange' },
  { color: '#f0c419', name: 'yellow' },
  { color: '#16a34a', name: 'green' },
  { color: '#0d9488', name: 'teal' },
  { color: '#7c3aed', name: 'purple' },
  { color: '#db2777', name: 'pink' },
  { color: '#92400e', name: 'brown' },
]

export interface NotebookPalette {
  presets: string[]
  recents: string[]
}

const BUILTIN_SET = new Set(NOTEBOOK_BUILTIN_COLORS.map(entry => entry.color))

export function isBuiltinNotebookColor(color: string): boolean {
  const hex = normalizeHex(color)
  return !!hex && BUILTIN_SET.has(hex)
}

export function notebookBuiltinColorName(color: string): string | null {
  const hex = normalizeHex(color)
  return NOTEBOOK_BUILTIN_COLORS.find(entry => entry.color === hex)?.name ?? null
}

export function pushRecentColor(list: readonly string[], color: string): string[] {
  const hex = normalizeHex(color)
  if (!hex) return [...list]
  return [hex, ...list.filter(item => item !== hex)].slice(0, NOTEBOOK_RECENT_LIMIT)
}

export function addPresetColor(list: readonly string[], color: string): string[] {
  const hex = normalizeHex(color)
  if (!hex || BUILTIN_SET.has(hex) || list.includes(hex) || list.length >= NOTEBOOK_PRESET_LIMIT) return [...list]
  return [...list, hex]
}

export function removePresetColor(list: readonly string[], color: string): string[] {
  const hex = normalizeHex(color)
  return list.filter(item => item !== hex)
}

function normalizeColorList(raw: unknown, limit: number, exclude?: ReadonlySet<string>): string[] {
  if (!Array.isArray(raw)) return []
  const seen = new Set<string>()
  const result: string[] = []
  for (const item of raw) {
    if (typeof item !== 'string') continue
    const hex = normalizeHex(item)
    if (!hex || seen.has(hex) || exclude?.has(hex)) continue
    seen.add(hex)
    result.push(hex)
    if (result.length >= limit) break
  }
  return result
}

/** Returns `undefined` when the stored value is absent or not an object. */
export function normalizeNotebookPalette(raw: unknown): NotebookPalette | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined
  const value = raw as Partial<Record<keyof NotebookPalette, unknown>>
  return {
    presets: normalizeColorList(value.presets, NOTEBOOK_PRESET_LIMIT, BUILTIN_SET),
    recents: normalizeColorList(value.recents, NOTEBOOK_RECENT_LIMIT),
  }
}
