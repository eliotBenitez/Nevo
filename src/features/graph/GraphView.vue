<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, shallowRef, watch } from 'vue'
import { ArrowLeft, Search, SlidersHorizontal } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'
// Loaded here (not main.ts) so the graph feature's CSS ships only when it's opened.
import '../../styles/graph.css'
import { useWorkspaceStore } from '../../stores/workspace'
import { useOnboardingStore } from '../../stores/onboarding'
import { getActivePinia } from 'pinia'
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
import { usePinchZoom } from '../../composables/usePinchZoom'
import { useDeviceLayout } from '../../composables/useDeviceLayout'
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
const { isPhone } = useDeviceLayout()
const experimentalEnabled = computed(() => {
  if (!getActivePinia()) return false
  try {
    return useWorkspaceStore().settings.advanced.experimentalGraphTools
  } catch {
    return false
  }
})
const showArrows = ref(false)

const containerRef = ref<HTMLDivElement | null>(null)
const canvasCompRef = ref<{ canvasRef: HTMLCanvasElement | null } | null>(null)
const showLabels = ref(false)
const filters = ref<Set<EdgeKind>>(new Set(['link', 'embed', 'mention', 'parent']))
const searchQuery = ref('')
const mobileFiltersOpen = ref(false)

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
  try {
    if (getActivePinia()) {
      showLabels.value = useWorkspaceStore().settings.workspace.showGraphLabels
      void useOnboardingStore().markFirstStep('openGraph')
    }
  } catch {
    // The workspace store is unavailable in isolated graph renders.
  }
  if (props.manifest) loadGraph()
})

onUnmounted(() => ro.disconnect())

watch(() => props.manifest, (manifest) => {
  if (manifest) loadGraph()
})

const snapshot = shallowRef<GraphSnapshot | null>(null)
const loading = ref(false)

async function loadGraph() {
  if (!props.manifest) return
  loading.value = true
  try {
    const data = useGraphData(props.manifest)
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

watch(snapshot, (snap) => {
  if (snap && props.activeNoteId) {
    try {
      const workspaceStore = useWorkspaceStore()
      if (workspaceStore.settings.workspace.graphEntryMode === 'from-current-note') {
        focus.focusedNodeId.value = props.activeNoteId
      }
    } catch {
      // The workspace store is unavailable in isolated graph renders.
    }
  }
}, { immediate: true })

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

usePinchZoom({
  target: canvasRef,
  onUpdate: ({ center, panDelta, scaleFactor }) => {
    camera.tx.value += panDelta.x
    camera.ty.value += panDelta.y
    camera.applyZoom(camera.scale.value * scaleFactor, center.x, center.y)
  },
})

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
  <div class="graph-view tw:flex tw:min-h-0 tw:flex-1 tw:flex-col tw:overflow-hidden tw:max-[719px]:relative">
    <header class="graph-header tw:z-2 tw:flex tw:h-12 tw:shrink-0 tw:items-center tw:gap-2.5 tw:border-b-0 tw:bg-(--island-bg) tw:px-3 tw:max-[719px]:pointer-events-none tw:max-[719px]:absolute tw:max-[719px]:inset-x-0 tw:max-[719px]:top-0 tw:max-[719px]:z-20 tw:max-[719px]:grid tw:max-[719px]:h-auto tw:max-[719px]:min-h-[calc(58px_+_max(var(--safe-area-top),0px))] tw:max-[719px]:grid-cols-[44px_minmax(0,1fr)_44px] tw:max-[719px]:gap-2 tw:max-[719px]:bg-transparent tw:max-[719px]:pt-[max(var(--safe-area-top),0px)] tw:max-[719px]:pr-[calc(14px_+_max(var(--safe-area-right),0px))] tw:max-[719px]:pb-[7px] tw:max-[719px]:pl-[calc(12px_+_max(var(--safe-area-left),0px))]">
      <button class="nv-btn tw:max-[719px]:pointer-events-auto tw:max-[719px]:grid tw:max-[719px]:size-11 tw:max-[719px]:min-w-11 tw:max-[719px]:place-items-center tw:max-[719px]:rounded-[calc(14px*var(--radius-scale,1))] tw:max-[719px]:border tw:max-[719px]:border-solid tw:max-[719px]:border-transparent tw:max-[719px]:bg-(--input-bg) tw:max-[719px]:p-0 tw:max-[719px]:shadow-[0_12px_30px_-22px_var(--shadow)]" @click="emit('back')">
        <ArrowLeft :size="12" />
        <span class="tw:max-[719px]:hidden">{{ t('graph.backToEditor') }}</span>
      </button>

      <div class="graph-header__search tw:flex tw:h-[30px] tw:max-w-80 tw:flex-1 tw:items-center tw:gap-[7px] tw:rounded-[calc(9px*var(--radius-scale,1))] tw:border tw:border-solid tw:border-transparent tw:bg-(--input-bg) tw:px-2.5 tw:transition-[border-color,box-shadow] tw:duration-150 tw:focus-within:border-accent tw:focus-within:shadow-[0_0_0_2px_var(--accent-soft)] tw:max-[719px]:pointer-events-auto tw:max-[719px]:h-11 tw:max-[719px]:w-full tw:max-[719px]:min-w-0 tw:max-[719px]:max-w-none tw:max-[719px]:rounded-[calc(14px*var(--radius-scale,1))] tw:max-[719px]:bg-(--island-bg) tw:max-[719px]:shadow-[0_12px_30px_-22px_var(--shadow)]">
        <Search :size="13" class="graph-header__search-icon tw:shrink-0 tw:text-content-muted" />
        <input
          v-model="searchQuery"
          class="graph-header__search-input tw:min-w-0 tw:flex-1 tw:border-none tw:bg-transparent tw:text-[12.5px] tw:text-content-primary tw:outline-none tw:placeholder:text-content-muted tw:max-[719px]:text-sm"
          :placeholder="t('graph.searchPlaceholder')"
        />
      </div>

      <div class="graph-header__meta tw:ml-auto tw:flex tw:items-center tw:gap-1.5 tw:max-[719px]:hidden">
        <span class="graph-meta-pill tw:inline-flex tw:h-[22px] tw:items-center tw:rounded-[calc(20px*var(--radius-scale,1))] tw:border tw:border-solid tw:border-transparent tw:bg-surface-subtle tw:px-2 tw:font-nv-mono tw:text-[11px] tw:text-content-muted">{{ simNodes.length }} {{ t('graph.nodes') }}</span>
        <span class="graph-meta-pill tw:inline-flex tw:h-[22px] tw:items-center tw:rounded-[calc(20px*var(--radius-scale,1))] tw:border tw:border-solid tw:border-transparent tw:bg-surface-subtle tw:px-2 tw:font-nv-mono tw:text-[11px] tw:text-content-muted">{{ filteredEdges.length }} {{ t('graph.edges') }}</span>
      </div>

      <button
        type="button"
        class="graph-header__filter tw:hidden tw:max-[719px]:pointer-events-auto tw:max-[719px]:grid tw:max-[719px]:size-11 tw:max-[719px]:place-items-center tw:max-[719px]:rounded-[calc(14px*var(--radius-scale,1))] tw:max-[719px]:border tw:max-[719px]:border-solid tw:max-[719px]:border-transparent tw:max-[719px]:bg-surface-subtle tw:max-[719px]:p-0 tw:max-[719px]:text-content-secondary tw:max-[719px]:shadow-[0_12px_30px_-22px_var(--shadow)] tw:max-[719px]:aria-pressed:bg-(--accent-soft) tw:max-[719px]:aria-pressed:text-accent"
        :class="{ 'is-active': mobileFiltersOpen }"
        :aria-label="t('graph.filters')"
        :aria-pressed="mobileFiltersOpen"
        @click="mobileFiltersOpen = !mobileFiltersOpen"
      >
        <SlidersHorizontal :size="18" aria-hidden="true" />
      </button>
    </header>

    <div ref="containerRef" class="graph-body tw:relative tw:min-h-0 tw:flex-1 tw:overflow-hidden tw:bg-(--island-bg) tw:bg-[radial-gradient(circle,var(--border-default)_1px,transparent_1px)] tw:bg-[length:28px_28px]">
      <!-- Loading -->
      <Transition name="graph-fade">
        <div v-if="loading" class="graph-state tw:pointer-events-none tw:absolute tw:inset-0 tw:flex tw:flex-col tw:items-center tw:justify-center tw:gap-3.5">
          <div class="graph-spinner tw:size-7 tw:rounded-full tw:border-2 tw:border-solid tw:border-line-default tw:border-t-accent" />
          <span class="graph-state__text tw:text-[13px] tw:text-content-muted">{{ t('graph.loading') }}</span>
        </div>
      </Transition>

      <!-- Empty state -->
      <Transition name="graph-fade">
        <div v-if="isEmpty" class="graph-state tw:pointer-events-none tw:absolute tw:inset-0 tw:flex tw:flex-col tw:items-center tw:justify-center tw:gap-3.5">
          <div class="graph-empty-icon tw:text-5xl tw:leading-none tw:opacity-50 tw:grayscale-[0.4]">🕸</div>
          <p class="graph-state__title tw:m-0 tw:text-[17px] tw:font-medium tw:text-content-secondary">{{ t('graph.emptyTitle') }}</p>
          <p class="graph-state__sub tw:m-0 tw:max-w-80 tw:text-center tw:text-[13px] tw:leading-[1.6] tw:text-content-muted">{{ t('graph.emptySub') }}</p>
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
        :show-arrows="showArrows"
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
        :experimental-enabled="experimentalEnabled"
        :show-arrows="showArrows"
        :mobile-filters-open="isPhone && mobileFiltersOpen"
        @zoom-in="camera.zoomIn"
        @zoom-out="camera.zoomOut"
        @reset="camera.reset"
        @reset-focus="focus.clearFocusedNode"
        @toggle-labels="showLabels = !showLabels"
        @toggle-arrows="showArrows = !showArrows"
        @toggle-filter="toggleFilter"
      />
    </div>
  </div>
</template>
