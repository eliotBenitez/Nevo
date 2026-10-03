import type { SlashMenuLayout } from '../types/workspace'

/** Shared by the CSS grids and the editor-core arrow-key navigation. */
export const SLASH_LAYOUT_COLUMNS = { list: 0, grid: 4, preview: 3 } as const

/** Column count handed to the slash plugin: `0` means the vertical list. */
export function slashGridColumns(layout: SlashMenuLayout | undefined): number {
  return layout && layout in SLASH_LAYOUT_COLUMNS ? SLASH_LAYOUT_COLUMNS[layout] : 0
}
