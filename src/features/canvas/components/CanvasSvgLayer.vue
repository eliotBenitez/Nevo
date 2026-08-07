<script setup lang="ts">
import { computed } from 'vue'
import {
  canvasFontStack,
  connectorMidpoint,
  connectorPath,
  canvasRichTextLines,
  strokeOutlinePath,
  type CanvasCamera,
  type CanvasConnector,
  type CanvasConnectorEndpoint,
  type CanvasElement,
  type CanvasSnapshotV1,
} from '../../../core/canvas'
import type { CanvasCreationDraft } from '../composables/useCanvasCreationGestures'

const props = defineProps<{
  snapshot: CanvasSnapshotV1
  camera: CanvasCamera
  viewportWidth: number
  viewportHeight: number
  selectedIds: readonly string[]
  drafts?: Readonly<Record<string, Partial<CanvasElement>>>
  connectorDrafts?: Readonly<Record<string, Partial<CanvasConnector>>>
  creationDraft?: CanvasCreationDraft | null
  /** In-flight quick-connect drag from an anchor dot; carries the active
   *  connector tool style so the preview matches what will actually be created. */
  connectDraft?: ({ from: CanvasConnectorEndpoint; to: CanvasConnectorEndpoint } & Pick<CanvasConnector, 'color' | 'width' | 'routing' | 'startCap' | 'endCap'>) | null
  connectTargetId?: string
  resolveAssetSrc?: (src: string) => string | null
  assetRefreshToken?: number
  notes?: readonly { id: string; title: string; icon?: string }[]
}>()

defineEmits<{
  select: [id: string, additive: boolean]
  interact: [id: string, event: PointerEvent]
  edit: [id: string]
}>()

const viewBox = computed(() => [
  props.camera.x,
  props.camera.y,
  props.viewportWidth / props.camera.zoom,
  props.viewportHeight / props.camera.zoom,
].join(' '))

const orderedElements = computed(() => Object.values(props.snapshot.elements).sort((a, b) => a.zIndex - b.zIndex))
const orderedConnectors = computed(() => Object.values(props.snapshot.connectors).sort((a, b) => a.zIndex - b.zIndex))

function displayElement(element: CanvasElement): CanvasElement {
  return { ...element, ...props.drafts?.[element.id] } as CanvasElement
}

function displayConnector(connector: CanvasConnector): CanvasConnector {
  return { ...connector, ...props.connectorDrafts?.[connector.id] }
}

function connectorMarker(connector: CanvasConnector, endpoint: 'start' | 'end'): string | undefined {
  const cap = endpoint === 'start' ? connector.startCap ?? 'none' : connector.endCap ?? 'arrow'
  if (cap === 'arrow') return 'url(#canvas-arrowhead)'
  if (cap === 'dot') return 'url(#canvas-dot)'
  return undefined
}

function textLines(element: CanvasElement): string[] {
  const value = element.kind === 'text' || element.kind === 'shape' ? element.text ?? '' : ''
  return value.split('\n')
}

function textAnchor(element: CanvasElement) {
  if (element.style?.textAlign === 'left') return 'start'
  if (element.style?.textAlign === 'right') return 'end'
  return 'middle'
}

function textX(element: CanvasElement) {
  if (element.style?.textAlign === 'left') return 10
  if (element.style?.textAlign === 'right') return displayElement(element).width - 10
  return displayElement(element).width / 2
}

function resolvedAsset(src: string): string {
  void props.assetRefreshToken
  return props.resolveAssetSrc?.(src) ?? src
}

function linkedNote(element: Extract<CanvasElement, { kind: 'note-link' }>) {
  return props.notes?.find(note => note.id === element.noteId)
}

function strokePath(element: CanvasElement): string {
  if (element.kind !== 'freehand' && element.kind !== 'highlighter') return ''
  return strokeOutlinePath(
    element.points.map(point => ({ ...point, x: point.x - element.x, y: point.y - element.y })),
    element.style?.strokeWidth ?? (element.kind === 'highlighter' ? 14 : 3),
    element.kind === 'highlighter',
  )
}

function richPrefix(type: string, checked?: boolean, index = 0): string {
  if (type === 'bullet') return '• '
  if (type === 'number') return `${index + 1}. `
  if (type === 'todo') return checked ? '☑ ' : '☐ '
  if (type === 'quote') return '│ '
  return ''
}

function richFontSize(type: string, level?: number): number {
  if (type !== 'heading') return 15
  if (level === 1) return 24
  if (level === 2) return 20
  return 17
}

function richLineY(element: CanvasElement, index: number): number {
  if (element.kind !== 'note') return 0
  return canvasRichTextLines(element.content).slice(0, index)
    .reduce((y, block) => y + richFontSize(block.type, block.level) * 1.45, 34)
}
</script>

<template>
  <svg
    class="canvas-svg-layer"
    :viewBox="viewBox"
    :width="viewportWidth"
    :height="viewportHeight"
    preserveAspectRatio="none"
    aria-hidden="true"
  >
    <defs>
      <marker id="canvas-arrowhead" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
        <path d="M 0 0 L 10 5 L 0 10 z" fill="context-stroke" />
      </marker>
      <marker id="canvas-dot" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6">
        <circle cx="5" cy="5" r="4" fill="context-stroke" />
      </marker>
    </defs>

    <g class="canvas-svg-layer__connectors">
      <g
        v-for="connectorSource in orderedConnectors"
        :key="connectorSource.id"
        class="canvas-svg-connector"
        :class="{ 'canvas-svg-connector--selected': selectedIds.includes(connectorSource.id) }"
        @pointerdown.stop="$emit('select', connectorSource.id, $event.shiftKey)"
        @dblclick.stop="$emit('edit', connectorSource.id)"
      >
        <path
          class="canvas-svg-connector__hit"
          :d="connectorPath(displayConnector(connectorSource).from, displayConnector(connectorSource).to, displayConnector(connectorSource).routing)"
          fill="none"
          stroke="transparent"
          stroke-width="14"
        />
        <path
          :d="connectorPath(displayConnector(connectorSource).from, displayConnector(connectorSource).to, displayConnector(connectorSource).routing)"
          fill="none"
          :stroke="connectorSource.color || 'var(--text-3)'"
          :stroke-width="connectorSource.width || 2"
          :marker-start="connectorMarker(connectorSource, 'start')"
          :marker-end="connectorMarker(connectorSource, 'end')"
        />
        <text
          v-if="connectorSource.label"
          :x="connectorMidpoint(displayConnector(connectorSource).from, displayConnector(connectorSource).to).x"
          :y="connectorMidpoint(displayConnector(connectorSource).from, displayConnector(connectorSource).to).y - 8"
          text-anchor="middle"
          fill="var(--text-primary)"
          font-size="14"
        >{{ connectorSource.label }}</text>
      </g>
    </g>

    <g class="canvas-svg-layer__elements">
      <g
        v-for="elementSource in orderedElements"
        :key="elementSource.id"
        class="canvas-svg-element"
        :class="{
          'canvas-svg-element--selected': selectedIds.includes(elementSource.id),
          'canvas-svg-element--locked': elementSource.locked,
          'canvas-svg-element--connect-target': elementSource.id === connectTargetId,
        }"
        :opacity="elementSource.style?.opacity ?? 1"
        :transform="`translate(${displayElement(elementSource).x} ${displayElement(elementSource).y}) rotate(${displayElement(elementSource).rotation || 0} ${displayElement(elementSource).width / 2} ${displayElement(elementSource).height / 2})`"
        @pointerdown.stop="$emit('interact', elementSource.id, $event)"
        @dblclick.stop="$emit('edit', elementSource.id)"
      >
        <rect
          v-if="elementSource.kind === 'shape' && elementSource.shape === 'rectangle'"
          :width="displayElement(elementSource).width"
          :height="displayElement(elementSource).height"
          rx="12"
          :fill="elementSource.style?.fill || 'var(--canvas-1)'"
          :stroke="elementSource.style?.stroke || 'var(--line-strong)'"
          :stroke-width="elementSource.style?.strokeWidth || 2"
        />
        <ellipse
          v-else-if="elementSource.kind === 'shape' && elementSource.shape === 'ellipse'"
          :cx="displayElement(elementSource).width / 2"
          :cy="displayElement(elementSource).height / 2"
          :rx="displayElement(elementSource).width / 2"
          :ry="displayElement(elementSource).height / 2"
          :fill="elementSource.style?.fill || 'var(--canvas-1)'"
          :stroke="elementSource.style?.stroke || 'var(--line-strong)'"
          :stroke-width="elementSource.style?.strokeWidth || 2"
        />
        <path
          v-else-if="elementSource.kind === 'shape'"
          :d="`M ${displayElement(elementSource).width / 2} 0 L ${displayElement(elementSource).width} ${displayElement(elementSource).height / 2} L ${displayElement(elementSource).width / 2} ${displayElement(elementSource).height} L 0 ${displayElement(elementSource).height / 2} Z`"
          :fill="elementSource.style?.fill || 'var(--canvas-1)'"
          :stroke="elementSource.style?.stroke || 'var(--line-strong)'"
          :stroke-width="elementSource.style?.strokeWidth || 2"
        />
        <path
          v-else-if="elementSource.kind === 'freehand' || elementSource.kind === 'highlighter'"
          :d="strokePath(elementSource)"
          :fill="elementSource.style?.stroke || (elementSource.kind === 'highlighter' ? '#facc15' : 'var(--text-primary)')"
          :fill-opacity="elementSource.style?.opacity ?? (elementSource.kind === 'highlighter' ? 0.45 : 1)"
        />
        <image
          v-else-if="elementSource.kind === 'image'"
          :href="resolvedAsset(elementSource.src)"
          :width="displayElement(elementSource).width"
          :height="displayElement(elementSource).height"
          preserveAspectRatio="xMidYMid meet"
        />
        <template v-else-if="elementSource.kind === 'note'">
          <rect
            :width="displayElement(elementSource).width"
            :height="displayElement(elementSource).height"
            rx="14"
            :fill="elementSource.style?.fill || '#fff8c5'"
            :stroke="elementSource.style?.stroke || '#e6c84f'"
            :stroke-width="elementSource.style?.strokeWidth || 1"
          />
          <text
            v-for="(block, blockIndex) in canvasRichTextLines(elementSource.content).slice(0, 18)"
            :key="blockIndex"
            x="18"
            :y="richLineY(elementSource, blockIndex)"
            :fill="elementSource.style?.textColor || '#2b2615'"
            :font-size="richFontSize(block.type, block.level)"
          >
            <tspan v-if="richPrefix(block.type, block.checked, blockIndex)">{{ richPrefix(block.type, block.checked, blockIndex) }}</tspan>
            <tspan
              v-for="(span, spanIndex) in block.spans"
              :key="spanIndex"
              :font-weight="span.marks?.includes('bold') ? 700 : undefined"
              :font-style="span.marks?.includes('italic') ? 'italic' : undefined"
              :font-family="span.marks?.includes('code') ? 'monospace' : undefined"
              :text-decoration="[
                span.marks?.includes('underline') ? 'underline' : '',
                span.marks?.includes('strike') ? 'line-through' : '',
              ].filter(Boolean).join(' ') || undefined"
            >{{ span.text }}</tspan>
          </text>
        </template>
        <template v-else-if="elementSource.kind === 'note-link'">
          <rect
            :width="displayElement(elementSource).width"
            :height="displayElement(elementSource).height"
            rx="14"
            :fill="elementSource.style?.fill || 'var(--canvas-1)'"
            :stroke="elementSource.style?.stroke || 'var(--line-strong)'"
            :stroke-width="elementSource.style?.strokeWidth || 1"
          />
          <text x="18" y="35" font-size="22">{{ linkedNote(elementSource)?.icon || elementSource.icon || '📄' }}</text>
          <text x="54" y="34" fill="var(--text-primary)" font-size="16" font-weight="700">{{ linkedNote(elementSource)?.title || elementSource.title }}</text>
          <text x="54" y="62" fill="var(--text-secondary)" font-size="12">{{ elementSource.noteId }}</text>
          <path
            :d="`M ${displayElement(elementSource).width - 32} 45 l 8 7 -8 7`"
            fill="none"
            stroke="var(--text-secondary)"
            stroke-width="2"
          />
        </template>
        <template v-else-if="elementSource.kind === 'frame'">
          <rect
            :width="displayElement(elementSource).width"
            :height="displayElement(elementSource).height"
            rx="10"
            :fill="elementSource.style?.fill || 'transparent'"
            :stroke="elementSource.style?.stroke || 'var(--accent)'"
            :stroke-width="elementSource.style?.strokeWidth || 2"
            stroke-dasharray="10 6"
          />
          <rect
            :width="Math.min(displayElement(elementSource).width, 260)"
            height="34"
            rx="10"
            :fill="elementSource.style?.stroke || 'var(--accent)'"
          />
          <text x="14" y="22" fill="white" font-size="13" font-weight="700">
            {{ elementSource.presentationOrder + 1 }}. {{ elementSource.title }}
          </text>
        </template>
        <!-- Text glyphs alone are not a usable drag target: SVG hit-testing on
             <text> only hits rendered ink, so clicks in the empty box area
             would fall through to the canvas background. -->
        <rect
          v-if="elementSource.kind === 'text'"
          :width="displayElement(elementSource).width"
          :height="displayElement(elementSource).height"
          fill="none"
          pointer-events="all"
        />
        <text
          v-if="elementSource.kind === 'text' || (elementSource.kind === 'shape' && elementSource.text)"
          :x="textX(elementSource)"
          :y="displayElement(elementSource).height / 2 - (textLines(elementSource).length - 1) * (elementSource.style?.fontSize || 16) * 0.65"
          :text-anchor="textAnchor(elementSource)"
          dominant-baseline="middle"
          :fill="elementSource.style?.textColor || 'var(--text-primary)'"
          :font-size="elementSource.style?.fontSize || 16"
          :font-family="canvasFontStack(elementSource.style?.fontFamily)"
        >
          <tspan
            v-for="(line, index) in textLines(elementSource)"
            :key="index"
            :x="textX(elementSource)"
            :dy="index === 0 ? 0 : (elementSource.style?.fontSize || 16) * 1.3"
          >{{ line }}</tspan>
        </text>
      </g>
    </g>

    <g v-if="creationDraft" class="canvas-svg-draft">
      <rect
        v-if="creationDraft.kind === 'shape' && creationDraft.shape === 'rectangle'"
        v-bind="creationDraft.bounds"
        rx="12"
        :fill="creationDraft.style.fill"
        :stroke="creationDraft.style.stroke"
        :stroke-width="creationDraft.style.strokeWidth"
      />
      <ellipse
        v-else-if="creationDraft.kind === 'shape' && creationDraft.shape === 'ellipse'"
        :cx="creationDraft.bounds.x + creationDraft.bounds.width / 2"
        :cy="creationDraft.bounds.y + creationDraft.bounds.height / 2"
        :rx="creationDraft.bounds.width / 2"
        :ry="creationDraft.bounds.height / 2"
        :fill="creationDraft.style.fill"
        :stroke="creationDraft.style.stroke"
        :stroke-width="creationDraft.style.strokeWidth"
      />
      <path
        v-else-if="creationDraft.kind === 'shape'"
        :d="`M ${creationDraft.bounds.x + creationDraft.bounds.width / 2} ${creationDraft.bounds.y} L ${creationDraft.bounds.x + creationDraft.bounds.width} ${creationDraft.bounds.y + creationDraft.bounds.height / 2} L ${creationDraft.bounds.x + creationDraft.bounds.width / 2} ${creationDraft.bounds.y + creationDraft.bounds.height} L ${creationDraft.bounds.x} ${creationDraft.bounds.y + creationDraft.bounds.height / 2} Z`"
        :fill="creationDraft.style.fill"
        :stroke="creationDraft.style.stroke"
        :stroke-width="creationDraft.style.strokeWidth"
      />
      <rect
        v-else-if="creationDraft.kind === 'text'"
        v-bind="creationDraft.bounds"
        fill="color-mix(in srgb, var(--accent) 8%, transparent)"
        stroke="var(--accent)"
        stroke-dasharray="5 4"
      />
      <g v-else-if="creationDraft.kind === 'frame'">
        <rect
          v-bind="creationDraft.bounds"
          fill="color-mix(in srgb, var(--accent) 5%, transparent)"
          stroke="var(--accent)"
          stroke-width="2"
          stroke-dasharray="10 6"
          rx="10"
        />
      </g>
      <path
        v-else-if="creationDraft.kind === 'stroke'"
        :d="strokeOutlinePath(creationDraft.points, creationDraft.style.strokeWidth || 3, creationDraft.tool === 'highlighter')"
        :fill="creationDraft.style.stroke"
        :fill-opacity="creationDraft.style.opacity"
      />
      <path
        v-else-if="creationDraft.kind === 'connector'"
        :d="connectorPath(creationDraft.connector.from, creationDraft.connector.to, creationDraft.connector.routing)"
        fill="none"
        :stroke="creationDraft.connector.color"
        :stroke-width="creationDraft.connector.width"
        :marker-start="connectorMarker(creationDraft.connector as CanvasConnector, 'start')"
        :marker-end="connectorMarker(creationDraft.connector as CanvasConnector, 'end')"
      />
      <circle
        v-else-if="creationDraft.kind === 'eraser'"
        :cx="creationDraft.point.x"
        :cy="creationDraft.point.y"
        :r="creationDraft.radius"
        fill="color-mix(in srgb, var(--danger) 12%, transparent)"
        stroke="var(--danger)"
        :stroke-width="1 / camera.zoom"
      />
    </g>

    <g v-if="connectDraft" class="canvas-svg-draft">
      <path
        :d="connectorPath(connectDraft.from, connectDraft.to, connectDraft.routing)"
        fill="none"
        :stroke="connectDraft.color"
        :stroke-width="connectDraft.width"
        :marker-start="connectorMarker(connectDraft as CanvasConnector, 'start')"
        :marker-end="connectorMarker(connectDraft as CanvasConnector, 'end')"
      />
    </g>
  </svg>
</template>

<style scoped>
.canvas-svg-layer {
  position: absolute;
  z-index: 1;
  inset: 0;
  overflow: visible;
  pointer-events: none;
}

.canvas-svg-element,
.canvas-svg-connector {
  pointer-events: auto;
}

.canvas-svg-element--selected,
.canvas-svg-connector--selected {
  filter: drop-shadow(0 0 2px var(--accent));
}

.canvas-svg-element--locked {
  cursor: not-allowed;
}

.canvas-svg-element--connect-target {
  filter: drop-shadow(0 0 0 3px var(--accent));
}

.canvas-svg-connector__hit {
  cursor: pointer;
}

.canvas-svg-draft {
  pointer-events: none;
}
</style>
