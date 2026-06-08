import { ref, type Ref } from 'vue'
import type { Placement } from '../primitives/menu-types'

export interface PopupPosition {
  top: number
  left: number
  transformOrigin: string
}

export interface UsePopupPositionOptions {
  anchorRef: Ref<HTMLElement | null>
  popupRef: Ref<HTMLElement | null>
  placement?: Ref<Placement>
  offset?: Ref<[number, number]>
  viewportPadding?: number
}

export function usePopupPosition(opts: UsePopupPositionOptions) {
  const position = ref<PopupPosition>({ top: 0, left: 0, transformOrigin: 'top left' })

  function reposition() {
    const anchor = opts.anchorRef.value
    const popup = opts.popupRef.value
    if (!anchor || !popup) return

    const ar = anchor.getBoundingClientRect()
    const pr = popup.getBoundingClientRect()
    const placement = opts.placement?.value ?? 'bottom-start'
    const [offsetX, offsetY] = opts.offset?.value ?? [0, 6]
    const PAD = opts.viewportPadding ?? 12

    const W = window.innerWidth
    const H = window.innerHeight

    // Horizontal
    let idealLeft: number
    if (placement.endsWith('-end')) {
      idealLeft = ar.right - pr.width + offsetX
    } else if (placement === 'bottom') {
      idealLeft = ar.left + (ar.width - pr.width) / 2 + offsetX
    } else {
      idealLeft = ar.left + offsetX
    }
    const left = Math.max(PAD, Math.min(idealLeft, W - PAD - pr.width))

    // Vertical — prefer below, flip above if no room
    const spaceBelow = H - ar.bottom - PAD - offsetY
    const spaceAbove = ar.top - PAD - offsetY
    const openUpward =
      placement.startsWith('top') ||
      (placement === 'auto' && pr.height > spaceBelow && spaceAbove > spaceBelow)

    let top: number
    let originV: string
    if (openUpward) {
      top = ar.top - offsetY - pr.height
      originV = 'bottom'
    } else {
      top = ar.bottom + offsetY
      originV = 'top'
    }
    top = Math.max(PAD, Math.min(top, H - PAD - pr.height))

    const originH = placement.endsWith('-end') ? 'right' : 'left'
    position.value = { top, left, transformOrigin: `${originV} ${originH}` }
  }

  return { position, reposition }
}
