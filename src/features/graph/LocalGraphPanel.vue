<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { X, GitFork } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'
import { useGraphStore } from '../../stores/graph'
import type { GraphSnapshot } from '../../types/graph'
import type { NoteDocument } from '../../types/note'
import GraphCanvas from './components/GraphCanvas.vue'
import GraphNodeTooltip from './components/GraphNodeTooltip.vue'
import { buildLocalSnapshot } from './composables/useGraphData'
import { useGraphSimulation } from './composables/useGraphSimulation'
import { useGraphCamera } from './composables/useGraphCamera'
import { useGraphInteraction } from './composables/useGraphInteraction'
import { useGraphFocus } from './composables/useGraphFocus'
import type { SimNode } from './composables/useGraphSimulation'

interface Props {
  note: NoteDocument | null
}

const props = defineProps<Props>()
const emit = defineEmits<{
  close: []
  'open-note': [noteId: string]
}>()

const { t } = useI18n()
const graphStore = useGraphStore()
const canvasCompRef = ref<{ canvasRef: HTMLCanvasElement | null } | null>(null)
const containerRef = ref<HTMLDivElement | null>(null)

const containerWidth = ref(300)
const containerHeight = ref(400)

const ro = new ResizeObserver(entries => {
  const rect = entries[0]?.contentRect
  if (rect) { containerWidth.value = rect.width; containerHeight.value = rect.height }
})

onMounted(() => {
  if (containerRef.value) {
    ro.observe(containerRef.value)
    containerWidth.value = containerRef.value.clientWidth
    containerHeight.value = containerRef.value.clientHeight
  }
})

onUnmounted(() => ro.disconnect())

const localSnapshot = computed<GraphSnapshot | null>(() => {
  if (!props.note) return null
  return buildLocalSnapshot(
    props.note.id,
    props.note.title,
    props.note.icon,
    props.note.folderId,
    graphStore.backlinks,
    graphStore.outlinks,
  )
})

const isEmpty = computed(() => !localSnapshot.value || localSnapshot.value.nodes.length <= 1)

const { simNodes, pinNode, unpinNode } = useGraphSimulation(localSnapshot, containerWidth, containerHeight)

const camera = useGraphCamera(() => containerWidth.value, () => containerHeight.value)
const focusGraph = computed(() => {
  if (!localSnapshot.value) return null
  return {
    nodes: simNodes.value,
    edges: localSnapshot.value.edges,
  }
})
const focus = useGraphFocus(focusGraph)

const canvasRef = computed(() => canvasCompRef.value?.canvasRef ?? null)

const interaction = useGraphInteraction(
  canvasRef, simNodes, camera.camera,
  {
    select: (node: SimNode) => focus.toggleFocusedNode(node.id),
    open: (node: SimNode) => { if (node.id !== props.note?.id) emit('open-note', node.id) },
  },
  pinNode, unpinNode,
  camera.onWheel,
  (dx, dy) => { camera.tx.value += dx; camera.ty.value += dy },
)

watch(simNodes, (nodes) => {
  if (nodes.length > 0) camera.fitToScreen(nodes)
}, { once: true })

watch(() => props.note?.id, () => {
  camera.reset()
  focus.clearFocusedNode()
})

const ALL_FILTERS = new Set<'link' | 'embed' | 'mention' | 'parent'>(['link', 'embed', 'mention', 'parent'])
</script>

<template>
  <aside class="local-graph">
    <header class="local-graph__header">
      <GitFork :size="13" class="local-graph__header-icon" />
      <span class="local-graph__title">{{ t('graph.localGraph') }}</span>
      <button class="lg-close" @click="emit('close')">
        <X :size="13" />
      </button>
    </header>

    <div ref="containerRef" class="local-graph__canvas-wrap">
      <GraphCanvas
        v-if="!isEmpty"
        ref="canvasCompRef"
        :nodes="simNodes"
        :edges="localSnapshot?.edges ?? []"
        :camera="camera.camera.value"
        :hovered-node-id="interaction.hoveredNode.value?.id"
        :active-node-id="note?.id"
        :focused-node-id="focus.focusedNodeId.value"
        :focused-neighbor-ids="focus.focusedNeighborIds.value"
        :show-labels="true"
        :filters="ALL_FILTERS"
        @mousemove="interaction.onMouseMove"
        @mousedown="interaction.onMouseDown"
        @mouseup="interaction.onMouseUp"
        @mouseleave="interaction.onMouseLeave"
        @dblclick="interaction.onDblClick"
        @wheel="interaction.onWheel"
      />

      <div v-if="isEmpty" class="local-graph__empty">
        <div class="local-graph__empty-icon">🔗</div>
        <p class="local-graph__empty-title">{{ t('graph.noConnections') }}</p>
        <p class="local-graph__empty-hint">{{ t('graph.noConnectionsHint') }}</p>
      </div>

      <GraphNodeTooltip
        :node="interaction.hoveredNode.value"
        :camera="camera.camera.value"
      />
    </div>
  </aside>
</template>
