export const GLYPH_PREFIX = 'glyph:'

export interface WorkspaceGlyph {
  id: string
  label: string
  paths: string[]
}

// Curated set of abstract geometric brand marks for the workspace glyph picker.
// Each `paths` entry is stroke-style SVG path `d` data drawn for a 0 0 24 24
// viewBox (fill none, stroke currentColor, width 2, round caps/joins),
// matching the Lucide icon aesthetic used elsewhere in the app.
export const WORKSPACE_GLYPHS: WorkspaceGlyph[] = [
  {
    id: 'orbit',
    label: 'Orbit',
    paths: [
      'M20,12 A8,5 0 1,0 4,12 A8,5 0 1,0 20,12',
      'M14,12 A2,2 0 1,0 10,12 A2,2 0 1,0 14,12',
    ],
  },
  {
    id: 'prism',
    label: 'Prism',
    paths: [
      'M12,4 L20,18 L4,18 Z',
      'M12,4 L12,18',
    ],
  },
  {
    id: 'hexagon',
    label: 'Hexagon',
    paths: [
      'M12,4 L18.9,8 L18.9,16 L12,20 L5.1,16 L5.1,8 Z',
    ],
  },
  {
    id: 'crescent',
    label: 'Crescent',
    paths: [
      'M15,4 A8,8 0 1,0 15,20 A6,6 0 1,1 15,4 Z',
    ],
  },
  {
    id: 'compass',
    label: 'Compass',
    paths: [
      'M20,12 A8,8 0 1,0 4,12 A8,8 0 1,0 20,12',
      'M12,7 L14.5,12 L12,17 L9.5,12 Z',
    ],
  },
  {
    id: 'spark',
    label: 'Spark',
    paths: [
      'M12,3 L13.5,10.5 L21,12 L13.5,13.5 L12,21 L10.5,13.5 L3,12 L10.5,10.5 Z',
    ],
  },
  {
    id: 'layers',
    label: 'Layers',
    paths: [
      'M12,4 L20,8 L12,12 L4,8 Z',
      'M4,12 L12,16 L20,12',
      'M4,16 L12,20 L20,16',
    ],
  },
  {
    id: 'waveform',
    label: 'Waveform',
    paths: [
      'M5,9 L5,15',
      'M9.5,5 L9.5,19',
      'M14.5,7 L14.5,17',
      'M19,9 L19,15',
    ],
  },
  {
    id: 'beacon',
    label: 'Beacon',
    paths: [
      'M12,4 L20,19 L4,19 Z',
      'M9,10 L15,10',
    ],
  },
  {
    id: 'nexus',
    label: 'Nexus',
    paths: [
      'M9,7 A2,2 0 1,0 5,7 A2,2 0 1,0 9,7',
      'M19,7 A2,2 0 1,0 15,7 A2,2 0 1,0 19,7',
      'M14,18 A2,2 0 1,0 10,18 A2,2 0 1,0 14,18',
      'M7,9 L11,16 M17,9 L13,16 M9,7 L15,7',
    ],
  },
  {
    id: 'aperture',
    label: 'Aperture',
    paths: [
      'M20,12 A8,8 0 1,0 4,12 A8,8 0 1,0 20,12',
      'M12,5 L12,10 M18.3,15.5 L14,13 M5.7,15.5 L10,13',
    ],
  },
  {
    id: 'lattice',
    label: 'Lattice',
    paths: [
      'M12,4 L20,12 L12,20 L4,12 Z',
      'M12,8 L16,12 L12,16 L8,12 Z',
    ],
  },
  {
    id: 'helix',
    label: 'Helix',
    paths: [
      'M7,4 C7,9 17,9 17,12 C17,15 7,15 7,20',
      'M17,4 C17,9 7,9 7,12 C7,15 17,15 17,20',
    ],
  },
  {
    id: 'quartz',
    label: 'Quartz',
    paths: [
      'M12,3 L17,8 L12,10 L7,8 Z',
      'M12,10 L20,14 L12,21 L4,14 Z',
    ],
  },
  {
    id: 'arc-flow',
    label: 'Arc Flow',
    paths: [
      'M5,17 A10,10 0 0,1 19,7',
      'M6.5,17 A1.5,1.5 0 1,0 3.5,17 A1.5,1.5 0 1,0 6.5,17',
      'M20.5,7 A1.5,1.5 0 1,0 17.5,7 A1.5,1.5 0 1,0 20.5,7',
    ],
  },
  {
    id: 'bastion',
    label: 'Bastion',
    paths: [
      'M12,3 L21,12 L12,21 L3,12 Z',
      'M9,9 L15,9 L15,15 L9,15 Z',
    ],
  },
  {
    id: 'pulse',
    label: 'Pulse',
    paths: [
      'M3,12 L8,12 L10,6 L14,18 L16,12 L21,12',
    ],
  },
  {
    id: 'horizon',
    label: 'Horizon',
    paths: [
      'M3,16 L21,16',
      'M7,16 A5,5 0 0,1 17,16',
    ],
  },
]

export function glyphToken(id: string): string {
  return `${GLYPH_PREFIX}${id}`
}

export function isGlyphToken(value: string | null | undefined): boolean {
  if (typeof value !== 'string') return false
  return value.startsWith(GLYPH_PREFIX)
}

export function getGlyphId(value: string | null | undefined): string | null {
  if (!isGlyphToken(value) || typeof value !== 'string') return null
  const raw = value.slice(GLYPH_PREFIX.length).trim()
  return raw || null
}

export function getGlyphDef(value: string | null | undefined): WorkspaceGlyph | null {
  if (typeof value !== 'string') return null
  const id = isGlyphToken(value) ? getGlyphId(value) : value.trim()
  if (!id) return null
  return WORKSPACE_GLYPHS.find((glyph) => glyph.id === id) ?? null
}
