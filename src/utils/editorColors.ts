export interface EditorColor {
  color: string
  label: string
}

export const HIGHLIGHT_COLORS: EditorColor[] = [
  { color: '#fef08a', label: 'Yellow' },
  { color: '#bbf7d0', label: 'Green' },
  { color: '#bfdbfe', label: 'Blue' },
  { color: '#fde68a', label: 'Amber' },
  { color: '#fbcfe8', label: 'Pink' },
  { color: '#ddd6fe', label: 'Purple' },
  { color: '#fee2e2', label: 'Red' },
]

export const TEXT_COLORS: EditorColor[] = [
  { color: '#ef4444', label: 'Red' },
  { color: '#f97316', label: 'Orange' },
  { color: '#eab308', label: 'Yellow' },
  { color: '#22c55e', label: 'Green' },
  { color: '#3b82f6', label: 'Blue' },
  { color: '#a855f7', label: 'Purple' },
  { color: '#6b7280', label: 'Gray' },
]
