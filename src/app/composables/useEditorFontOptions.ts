import { computed } from 'vue'
import { useSystemFonts } from '../../composables/useSystemFonts'

export interface EditorFontOption {
  value: string
  label: string
  description: string
}

const PRESET_OPTIONS: EditorFontOption[] = [
  { value: 'ui', label: 'Geist', description: 'Sans-serif · App default' },
  { value: 'serif', label: 'Instrument Serif', description: 'Serif · Editorial' },
  { value: 'mono', label: 'Geist Mono', description: 'Monospace · Code-style' },
]

const PRESET_VALUES = new Set(PRESET_OPTIONS.map(option => option.value))

export function buildEditorFontOptions(systemFonts: readonly string[]): EditorFontOption[] {
  const system = systemFonts
    .filter(font => !PRESET_VALUES.has(font))
    .map(font => ({ value: font, label: font, description: 'System font' }))
  return [...PRESET_OPTIONS, ...system]
}

/** Editor font picker options: bundled presets followed by installed system fonts. */
export function useEditorFontOptions() {
  const { fonts } = useSystemFonts()
  return computed(() => buildEditorFontOptions(fonts.value))
}
