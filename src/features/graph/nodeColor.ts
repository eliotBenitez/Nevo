function hash(value: string): number {
  let h = 0
  for (let i = 0; i < value.length; i++) h = (h * 31 + value.charCodeAt(i)) & 0xfffffff
  return h
}

const LIGHTNESS = [0.58, 0.67, 0.76]

// The folder picks the hue family; each note shifts hue and lightness inside it,
// so a large folder no longer renders as one solid blob of identical circles.
export function graphNodeColor(nodeId: string, folderId: string | null): string {
  const n = hash(nodeId)
  const hueShift = ((n % 9) - 4) * 11
  const lightness = LIGHTNESS[(n >>> 5) % LIGHTNESS.length]
  if (!folderId) return `oklch(${lightness} 0.09 ${260 + hueShift})`
  return `oklch(${lightness} 0.15 ${(hash(folderId) + hueShift + 360) % 360})`
}
