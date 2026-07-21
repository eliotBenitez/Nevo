/** Fixed rotation of chip colors for select / multi_select field options. */
export const DB_OPTION_COLORS: readonly string[] = [
  '#e11d48',
  '#d97706',
  '#16a34a',
  '#0891b2',
  '#7c3aed',
  '#2563eb',
  '#65a30d',
  '#db2777',
]

export function nextOptionColor(existingCount: number): string {
  return DB_OPTION_COLORS[existingCount % DB_OPTION_COLORS.length]
}

export function optionChipColor(color: string | undefined): string {
  return color && color.trim() !== '' ? color : DB_OPTION_COLORS[0]
}
