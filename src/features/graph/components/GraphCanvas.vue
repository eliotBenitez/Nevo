<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import type { GraphEdge, EdgeKind } from '../../../types/graph'
import type { SimNode } from '../composables/useGraphSimulation'
import type { CameraState } from '../composables/useGraphCamera'
import { nodeRadius } from '../composables/useGraphSimulation'

interface Props {
  nodes: SimNode[]
  edges: GraphEdge[]
  camera: CameraState
  hoveredNodeId?: string | null
  activeNodeId?: string | null
  focusedNodeId?: string | null
  focusedNeighborIds?: Set<string>
  showLabels: boolean
  showArrows?: boolean
  filters: Set<EdgeKind>
  searchQuery?: string
}

const props = defineProps<Props>()
const emit = defineEmits<{
  mousemove: [e: MouseEvent]
  mousedown: [e: MouseEvent]
  mouseup: [e: MouseEvent]
  mouseleave: [e: MouseEvent]
  dblclick: [e: MouseEvent]
  wheel: [e: WheelEvent]
}>()

const canvasRef = ref<HTMLCanvasElement | null>(null)
let rafId = 0
let running = true

function getVar(variable: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(variable).trim()
}

function hashColor(folderId: string | null): string {
  if (!folderId) return 'oklch(0.62 0.07 260)'
  let h = 0
  for (let i = 0; i < folderId.length; i++) h = (h * 31 + folderId.charCodeAt(i)) & 0xfffffff
  return `oklch(0.68 0.14 ${h % 360})`
}

function matchesSearch(node: SimNode): boolean {
  if (!props.searchQuery) return true
  return node.title.toLowerCase().includes(props.searchQuery.toLowerCase())
}

const EDGE_ALPHA: Record<EdgeKind, number> = { link: 0.35, embed: 0.22, mention: 0.18, parent: 0.18 }
const EDGE_ALPHA_HL: Record<EdgeKind, number> = { link: 0.85, embed: 0.65, mention: 0.55, parent: 0.55 }

function truncateLabel(label: string, maxLength = 24): string {
  if (label.length <= maxLength) return label
  return `${label.slice(0, maxLength - 1)}…`
}

function draw() {
  if (!running) return
  rafId = requestAnimationFrame(draw)

  const canvas = canvasRef.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  const { scale, tx, ty } = props.camera
  const dpr = window.devicePixelRatio || 1
  const hasSearch = !!props.searchQuery
  const focusActive = !!props.focusedNodeId
  const focusedNeighborIds = props.focusedNeighborIds ?? new Set<string>()

  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.save()
  ctx.scale(dpr, dpr)
  ctx.translate(tx, ty)
  ctx.scale(scale, scale)

  const nodeMap = new Map(props.nodes.map(n => [n.id, n]))
  const accentColor = getVar('--accent') || 'oklch(0.66 0.18 280)'
  const edgeBase = getVar('--text-4') || 'oklch(0.52 0.01 268)'
  const textColor = getVar('--text-1') || 'oklch(0.96 0 0)'
  const labelBorder = getVar('--line-2') || 'oklch(0.32 0.015 270)'
  const labelTextMuted = getVar('--text-2') || 'oklch(0.86 0.01 270)'
  const mutedRing = 'oklch(0.78 0.01 270 / 0.55)'

  function isFocusedNode(node: SimNode): boolean {
    return node.id === props.focusedNodeId
  }

  function isAdjacentNode(node: SimNode): boolean {
    return focusActive && focusedNeighborIds.has(node.id)
  }

  function isDimmedByFocus(node: SimNode): boolean {
    if (!focusActive) return false
    return !isFocusedNode(node) && !isAdjacentNode(node)
  }

  function isFocusedEdge(edge: GraphEdge): boolean {
    if (!focusActive || !props.focusedNodeId) return false
    return (edge.source === props.focusedNodeId && focusedNeighborIds.has(edge.target))
      || (edge.target === props.focusedNodeId && focusedNeighborIds.has(edge.source))
  }

  // --- 1. Glow halos (drawn behind edges) ---
  for (const node of props.nodes) {
    if (hasSearch && !matchesSearch(node)) continue
    const r = nodeRadius(node)
    const isActive = node.id === props.activeNodeId
    const isHovered = node.id === props.hoveredNodeId
    const isFocused = isFocusedNode(node)
    const isAdjacent = isAdjacentNode(node)
    const dimmed = isDimmedByFocus(node)
    const fillColor = isFocused || isActive ? accentColor : hashColor(node.folderId)
    const glowAlpha = dimmed ? 0.015 : isFocused ? 0.34 : isActive ? 0.24 : isHovered ? 0.2 : isAdjacent ? 0.12 : 0.05

    ctx.save()
    ctx.globalAlpha = glowAlpha
    ctx.beginPath()
    ctx.arc(node.x, node.y, r * (isFocused || isActive ? 4 : 3), 0, Math.PI * 2)
    ctx.fillStyle = fillColor
    ctx.fill()
    ctx.restore()
  }

  // --- 2. Edges ---
  for (const edge of props.edges) {
    if (!props.filters.has(edge.kind)) continue
    const src = nodeMap.get(edge.source)
    const tgt = nodeMap.get(edge.target)
    if (!src || !tgt) continue

    const isHL = !focusActive && (
      src.id === props.hoveredNodeId || tgt.id === props.hoveredNodeId ||
      src.id === props.activeNodeId || tgt.id === props.activeNodeId
    )
    const isFocused = isFocusedEdge(edge)
    const dimmedBySearch = hasSearch && !matchesSearch(src) && !matchesSearch(tgt)
    const dimmed = dimmedBySearch || (focusActive && !isFocused)

    ctx.save()
    ctx.globalAlpha = dimmed ? 0.04 : (isFocused ? 0.9 : isHL ? EDGE_ALPHA_HL[edge.kind] : EDGE_ALPHA[edge.kind])
    ctx.strokeStyle = isFocused || isHL ? accentColor : edgeBase
    ctx.lineWidth = (isFocused ? 1.8 : isHL ? 1.5 : 1) / scale

    if (props.showArrows) {
      const dx = tgt.x - src.x
      const dy = tgt.y - src.y
      const len = Math.hypot(dx, dy)
      if (len > 0) {
        const udx = dx / len
        const udy = dy / len
        const r = nodeRadius(tgt)
        const arrowDist = r + 2.5 / scale
        const tx = tgt.x - udx * arrowDist
        const ty = tgt.y - udy * arrowDist

        ctx.beginPath()
        ctx.moveTo(src.x, src.y)
        ctx.lineTo(tx, ty)
        if (edge.kind !== 'link') {
          ctx.setLineDash([4 / scale, 3 / scale])
        }
        ctx.stroke()
        ctx.setLineDash([])

        // Draw arrowhead
        const arrowSize = (isFocused || isHL ? 8.5 : 7.5) / Math.sqrt(scale)
        const angle = Math.atan2(dy, dx)
        ctx.beginPath()
        ctx.moveTo(tx, ty)
        ctx.lineTo(tx - arrowSize * Math.cos(angle - Math.PI / 5), ty - arrowSize * Math.sin(angle - Math.PI / 5))
        ctx.lineTo(tx - arrowSize * Math.cos(angle + Math.PI / 5), ty - arrowSize * Math.sin(angle + Math.PI / 5))
        ctx.closePath()
        ctx.fillStyle = isFocused || isHL ? accentColor : edgeBase
        ctx.fill()
      }
    } else {
      ctx.beginPath()
      ctx.moveTo(src.x, src.y)
      ctx.lineTo(tgt.x, tgt.y)
      if (edge.kind !== 'link') {
        ctx.setLineDash([4 / scale, 3 / scale])
      }
      ctx.stroke()
      ctx.setLineDash([])
    }
    ctx.restore()
  }

  // --- 3. Node fills ---
  for (const node of props.nodes) {
    const r = nodeRadius(node)
    const isActive = node.id === props.activeNodeId
    const isHovered = node.id === props.hoveredNodeId
    const isFocused = isFocusedNode(node)
    const isAdjacent = isAdjacentNode(node)
    const dimmedBySearch = hasSearch && !matchesSearch(node)
    const dimmed = dimmedBySearch || isDimmedByFocus(node)
    const fillColor = isFocused || isActive ? accentColor : hashColor(node.folderId)

    ctx.save()
    ctx.globalAlpha = dimmed ? 0.14 : isAdjacent ? 0.9 : 1

    // Shadow-like ring for depth
    ctx.beginPath()
    ctx.arc(node.x, node.y, r + 1.5 / scale, 0, Math.PI * 2)
    ctx.fillStyle = 'oklch(0 0 0 / 0.25)'
    ctx.fill()

    // Main fill
    ctx.beginPath()
    ctx.arc(node.x, node.y, r, 0, Math.PI * 2)
    ctx.fillStyle = fillColor
    ctx.fill()

    // Inner highlight
    ctx.beginPath()
    ctx.arc(node.x - r * 0.25, node.y - r * 0.3, r * 0.35, 0, Math.PI * 2)
    ctx.fillStyle = 'oklch(1 0 0 / 0.25)'
    ctx.fill()

    // Hover / active ring
    if (isFocused || isActive || isHovered || isAdjacent) {
      ctx.beginPath()
      ctx.arc(node.x, node.y, r + (isFocused ? 4.5 : 3.5) / scale, 0, Math.PI * 2)
      ctx.strokeStyle = isFocused || isActive ? accentColor : mutedRing
      ctx.lineWidth = (isFocused ? 2.4 : isAdjacent ? 1.6 : 2) / scale
      ctx.stroke()
    }

    if (isFocused) {
      ctx.beginPath()
      ctx.arc(node.x, node.y, r + 7 / scale, 0, Math.PI * 2)
      ctx.strokeStyle = 'oklch(0.94 0.03 270 / 0.5)'
      ctx.lineWidth = 1.2 / scale
      ctx.stroke()
    }

    ctx.restore()
  }

  // --- 4. Labels ---
  const labelFontSize = Math.max(11.5 / scale, 10.5)
  ctx.font = `600 ${labelFontSize}px var(--font-ui, system-ui, sans-serif)`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'

  for (const node of props.nodes) {
    const isHovered = node.id === props.hoveredNodeId
    const isActive = node.id === props.activeNodeId
    const isFocused = isFocusedNode(node)
    const isAdjacent = isAdjacentNode(node)
    const dimmed = (hasSearch && !matchesSearch(node)) || isDimmedByFocus(node)
    if (!props.showLabels && !isHovered && !isActive && !isFocused && !isAdjacent) continue
    if (dimmed) continue

    const r = nodeRadius(node)
    const label = truncateLabel(node.title || 'Untitled')
    const labelY = node.y + r + 9 / scale
    const textW = ctx.measureText(label).width
    const pillY = labelY - 4 / scale
    const isElevated = isFocused || isActive || isHovered

    // Connector stem
    ctx.save()
    ctx.globalAlpha = isElevated ? 0.38 : 0.22
    ctx.beginPath()
    ctx.moveTo(node.x, node.y + r + 1 / scale)
    ctx.lineTo(node.x, pillY + 2 / scale)
    ctx.strokeStyle = isFocused || isActive ? accentColor : labelBorder
    ctx.lineWidth = 1.1 / scale
    ctx.stroke()
    ctx.restore()

    if (isFocused || isActive) {
      ctx.save()
      ctx.globalAlpha = 0.95
      ctx.beginPath()
      ctx.arc(node.x - textW / 2 - 8 / scale, labelY + labelFontSize * 0.45, 2.4 / scale, 0, Math.PI * 2)
      ctx.fillStyle = accentColor
      ctx.fill()
      ctx.restore()
    }

    ctx.save()
    ctx.globalAlpha = dimmed ? 0.72 : 0.98
    ctx.shadowColor = isElevated ? 'oklch(0 0 0 / 0.35)' : 'oklch(0 0 0 / 0.22)'
    ctx.shadowBlur = (isElevated ? 10 : 6) / scale
    ctx.shadowOffsetY = 2 / scale
    ctx.fillStyle = isFocused || isActive ? accentColor : isHovered || isAdjacent ? labelTextMuted : textColor
    ctx.fillText(label, node.x, labelY)
    ctx.restore()
  }

  ctx.restore()
}

function resizeCanvas() {
  const canvas = canvasRef.value
  if (!canvas) return
  const dpr = window.devicePixelRatio || 1
  const rect = canvas.getBoundingClientRect()
  canvas.width = rect.width * dpr
  canvas.height = rect.height * dpr
}

const ro = new ResizeObserver(resizeCanvas)

onMounted(() => {
  if (canvasRef.value) { resizeCanvas(); ro.observe(canvasRef.value) }
  running = true
  rafId = requestAnimationFrame(draw)
})

onBeforeUnmount(() => {
  running = false
  cancelAnimationFrame(rafId)
  ro.disconnect()
})

defineExpose({ canvasRef })
</script>

<template>
  <canvas
    ref="canvasRef"
    class="graph-canvas"
    @mousemove="emit('mousemove', $event)"
    @mousedown="emit('mousedown', $event)"
    @mouseup="emit('mouseup', $event)"
    @mouseleave="emit('mouseleave', $event)"
    @dblclick="emit('dblclick', $event)"
    @wheel.prevent="emit('wheel', $event)"
  />
</template>
