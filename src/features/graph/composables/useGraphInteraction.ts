import { ref } from 'vue'
import type { Ref } from 'vue'
import type { SimNode } from './useGraphSimulation'
import type { CameraState } from './useGraphCamera'
import { nodeRadius } from './useGraphSimulation'

export function useGraphInteraction(
  canvasRef: Ref<HTMLCanvasElement | null>,
  nodes: Ref<SimNode[]>,
  camera: Ref<CameraState>,
  emit: {
    select: (node: SimNode) => void
    open: (node: SimNode) => void
  },
  pinNode: (id: string, x: number, y: number) => void,
  unpinNode: (id: string) => void,
  onWheel: (e: WheelEvent) => void,
  onPan: (dx: number, dy: number) => void,
) {
  const hoveredNode = ref<SimNode | null>(null)
  const dragNode = ref<SimNode | null>(null)

  let isPanning = false
  let lastPanX = 0
  let lastPanY = 0
  let dragStarted = false

  function hitTest(screenX: number, screenY: number): SimNode | null {
    const { scale, tx, ty } = camera.value
    const wx = (screenX - tx) / scale
    const wy = (screenY - ty) / scale
    for (let i = nodes.value.length - 1; i >= 0; i--) {
      const n = nodes.value[i]
      const r = nodeRadius(n) + 4
      if ((wx - n.x) ** 2 + (wy - n.y) ** 2 <= r * r) return n
    }
    return null
  }

  function onMouseMove(e: MouseEvent) {
    if (!canvasRef.value) return

    if (dragNode.value) {
      dragStarted = true
      const { scale, tx, ty } = camera.value
      const wx = (e.offsetX - tx) / scale
      const wy = (e.offsetY - ty) / scale
      pinNode(dragNode.value.id, wx, wy)
      return
    }

    if (isPanning) {
      onPan(e.offsetX - lastPanX, e.offsetY - lastPanY)
      lastPanX = e.offsetX
      lastPanY = e.offsetY
      return
    }

    const hit = hitTest(e.offsetX, e.offsetY)
    hoveredNode.value = hit
    canvasRef.value.style.cursor = hit ? 'pointer' : 'grab'
  }

  function onMouseDown(e: MouseEvent) {
    if (e.button !== 0) return
    dragStarted = false

    const hit = hitTest(e.offsetX, e.offsetY)
    if (hit) {
      dragNode.value = hit
    } else {
      isPanning = true
      lastPanX = e.offsetX
      lastPanY = e.offsetY
      if (canvasRef.value) canvasRef.value.style.cursor = 'grabbing'
    }
  }

  function onMouseUp(_e: MouseEvent) {
    if (dragNode.value) {
      if (!dragStarted) {
        emit.select(dragNode.value)
      }
      unpinNode(dragNode.value.id)
      dragNode.value = null
    }
    isPanning = false
    if (canvasRef.value) canvasRef.value.style.cursor = hoveredNode.value ? 'pointer' : 'grab'
  }

  function onMouseLeave() {
    isPanning = false
    dragNode.value = null
    hoveredNode.value = null
    if (canvasRef.value) canvasRef.value.style.cursor = 'grab'
  }

  function onDblClick(e: MouseEvent) {
    const hit = hitTest(e.offsetX, e.offsetY)
    if (hit) emit.open(hit)
  }

  return { hoveredNode, onMouseMove, onMouseDown, onMouseUp, onMouseLeave, onDblClick, onWheel }
}
