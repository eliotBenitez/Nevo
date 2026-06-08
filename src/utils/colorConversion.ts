/** Pure colour helpers extracted from NvColorPicker — hex normalisation,
 *  equality, and HEX⇄RGB⇄HSV conversions. Importable and unit-testable. */

export interface ColorOption {
  color: string
  label?: string
  id?: string
}

export const DEFAULT_CUSTOM = '#7c3aed'

export const NEUTRAL_COLORS: ColorOption[] = [
  { color: '#ffffff', label: 'White' },
  { color: '#f3f4f6', label: 'Light Gray' },
  { color: '#9ca3af', label: 'Gray' },
  { color: '#4b5563', label: 'Dark Gray' },
  { color: '#1f2937', label: 'Near Black' },
  { color: '#000000', label: 'Black' },
]

export function normalizeHex(value: string | null | undefined): string | null {
  if (!value) return null
  const trimmed = value.trim()
  const withHash = trimmed.startsWith('#') ? trimmed : `#${trimmed}`

  if (/^#[0-9a-fA-F]{3}$/.test(withHash)) {
    const [, r, g, b] = withHash
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase()
  }

  if (/^#[0-9a-fA-F]{6}$/.test(withHash)) {
    return withHash.toLowerCase()
  }

  return null
}

export function colorsMatch(left: string | null, right: string | null): boolean {
  if (!left || !right) return left === right
  const leftHex = normalizeHex(left)
  const rightHex = normalizeHex(right)
  if (leftHex && rightHex) return leftHex === rightHex
  return left === right
}

export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const normalized = normalizeHex(hex) ?? DEFAULT_CUSTOM
  return {
    r: Number.parseInt(normalized.slice(1, 3), 16),
    g: Number.parseInt(normalized.slice(3, 5), 16),
    b: Number.parseInt(normalized.slice(5, 7), 16),
  }
}

export function rgbToHex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map(channel => Math.round(channel).toString(16).padStart(2, '0')).join('')}`
}

export function rgbToHsv(hex: string): { h: number; s: number; v: number } {
  const { r, g, b } = hexToRgb(hex)
  const red = r / 255
  const green = g / 255
  const blue = b / 255
  const max = Math.max(red, green, blue)
  const min = Math.min(red, green, blue)
  const delta = max - min

  let h = 0
  if (delta !== 0) {
    if (max === red) h = ((green - blue) / delta) % 6
    else if (max === green) h = (blue - red) / delta + 2
    else h = (red - green) / delta + 4
    h *= 60
    if (h < 0) h += 360
  }

  return {
    h,
    s: max === 0 ? 0 : (delta / max) * 100,
    v: max * 100,
  }
}

export function hsvToHex(h: number, s: number, v: number): string {
  const saturationRatio = s / 100
  const valueRatio = v / 100
  const chroma = valueRatio * saturationRatio
  const huePrime = h / 60
  const x = chroma * (1 - Math.abs((huePrime % 2) - 1))
  const m = valueRatio - chroma
  let red = 0
  let green = 0
  let blue = 0

  if (huePrime >= 0 && huePrime < 1) [red, green, blue] = [chroma, x, 0]
  else if (huePrime < 2) [red, green, blue] = [x, chroma, 0]
  else if (huePrime < 3) [red, green, blue] = [0, chroma, x]
  else if (huePrime < 4) [red, green, blue] = [0, x, chroma]
  else if (huePrime < 5) [red, green, blue] = [x, 0, chroma]
  else [red, green, blue] = [chroma, 0, x]

  return rgbToHex((red + m) * 255, (green + m) * 255, (blue + m) * 255)
}
