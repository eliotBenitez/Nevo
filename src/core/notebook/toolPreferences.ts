import { normalizeHex } from '../../utils/colorConversion'

/** Ranges match the notebook toolbar inputs and the stored-stroke validation. */
export const NOTEBOOK_STROKE_WIDTH_RANGE = { min: 0.25, max: 8 } as const
export const NOTEBOOK_MARKER_WIDTH_RANGE = { min: 2, max: 24 } as const

export const NOTEBOOK_TOOL_DEFAULTS = {
  penColor: '#000000',
  markerColor: '#f0c419',
  strokeWidth: 1.5,
  markerWidth: 12,
} as const

/**
 * Last chosen pen/marker settings, restored when any notebook opens. Every
 * field is optional: an absent field means "never changed", so the default applies.
 * `strokeWidth` is shared by the pen, line, arrow and shape tools.
 */
export interface NotebookToolPreferences {
  penColor?: string
  markerColor?: string
  strokeWidth?: number
  markerWidth?: number
}

export type NotebookToolSettings = Required<NotebookToolPreferences>

function normalizeWidth(value: unknown, range: { min: number; max: number }): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= range.min && value <= range.max ? value : null
}

function normalizeColor(value: unknown): string | null {
  return typeof value === 'string' ? normalizeHex(value) : null
}

/** Drops invalid or out-of-range fields; returns `undefined` for a missing or non-object value. */
export function normalizeNotebookToolPreferences(raw: unknown): NotebookToolPreferences | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined
  const value = raw as Record<string, unknown>
  const penColor = normalizeColor(value.penColor)
  const markerColor = normalizeColor(value.markerColor)
  const strokeWidth = normalizeWidth(value.strokeWidth, NOTEBOOK_STROKE_WIDTH_RANGE)
  const markerWidth = normalizeWidth(value.markerWidth, NOTEBOOK_MARKER_WIDTH_RANGE)
  return {
    ...(penColor ? { penColor } : {}),
    ...(markerColor ? { markerColor } : {}),
    ...(strokeWidth !== null ? { strokeWidth } : {}),
    ...(markerWidth !== null ? { markerWidth } : {}),
  }
}

/** Stored preferences with defaults filled in for anything never changed. */
export function resolveNotebookToolSettings(preferences: NotebookToolPreferences | undefined): NotebookToolSettings {
  return { ...NOTEBOOK_TOOL_DEFAULTS, ...normalizeNotebookToolPreferences(preferences) }
}
