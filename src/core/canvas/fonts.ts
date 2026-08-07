/** Canvas text elements store a font *key*, never a raw CSS font-family string.
 *  Snapshots are untrusted persisted input that ends up in SVG/HTML attributes
 *  and exported SVG, so an arbitrary string could inject CSS/markup through a
 *  `font-family` attribute. Only allowlisted keys ever reach rendering. */
export const CANVAS_FONT_FAMILIES = ['sans', 'serif', 'mono', 'handwriting'] as const

export type CanvasFontFamily = (typeof CANVAS_FONT_FAMILIES)[number]

const FONT_STACKS: Record<CanvasFontFamily, string> = {
  sans: '-apple-system, BlinkMacSystemFont, "Segoe UI", Inter, Roboto, "Helvetica Neue", Arial, sans-serif',
  serif: 'Georgia, "Times New Roman", Times, serif',
  mono: 'ui-monospace, Menlo, Consolas, "SFMono-Regular", monospace',
  handwriting: '"Segoe Script", "Bradley Hand", "Comic Sans MS", cursive',
}

export function isCanvasFontFamily(value: unknown): value is CanvasFontFamily {
  return typeof value === 'string' && (CANVAS_FONT_FAMILIES as readonly string[]).includes(value)
}

/** Total by construction: `normalizeCanvasSnapshot` already strips unknown
 *  keys, but this is called with whatever a snapshot carries, so an unmapped
 *  key resolves to the default stack rather than to `undefined`. */
export function canvasFontStack(family?: CanvasFontFamily): string {
  return (family && FONT_STACKS[family]) || FONT_STACKS.sans
}
