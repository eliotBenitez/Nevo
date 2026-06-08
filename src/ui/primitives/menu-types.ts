import type { Component, InjectionKey } from 'vue'

export interface NvMenuItemDef {
  type?: 'item' | 'separator' | 'label'
  label?: string
  icon?: Component
  shortcut?: string
  danger?: boolean
  disabled?: boolean
  items?: NvMenuItemDef[]
  action?: () => void
}

export type Placement = 'bottom-start' | 'bottom-end' | 'bottom' | 'top-start' | 'top-end' | 'auto'

export interface NvMenuContext {
  closeAll: () => void
  closeMenuPanel: () => void
  depth: number
}

export const NvMenuContextKey: InjectionKey<NvMenuContext> = Symbol('NvMenuContext')
