<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, shallowRef, watch } from 'vue'
import { ArrowLeft, Search } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'
import type { WorkspaceManifest } from '../../types/workspace'
import type { EdgeKind, GraphSnapshot } from '../../types/graph'
import GraphCanvas from './components/GraphCanvas.vue'
import GraphControls from './components/GraphControls.vue'
import GraphNodeTooltip from './components/GraphNodeTooltip.vue'
import { useGraphData } from './composables/useGraphData'
import { useGraphSimulation } from './composables/useGraphSimulation'
import { useGraphCamera } from './composables/useGraphCamera'
import { useGraphInteraction } from './composables/useGraphInteraction'
import { useGraphFocus } from './composables/useGraphFocus'
import type { SimNode } from './composables/useGraphSimulation'

interface Props {
  workspacePath: string | null
  manifest: WorkspaceManifest | null
  activeNoteId?: string | null
}

const props = defineProps<Props>()
const emit = defineEmits<{
  'open-note': [noteId: string]
  'back': []
}>()

const { t } = useI18n()

const containerRef = ref<HTMLDivElement | null>(null)
const canvasCompRef = ref<{ canvasRef: HTMLCanvasElement | null } | null>(null)
const showLabels = ref(false)
const filters = ref<Set<EdgeKind>>(new Set(['link', 'embed', 'mention', 'parent']))
const searchQuery = ref('')

const containerWidth = ref(800)
const containerHeight = ref(600)

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
  if (props.workspacePath && props.manifest) loadGraph()
})

onUnmounted(() => ro.disconnect())

watch(() => [props.workspacePath, props.manifest], ([path, manifest]) => {
  if (path && manifest) loadGraph()
})

const snapshot = shallowRef<GraphSnapshot | null>(null)
const loading = ref(false)

async function loadGraph() {
  if (!props.workspacePath || !props.manifest) return
  loading.value = true
  try {
    const data = useGraphData(props.workspacePath, props.manifest)
    await data.load()
    snapshot.value = data.snapshot.value
  } finally {
    loading.value = false
  }
}

const { simNodes, pinNode, unpinNode } = useGraphSimulation(snapshot, containerWidth, containerHeight)

const camera = useGraphCamera(() => containerWidth.value, () => containerHeight.value)
const focusGraph = computed(() => {
  if (!snapshot.value) return null
  return {
    nodes: simNodes.value,
    edges: filteredEdges.value,
  }
})
const focus = useGraphFocus(focusGraph)

const canvasRef = computed(() => canvasCompRef.value?.canvasRef ?? null)

const interaction = useGraphInteraction(
  canvasRef, simNodes, camera.camera,
  {
    select: (node: SimNode) => focus.toggleFocusedNode(node.id),
    open: (node: SimNode) => emit('open-note', node.id),
  },
  pinNode, unpinNode,
  camera.onWheel,
  (dx, dy) => { camera.tx.value += dx; camera.ty.value += dy },
)

const filteredEdges = computed(() => {
  const snap = snapshot.value
  if (!snap) return []
  return snap.edges.filter(e => filters.value.has(e.kind))
})

const isEmpty = computed(() => !loading.value && snapshot.value !== null && simNodes.value.length === 0)

function toggleFilter(kind: EdgeKind) {
  const next = new Set(filters.value)
  if (next.has(kind)) next.delete(kind)
  else next.add(kind)
  filters.value = next
}

watch(simNodes, (nodes) => {
  if (nodes.length > 0 && camera.scale.value === 1 && camera.tx.value === 0) {
    camera.fitToScreen(nodes)
  }
}, { once: true })
</script>

<template>
  <div class="graph-view">
    <header class="graph-header">
      <button class="nv-btn" @click="emit('back')">
        <ArrowLeft :size="12" />
        <span>{{ t('graph.backToEditor') }}</span>
      </button>

      <div class="graph-header__search">
        <Search :size="13" class="graph-header__search-icon" />
        <input
          v-model="searchQuery"
          class="graph-header__search-input"
          :placeholder="t('graph.searchPlaceholder')"
        />
      </div>

      <div class="graph-header__meta">
        <span class="graph-meta-pill">{{ simNodes.length }} {{ t('graph.nodes') }}</span>
        <span class="graph-meta-pill">{{ filteredEdges.length }} {{ t('graph.edges') }}</span>
      </div>
    </header>

    <div ref="containerRef" class="graph-body">
      <!-- Loading -->
      <Transition name="graph-fade">
        <div v-if="loading" class="graph-state">
          <div class="graph-spinner" />
          <span class="graph-state__text">{{ t('graph.loading') }}</span>
        </div>
      </Transition>

      <!-- Empty state -->
      <Transition name="graph-fade">
        <div v-if="isEmpty" class="graph-state">
          <div class="graph-empty-icon">🕸</div>
          <p class="graph-state__title">{{ t('graph.emptyTitle') }}</p>
          <p class="graph-state__sub">{{ t('graph.emptySub') }}</p>
        </div>
      </Transition>

      <!-- Canvas -->
      <GraphCanvas
        v-if="!loading && !isEmpty"
        ref="canvasCompRef"
        :nodes="simNodes"
        :edges="filteredEdges"
        :camera="camera.camera.value"
        :hovered-node-id="interaction.hoveredNode.value?.id"
        :active-node-id="activeNoteId"
        :focused-node-id="focus.focusedNodeId.value"
        :focused-neighbor-ids="focus.focusedNeighborIds.value"
        :show-labels="showLabels"
        :filters="filters"
        :search-query="searchQuery"
        @mousemove="interaction.onMouseMove"
        @mousedown="interaction.onMouseDown"
        @mouseup="interaction.onMouseUp"
        @mouseleave="interaction.onMouseLeave"
        @dblclick="interaction.onDblClick"
        @wheel="interaction.onWheel"
      />

      <GraphNodeTooltip
        :node="interaction.hoveredNode.value"
        :camera="camera.camera.value"
      />

      <GraphControls
        v-if="!loading && !isEmpty"
        :node-count="simNodes.length"
        :edge-count="filteredEdges.length"
        :show-labels="showLabels"
        :filters="filters"
        :zoom="camera.scale.value"
        :focused-node-title="focus.focusedNode.value?.title ?? null"
        @zoom-in="camera.zoomIn"
        @zoom-out="camera.zoomOut"
        @reset="camera.reset"
        @reset-focus="focus.clearFocusedNode"
        @toggle-labels="showLabels = !showLabels"
        @toggle-filter="toggleFilter"
      />
    </div>
  </div>
</template>
