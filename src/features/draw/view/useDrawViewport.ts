import { ref, computed, watch, type ShallowRef } from 'vue'

export interface DrawViewportOptions {
  overlayEl: ShallowRef<SVGSVGElement | null>
  cameraViewBox: (w: number, h: number) => string
  cameraX: () => number
  cameraY: () => number
}

export const GRID_CELL = 40

export function useDrawViewport(options: DrawViewportOptions) {
  const viewport = ref({ w: 1600, h: 1000 })
  let resizeObserver: ResizeObserver | null = null

  function measureViewport() {
    const rect = options.overlayEl.value?.getBoundingClientRect()
    if (rect && rect.width > 0 && rect.height > 0) {
      viewport.value = { w: rect.width, h: rect.height }
    }
  }

  const viewBox = computed(() => options.cameraViewBox(viewport.value.w, viewport.value.h))

  const gridOffset = computed(() => {
    const mod = (v: number) => ((v % GRID_CELL) + GRID_CELL) % GRID_CELL
    return { x: mod(options.cameraX()), y: mod(options.cameraY()) }
  })

  watch(options.overlayEl, (el) => {
    resizeObserver?.disconnect()
    resizeObserver = null
    if (el && typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => measureViewport())
      resizeObserver.observe(el)
    }
  })

  function disconnect() {
    resizeObserver?.disconnect()
    resizeObserver = null
  }

  return {
    viewport,
    measureViewport,
    viewBox,
    gridOffset,
    disconnect,
  }
}
