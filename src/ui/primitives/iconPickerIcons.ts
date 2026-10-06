import type { Component } from 'vue'
import * as LucideIcons from '@lucide/vue'
import { humanizeLucideName, lucideTokenFromExportName } from '../../utils/noteIcon'

export interface SearchableIcon {
  exportName: string
  token: string
  label: string
  labelLower: string
  component: Component
}

function createIconCatalogue(): SearchableIcon[] {
  return Object.entries(LucideIcons)
    .filter(([name, icon]) => {
      if (!/^[A-Z]/.test(name)) return false
      if (name.endsWith('Icon')) return false
      // Lucide v1 exports a `LucideX` alias for every icon; skip those so the
      // catalogue does not list each glyph twice under a redundant prefix.
      if (name.startsWith('Lucide')) return false
      return typeof icon === 'object' || typeof icon === 'function'
    })
    .map(([name, icon]) => {
      const label = humanizeLucideName(name)

      return {
        exportName: name,
        token: lucideTokenFromExportName(name),
        label,
        labelLower: label.toLowerCase(),
        component: icon as Component,
      }
    })
    .sort((a, b) => a.label.localeCompare(b.label))
}

let searchableIcons: SearchableIcon[] | null = null

export function getSearchableIcons(): SearchableIcon[] {
  if (!searchableIcons) searchableIcons = createIconCatalogue()
  return searchableIcons
}
