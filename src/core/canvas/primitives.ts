/** Shared low-level value coercion helpers used by both the live normalizer
 *  (normalize.ts) and the legacy layout parser (legacy.ts). Kept dependency-free
 *  to avoid a circular import between those two modules. */

export const MAX_COORDINATE = 1_000_000
export const MAX_SIZE = 20_000
export const MIN_SIZE = 24
const SAFE_COLOR = /^(#[0-9a-f]{3,8}|(?:rgb|hsl)a?\([^)]{1,80}\)|[a-z]{1,24})$/i

export function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

export function text(value: unknown, maxLength = 10_000): string {
  return typeof value === 'string' ? value.slice(0, maxLength) : ''
}

export function finite(value: unknown, fallback = 0, min = -MAX_COORDINATE, max = MAX_COORDINATE): number {
  const number = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(number)) return fallback
  return Math.min(max, Math.max(min, number))
}

export function size(value: unknown, fallback: number): number {
  return finite(value, fallback, MIN_SIZE, MAX_SIZE)
}

export function optionalColor(value: unknown): string | undefined {
  const valueText = text(value, 100).trim()
  return valueText && SAFE_COLOR.test(valueText) ? valueText : undefined
}

export function optionalId(value: unknown): string | undefined {
  const valueText = text(value, 256).trim()
  return valueText || undefined
}
