import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { computed, defineComponent, nextTick, ref } from 'vue'
import { createI18n } from 'vue-i18n'
import GraphView from './GraphView.vue'
import LocalGraphPanel from './LocalGraphPanel.vue'
import en from '../../locales/en.json'
import type { GraphEdge, GraphSnapshot } from '../../types/graph'
import type { NoteDocument } from '../../types/note'
import type { WorkspaceManifest } from '../../types/workspace'

const graphState = vi.hoisted(() => ({
  snapshot: null as GraphSnapshot | null,
  simNodes: [] as Array<{
    id: string
    title: string
    icon: string
    folderId: string | null
    degree: number
    x: number
    y: number
  }>,
  backlinks: [] as Array<{ sourceId: string; sourceTitle: string; sourceIcon: string; count: number }>,
  outlinks: [] as GraphEdge[],
  cameraReset: vi.fn(),
  fitToScreen: vi.fn(),
}))

vi.mock('../../stores/graph', () => ({
  useGraphStore: () => ({
    backlinks: graphState.backlinks,
    outlinks: graphState.outlinks,
  }),
}))

vi.mock('./composables/useGraphData', async () => {
  const actual = await vi.importActual<typeof import('./composables/useGraphData')>('./composables/useGraphData')
  return {
    ...actual,
    useGraphData: () => {
      const snapshot = ref<GraphSnapshot | null>(null)
      return {
        snapshot,
        loading: ref(false),
        async load() {
          snapshot.value = graphState.snapshot
        },
      }
    },
  }
})

vi.mock('./composables/useGraphSimulation', async () => {
  const actual = await vi.importActual<typeof import('./composables/useGraphSimulation')>('./composables/useGraphSimulation')
  return {
    ...actual,
    useGraphSimulation: () => ({
      simNodes: ref(graphState.simNodes),
      pinNode: vi.fn(),
      unpinNode: vi.fn(),
    }),
  }
})

vi.mock('./composables/useGraphCamera', () => ({
  useGraphCamera: () => {
    const scale = ref(1)
    const tx = ref(0)
    const ty = ref(0)

    return {
      scale,
      tx,
      ty,
      camera: computed(() => ({ scale: scale.value, tx: tx.value, ty: ty.value })),
      zoomIn: vi.fn(),
      zoomOut: vi.fn(),
      reset: graphState.cameraReset,
      onWheel: vi.fn(),
      fitToScreen: graphState.fitToScreen,
    }
  },
}))

const GraphCanvasStub = defineComponent({
  name: 'GraphCanvas',
  props: {
    focusedNodeId: {
      type: String,
      default: null,
    },
    focusedNeighborIds: {
      type: Object,
      default: undefined,
    },
  },
  emits: ['mousemove', 'mousedown', 'mouseup', 'mouseleave', 'dblclick', 'wheel'],
  setup(props, { emit }) {
    const focusedNeighbors = computed(() => Array.from((props.focusedNeighborIds as Set<string> | undefined) ?? []).join(','))

    function selectNode(offsetX: number, offsetY: number) {
      emit('mousedown', { button: 0, offsetX, offsetY })
      emit('mouseup', { button: 0, offsetX, offsetY })
    }

    function openNode(offsetX: number, offsetY: number) {
      emit('dblclick', { offsetX, offsetY })
    }

    return { emit, focusedNeighbors, selectNode, openNode }
  },
  template: `
    <div
      class="graph-canvas-stub"
      :data-focused-node-id="focusedNodeId ?? ''"
      :data-focused-neighbors="focusedNeighbors"
    >
      <button class="node-1-select" @click="selectNode(10, 10)">node-1</button>
      <button class="node-2-select" @click="selectNode(40, 10)">node-2</button>
      <button class="node-2-open" @click="openNode(40, 10)">open node-2</button>
    </div>
  `,
})

const GraphControlsStub = defineComponent({
  name: 'GraphControls',
  props: {
    focusedNodeTitle: {
      type: String,
      default: null,
    },
  },
  emits: ['zoom-in', 'zoom-out', 'reset', 'reset-focus', 'toggle-labels', 'toggle-filter'],
  template: `
    <div class="graph-controls-stub" :data-focused-title="focusedNodeTitle ?? ''">
      <button class="reset-view" @click="$emit('reset')">reset view</button>
      <button class="reset-focus" @click="$emit('reset-focus')">reset focus</button>
    </div>
  `,
})

const i18n = createI18n({
  legacy: false,
  locale: 'en',
  messages: { en },
})

class ResizeObserverStub {
  observe() {}
  disconnect() {}
}

function createSnapshot(): GraphSnapshot {
  return {
    nodes: [
      { id: 'note-1', title: 'Alpha', icon: '📄', folderId: null, degree: 1 },
      { id: 'note-2', title: 'Beta', icon: '📄', folderId: null, degree: 1 },
      { id: 'note-3', title: 'Gamma', icon: '📄', folderId: null, degree: 0 },
    ],
    edges: [
      { source: 'note-1', target: 'note-2', kind: 'link' },
    ],
  }
}

function createSimNodes() {
  return [
    { id: 'note-1', title: 'Alpha', icon: '📄', folderId: null, degree: 1, x: 10, y: 10 },
    { id: 'note-2', title: 'Beta', icon: '📄', folderId: null, degree: 1, x: 40, y: 10 },
    { id: 'note-3', title: 'Gamma', icon: '📄', folderId: null, degree: 0, x: 120, y: 10 },
  ]
}

function createNote(): NoteDocument {
  return {
    id: 'note-1',
    title: 'Alpha',
    icon: '📄',
    folderId: null,
    createdAt: '2026-05-18T10:00:00.000Z',
    updatedAt: '2026-05-18T10:00:00.000Z',
    content: {
      type: 'doc',
      content: [],
    },
  }
}

function createManifest(): WorkspaceManifest {
  return {
    id: 'workspace-1',
    name: 'Workspace',
    glyph: 'N',
    gradient: 'violet',
    schemaVersion: 1,
    createdAt: '2026-05-18T10:00:00.000Z',
    rootOrder: ['note-1', 'note-2', 'note-3'],
    rootNotes: [],
    tree: [],
  }
}

async function flushUi() {
  await Promise.resolve()
  await Promise.resolve()
  await nextTick()
}

describe('graph focus mode', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    graphState.snapshot = createSnapshot()
    graphState.simNodes = createSimNodes()
    graphState.backlinks = [
      { sourceId: 'note-2', sourceTitle: 'Beta', sourceIcon: '📄', count: 1 },
    ]
    graphState.outlinks = [
      { source: 'note-1', target: 'note-3', kind: 'link' },
    ]
    Object.defineProperty(globalThis, 'ResizeObserver', {
      value: ResizeObserverStub,
      configurable: true,
      writable: true,
    })
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('passes the focused node and its 1-hop neighbors to the graph canvas', async () => {
    const wrapper = mount(GraphView, {
      global: {
        plugins: [i18n],
        stubs: {
          GraphCanvas: GraphCanvasStub,
          GraphControls: GraphControlsStub,
          GraphNodeTooltip: true,
        },
      },
      props: {
        workspacePath: '/workspace',
        manifest: createManifest(),
        activeNoteId: 'note-1',
      },
    })

    await flushUi()
    await wrapper.get('.node-1-select').trigger('click')
    await nextTick()

    const canvas = wrapper.getComponent(GraphCanvasStub)
    expect(canvas.attributes('data-focused-node-id')).toBe('note-1')
    expect(canvas.attributes('data-focused-neighbors')).toBe('note-2')

    await wrapper.get('.node-1-select').trigger('click')
    await nextTick()

    expect(wrapper.getComponent(GraphCanvasStub).attributes('data-focused-node-id')).toBe('')
    wrapper.unmount()
  })

  it('uses the same focus mechanics in the local graph panel', async () => {
    const wrapper = mount(LocalGraphPanel, {
      global: {
        plugins: [i18n],
        stubs: {
          GraphCanvas: GraphCanvasStub,
          GraphNodeTooltip: true,
        },
      },
      props: {
        note: createNote(),
      },
    })

    await flushUi()
    await wrapper.get('.node-2-select').trigger('click')
    await nextTick()

    const canvas = wrapper.getComponent(GraphCanvasStub)
    expect(canvas.attributes('data-focused-node-id')).toBe('note-2')
    expect(canvas.attributes('data-focused-neighbors')).toBe('note-1')
    wrapper.unmount()
  })

  it('keeps camera reset separate from focus reset', async () => {
    const wrapper = mount(GraphView, {
      global: {
        plugins: [i18n],
        stubs: {
          GraphCanvas: GraphCanvasStub,
          GraphControls: GraphControlsStub,
          GraphNodeTooltip: true,
        },
      },
      props: {
        workspacePath: '/workspace',
        manifest: createManifest(),
      },
    })

    await flushUi()
    await wrapper.get('.node-1-select').trigger('click')
    await nextTick()

    await wrapper.get('.reset-view').trigger('click')
    expect(graphState.cameraReset).toHaveBeenCalledTimes(1)
    expect(wrapper.getComponent(GraphCanvasStub).attributes('data-focused-node-id')).toBe('note-1')

    await wrapper.get('.reset-focus').trigger('click')
    await nextTick()

    expect(wrapper.getComponent(GraphCanvasStub).attributes('data-focused-node-id')).toBe('')
    expect(graphState.cameraReset).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })

  it('still opens a note on double-click', async () => {
    const wrapper = mount(GraphView, {
      global: {
        plugins: [i18n],
        stubs: {
          GraphCanvas: GraphCanvasStub,
          GraphControls: GraphControlsStub,
          GraphNodeTooltip: true,
        },
      },
      props: {
        workspacePath: '/workspace',
        manifest: createManifest(),
      },
    })

    await flushUi()
    await wrapper.get('.node-2-open').trigger('click')

    expect(wrapper.emitted('open-note')).toEqual([['note-2']])
    wrapper.unmount()
  })
})
