export function formatNotebookNumber(value: number): string {
  if (!Number.isFinite(value)) throw new RangeError('Notebook vector coordinates must be finite.')
  const rounded = Number(value.toFixed(6))
  return Object.is(rounded, -0) ? '0' : String(rounded)
}
