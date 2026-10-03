<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { X, GitFork } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'
// Loaded here (not main.ts) so the graph feature's CSS ships only when it's opened.
// (Duplicated with GraphView.vue's import: this panel can open without the
// full graph route ever having loaded.)
import '../../styles/graph.css'
import { useGraphStore } from '../../stores/graph'
import { useTreeStore } from '../../stores/tree'
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
  embedded?: boolean
}

const props = defineProps<Props>()
const emit = defineEmits<{
  close: []
  'open-note': [noteId: string]
}>()

const { t } = useI18n()
const graphStore = useGraphStore()
const treeStore = useTreeStore()
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
  if (!props.note || graphStore.activeNoteId !== props.note.id) return null
  return buildLocalSnapshot(
    props.note.id,
    props.note.title,
    props.note.icon,
    props.note.folderId,
    graphStore.backlinks,
    graphStore.outlinks,
    treeStore.noteById,
  )
})

const relatedNotes = computed(() => localSnapshot.value?.nodes.filter(node => node.id !== props.note?.id) ?? [])

const isEmpty = computed(() => !localSnapshot.value)
const hasNoConnections = computed(() => localSnapshot.value?.nodes.length === 1)

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

watch([simNodes, containerWidth, containerHeight], ([nodes, width, height]) => {
  if (nodes.length > 0 && width > 0 && height > 0) camera.fitToScreen(nodes)
}, { immediate: true, flush: 'post' })

watch(() => props.note?.id, () => {
  camera.reset()
  focus.clearFocusedNode()
})

const ALL_FILTERS = new Set<'link' | 'embed' | 'mention' | 'parent'>(['link', 'embed', 'mention', 'parent'])
</script>

<template>
  <aside :class="['local-graph tw:flex tw:flex-col tw:overflow-hidden tw:bg-(--frame-bg)', embedded ? 'tw:w-full tw:min-h-48 tw:flex-1' : 'tw:w-[300px] tw:shrink-0']">
    <header v-if="!embedded" class="local-graph__header tw:flex tw:h-[42px] tw:shrink-0 tw:items-center tw:gap-[7px] tw:pt-0 tw:pr-2.5 tw:pb-0 tw:pl-3.5">
      <GitFork :size="13" class="local-graph__header-icon tw:shrink-0 tw:text-content-muted" />
      <span class="local-graph__title tw:flex-1 tw:text-xs tw:font-[560] tw:text-content-muted">{{ t('graph.localGraph') }}</span>
      <button class="lg-close tw:grid tw:size-[26px] tw:cursor-pointer tw:place-items-center tw:rounded-[calc(7px*var(--radius-scale,1))] tw:border-none tw:bg-transparent tw:text-content-muted tw:transition-colors tw:duration-120 tw:hover:bg-(--hover-strong) tw:hover:text-content-secondary" @click="emit('close')">
        <X :size="13" />
      </button>
    </header>

    <div ref="containerRef" class="local-graph__canvas-wrap tw:relative tw:min-h-0 tw:flex-1 tw:overflow-hidden tw:bg-(--frame-bg) tw:bg-[radial-gradient(circle,var(--border-default)_1px,transparent_1px)] tw:bg-[length:20px_20px]">
      <nav v-if="embedded && relatedNotes.length" class="local-graph__related tw:absolute tw:inset-x-2 tw:top-2 tw:z-1 tw:flex tw:gap-1 tw:overflow-x-auto" :aria-label="t('graph.localGraph')">
        <button v-for="related in relatedNotes" :key="related.id" type="button" class="tw:max-w-40 tw:shrink-0 tw:truncate tw:rounded-md tw:border tw:border-solid tw:border-line-default tw:bg-(--frame-bg) tw:px-2 tw:py-1 tw:text-[11px] tw:text-content-secondary tw:cursor-pointer tw:hover:text-content-primary tw:focus-visible:outline-2 tw:focus-visible:outline-(--focus-ring)" @click="emit('open-note', related.id)">
          <span aria-hidden="true">{{ related.icon }}</span> {{ related.title || related.id }}
        </button>
      </nav>
      <GraphCanvas
        v-if="localSnapshot"
        ref="canvasCompRef"
        :nodes="simNodes"
        :edges="localSnapshot?.edges ?? []"
        :camera="camera.camera.value"
        :hovered-node-id="interaction.hoveredNode.value?.id"
        :active-node-id="note?.id"
        class="local-graph__graph-canvas"
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

      <div v-if="isEmpty" class="local-graph__empty tw:pointer-events-none tw:absolute tw:inset-0 tw:flex tw:flex-col tw:items-center tw:justify-center tw:gap-2 tw:p-6">
        <div class="local-graph__empty-icon tw:mb-1 tw:text-4xl tw:leading-none tw:opacity-40">🔗</div>
        <p class="local-graph__empty-title tw:m-0 tw:text-center tw:text-[13px] tw:font-medium tw:text-content-muted">{{ t('graph.noConnections') }}</p>
        <p class="local-graph__empty-hint tw:m-0 tw:text-center tw:text-[11.5px] tw:leading-[1.6] tw:text-content-muted">{{ t('graph.noConnectionsHint') }}</p>
      </div>

      <p v-if="embedded && hasNoConnections" class="local-graph__empty-label tw:pointer-events-none tw:absolute tw:inset-x-2 tw:bottom-2 tw:m-0 tw:text-center tw:text-[11px] tw:text-content-muted">{{ t('graph.noConnections') }}</p>

      <GraphNodeTooltip
        :node="interaction.hoveredNode.value"
        :camera="camera.camera.value"
      />
    </div>
  </aside>
</template>
