import { h, render } from 'vue'
import * as icons from './index'

export type UiIconName = keyof typeof icons

/** Mounts a registered icon into a plain DOM node and returns its cleanup. */
export function mountIcon(name: UiIconName, target: HTMLElement, size = 16): () => void {
  render(h(icons[name], { size, strokeWidth: 2 }), target)
  return () => render(null, target)
}

export function clearIcon(target: HTMLElement): void {
  render(null, target)
}
