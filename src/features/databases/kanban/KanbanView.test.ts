import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createI18n } from 'vue-i18n'
import KanbanView from './KanbanView.vue'
import { useWorkspaceStore } from '../../../stores/workspace'
import { kanbanCommands } from '../../../tauri/commands'
import type { KanbanBoard, KanbanCard } from '../../../types/kanban'
import enMessages from '../../../locales/en.json'
import ruMessages from '../../../locales/ru.json'

vi.mock('../../../tauri/commands', async () => {
  const actual = await vi.importActual<typeof import('../../../tauri/commands')>('../../../tauri/commands')
  return {
    ...actual,
    kanbanCommands: {
      ...actual.kanbanCommands,
      listBoards: vi.fn(),
      listCards: vi.fn(),
      createCard: vi.fn(),
      updateBoard: vi.fn(),
      moveCard: vi.fn(),
    },
  }
})

const KanbanColumnStub = defineComponent({
  props: {
    column: {
      type: Object,
      required: true,
    },
    cards: {
      type: Array,
      required: true,
    },
  },
  template: `
    <div
      class="kanban-column-stub"
      :data-column-id="column.id"
      :data-card-count="cards.length"
    >
      {{ column.name }}
    </div>
  `,
})

const DragDropColumnStub = defineComponent({
  props: {
    column: {
      type: Object,
      required: true,
    },
  },
  emits: ['card-dragstart', 'card-handle-pointerdown', 'drop'],
  methods: {
    triggerDragStart(event: DragEvent) {
      this.$emit('card-dragstart', event, 'card-1', 'todo')
    },
    triggerHandlePointerDown(event: PointerEvent) {
      this.$emit('card-handle-pointerdown', event, 'card-1', 'todo')
    },
    triggerDrop(event: DragEvent) {
      this.$emit('drop', event, this.column.id, 0)
    },
  },
  template: `
    <div class="kanban-column-drag-stub kb-column" :data-column-id="column.id" data-card-count="1">
      <button class="drag-start" @dragstart="triggerDragStart" />
      <button class="pointer-drag-start" @pointerdown="triggerHandlePointerDown" />
      <div class="drop-target kb-drop-zone" :data-column-id="column.id" data-drop-zone-index="0" @drop="triggerDrop" />
    </div>
  `,
})

const PointerDragRuntimeColumnStub = defineComponent({
  props: {
    column: {
      type: Object,
      required: true,
    },
    draggingCardId: {
      type: String,
      default: null,
    },
    floatingCardId: {
      type: String,
      default: null,
    },
    floatingCardStyle: {
      type: Object,
      default: null,
    },
  },
  emits: ['card-handle-pointerdown'],
  data() {
    return {
      floatingStyleChanges: 0,
    }
  },
  watch: {
    floatingCardStyle(next: unknown, prev: unknown) {
      if (next && next !== prev) this.floatingStyleChanges += 1
    },
  },
  methods: {
    triggerHandlePointerDown(event: PointerEvent) {
      this.$emit('card-handle-pointerdown', event, 'card-1', 'todo')
    },
  },
  template: `
    <div class="kb-column" :data-column-id="column.id" data-card-count="1">
      <div
        class="kb-card"
        :class="{
          'kb-card--dragging': draggingCardId === 'card-1',
          'kb-card--floating': floatingCardId === 'card-1',
        }"
        :style="floatingCardId === 'card-1' ? floatingCardStyle ?? undefined : undefined"
      >
        <button class="kb-card__handle pointer-drag-start" @pointerdown="triggerHandlePointerDown" />
      </div>
      <div class="drop-target kb-drop-zone" :data-column-id="column.id" data-drop-zone-index="0" />
    </div>
  `,
})

async function flushUi() {
  await new Promise(resolve => window.setTimeout(resolve, 0))
  await Promise.resolve()
  await Promise.resolve()
  await nextTick()
}

async function flushPointerFrames(count = 1) {
  for (let i = 0; i < count; i++) await flushUi()
}

const originalRequestAnimationFrame = window.requestAnimationFrame
const originalCancelAnimationFrame = window.cancelAnimationFrame

function makeBoard(): KanbanBoard {
  return {
    id: 'board-1',
    title: 'Product roadmap',
    icon: '🗂️',
    folderId: null,
    statusPropertyId: 'status',
    propertyDefinitions: [
      {
        id: 'status',
        name: 'Status',
        type: 'select',
        order: 0,
        options: [
          { id: 'todo', name: 'Todo', color: '#3b82f6' },
        ],
      },
    ],
    createdAt: '2026-05-16T10:00:00.000Z',
    updatedAt: '2026-05-16T10:00:00.000Z',
  }
}

function makeCard(): KanbanCard {
  return {
    id: 'card-1',
    boardId: 'board-1',
    title: 'Ship tests',
    icon: '✅',
    content: { type: 'doc', content: [] },
    properties: { status: 'todo' },
    fields: [],
    columnOrder: 0,
    createdAt: '2026-05-16T10:00:00.000Z',
    updatedAt: '2026-05-16T10:00:00.000Z',
  }
}

async function mountView(boardId = 'board-1', locale = 'en') {
  return mountViewWithStubs(boardId, {
    KanbanColumn: KanbanColumnStub,
  }, locale)
}

async function mountViewWithStubs(boardId = 'board-1', stubs: Record<string, unknown>, locale = 'en') {
  setActivePinia(createPinia())
  const workspaceStore = useWorkspaceStore()
  workspaceStore.activeHandle = { kind: 'local', path: '/workspace' }

  const i18n = createI18n({
    legacy: false,
    locale,
    messages: {
      en: enMessages,
      ru: ruMessages,
    },
  })
  const wrapper = mount(KanbanView, {
    props: { boardId },
    global: {
      plugins: [i18n],
      stubs: {
        ...stubs,
        KanbanCardModal: true,
        KanbanBoardModal: true,
      },
    },
  })

  await flushUi()
  return wrapper
}

describe('KanbanView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(kanbanCommands.moveCard).mockResolvedValue([makeCard()])
    vi.mocked(kanbanCommands.createCard).mockResolvedValue(makeCard())
    vi.mocked(kanbanCommands.updateBoard).mockResolvedValue(makeBoard())
    Object.defineProperty(window, 'requestAnimationFrame', {
      configurable: true,
      value: vi.fn((callback: FrameRequestCallback) => {
        return window.setTimeout(() => callback(performance.now()), 0)
      }),
    })
    Object.defineProperty(window, 'cancelAnimationFrame', {
      configurable: true,
      value: vi.fn((handle: number) => window.clearTimeout(handle)),
    })
  })

  afterEach(() => {
    Object.defineProperty(window, 'requestAnimationFrame', {
      configurable: true,
      value: originalRequestAnimationFrame,
    })
    Object.defineProperty(window, 'cancelAnimationFrame', {
      configurable: true,
      value: originalCancelAnimationFrame,
    })
  })

  it('loads boards before cards and renders the resolved board', async () => {
    vi.mocked(kanbanCommands.listBoards).mockResolvedValue([makeBoard()])
    vi.mocked(kanbanCommands.listCards).mockResolvedValue([makeCard()])

    const wrapper = await mountView()

    await vi.waitFor(() => {
      expect(wrapper.text()).toContain('Product roadmap')
    })

    expect(wrapper.find('.kanban-column-stub').exists()).toBe(true)
    expect(wrapper.find('.kanban-column-stub').attributes('data-card-count')).toBe('1')
    expect(vi.mocked(kanbanCommands.listBoards).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(kanbanCommands.listCards).mock.invocationCallOrder[0],
    )

    wrapper.unmount()
  })

  it('renders the empty board state with localized copy', async () => {
    vi.mocked(kanbanCommands.listBoards).mockResolvedValue([
      {
        ...makeBoard(),
        propertyDefinitions: [
          {
            id: 'status',
            name: 'Status',
            type: 'select',
            order: 0,
            options: [],
          },
        ],
      },
    ])
    vi.mocked(kanbanCommands.listCards).mockResolvedValue([])

    const wrapper = await mountView('board-1', 'ru')

    await vi.waitFor(() => {
      expect(wrapper.text()).toContain('Пустая доска.')
    })

    expect(wrapper.text()).toContain('Добавить колонку')
    expect(wrapper.text()).not.toContain('An empty board.')

    wrapper.unmount()
  })

  it('shows the not found state when the routed board does not exist', async () => {
    vi.mocked(kanbanCommands.listBoards).mockResolvedValue([])
    vi.mocked(kanbanCommands.listCards).mockResolvedValue([])

    const wrapper = await mountView('missing-board')

    await vi.waitFor(() => {
      expect(wrapper.text()).toContain('Board not found.')
    })

    expect(vi.mocked(kanbanCommands.listCards)).not.toHaveBeenCalled()

    wrapper.unmount()
  })

  it('shows a visible error state when cards fail to load', async () => {
    vi.mocked(kanbanCommands.listBoards).mockResolvedValue([makeBoard()])
    vi.mocked(kanbanCommands.listCards).mockRejectedValue(new Error('Cards unavailable'))

    const wrapper = await mountView()

    await vi.waitFor(() => {
      expect(wrapper.text()).toContain('Could not load this board.')
    })

    expect(wrapper.text()).toContain('Cards unavailable')
    expect(wrapper.find('.kanban-column-stub').exists()).toBe(false)

    wrapper.unmount()
  })

  it('moves a dragged card using reactive drag state before transfer fallback data', async () => {
    vi.mocked(kanbanCommands.listBoards).mockResolvedValue([
      {
        ...makeBoard(),
        propertyDefinitions: [
          {
            id: 'status',
            name: 'Status',
            type: 'select',
            order: 0,
            options: [
              { id: 'todo', name: 'Todo', color: '#3b82f6' },
              { id: 'done', name: 'Done', color: '#22c55e' },
            ],
          },
        ],
      },
    ])
    vi.mocked(kanbanCommands.listCards).mockResolvedValue([makeCard()])

    const wrapper = await mountViewWithStubs('board-1', {
      KanbanColumn: DragDropColumnStub,
    })

    await vi.waitFor(() => {
      expect(wrapper.find('.kanban-column-drag-stub').exists()).toBe(true)
    })

    const dataTransfer = {
      effectAllowed: 'none',
      store: new Map<string, string>(),
      setData(type: string, value: string) {
        this.store.set(type, value)
      },
      getData(type: string) {
        return this.store.get(type) ?? ''
      },
    }

    await wrapper.find('.drag-start').trigger('dragstart', { dataTransfer })
    expect(dataTransfer.effectAllowed).toBe('move')
    expect(dataTransfer.getData('text/plain')).toBe('card-1')

    dataTransfer.setData('cardId', 'wrong-card')
    dataTransfer.setData('text/plain', 'wrong-card')

    await wrapper.find('.drop-target').trigger('drop', { dataTransfer })
    await flushUi()

    expect(kanbanCommands.moveCard).toHaveBeenCalledWith('/workspace', 'board-1', 'card-1', 'todo', 0)

    wrapper.unmount()
  })

  it('moves a card from handle pointer drag when the webview does not start native DnD', async () => {
    vi.mocked(kanbanCommands.listBoards).mockResolvedValue([
      {
        ...makeBoard(),
        propertyDefinitions: [
          {
            id: 'status',
            name: 'Status',
            type: 'select',
            order: 0,
            options: [
              { id: 'todo', name: 'Todo', color: '#3b82f6' },
              { id: 'done', name: 'Done', color: '#22c55e' },
            ],
          },
        ],
      },
    ])
    vi.mocked(kanbanCommands.listCards).mockResolvedValue([makeCard()])

    const wrapper = await mountViewWithStubs('board-1', {
      KanbanColumn: DragDropColumnStub,
    })

    await vi.waitFor(() => {
      expect(wrapper.find('.pointer-drag-start').exists()).toBe(true)
    })

    const dropTarget = wrapper.find('.drop-target').element as HTMLElement
    const originalElementFromPoint = document.elementFromPoint
    Object.defineProperty(document, 'elementFromPoint', {
      configurable: true,
      value: vi.fn(() => dropTarget),
    })

    const pointerDownEvent = new MouseEvent('pointerdown', {
      bubbles: true,
      button: 0,
      clientX: 10,
      clientY: 10,
    })
    Object.defineProperty(pointerDownEvent, 'pointerId', { value: 7 })
    wrapper.find('.pointer-drag-start').element.dispatchEvent(pointerDownEvent)

    const moveEvent = new MouseEvent('pointermove', { bubbles: true, clientX: 40, clientY: 50 })
    Object.defineProperty(moveEvent, 'pointerId', { value: 7 })
    window.dispatchEvent(moveEvent)
    await flushUi()

    expect(document.body.classList.contains('kb-kanban-dragging')).toBe(true)

    const upEvent = new MouseEvent('pointerup', { bubbles: true, clientX: 40, clientY: 50 })
    Object.defineProperty(upEvent, 'pointerId', { value: 7 })
    window.dispatchEvent(upEvent)
    await flushUi()

    expect(kanbanCommands.moveCard).toHaveBeenCalledWith('/workspace', 'board-1', 'card-1', 'todo', 0)
    expect(document.body.classList.contains('kb-kanban-dragging')).toBe(false)

    Object.defineProperty(document, 'elementFromPoint', {
      configurable: true,
      value: originalElementFromPoint,
    })
    wrapper.unmount()
  })

  it('lifts the original card into a floating pointer-drag state after crossing the drag threshold', async () => {
    vi.mocked(kanbanCommands.listBoards).mockResolvedValue([makeBoard()])
    vi.mocked(kanbanCommands.listCards).mockResolvedValue([makeCard()])

    const wrapper = await mountViewWithStubs('board-1', {})

    await vi.waitFor(() => {
      expect(wrapper.find('.kb-card__handle').exists()).toBe(true)
    })

    const dropTarget = wrapper.find('.kb-drop-zone').element as HTMLElement
    const card = wrapper.find('.kb-card')
    const cardEl = card.element as HTMLElement
    const handleEl = wrapper.find('.kb-card__handle').element as HTMLElement
    const originalElementFromPoint = document.elementFromPoint
    const originalRect = cardEl.getBoundingClientRect

    Object.defineProperty(cardEl, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({
        x: 80,
        y: 110,
        top: 110,
        left: 80,
        right: 328,
        bottom: 172,
        width: 248,
        height: 62,
      }),
    })

    Object.defineProperty(document, 'elementFromPoint', {
      configurable: true,
      value: vi.fn(() => dropTarget),
    })

    const pointerDownEvent = new MouseEvent('pointerdown', {
      bubbles: true,
      button: 0,
      clientX: 110,
      clientY: 126,
    })
    Object.defineProperty(pointerDownEvent, 'pointerId', { value: 11 })
    handleEl.dispatchEvent(pointerDownEvent)

    const belowThresholdMove = new MouseEvent('pointermove', { bubbles: true, clientX: 112, clientY: 127 })
    Object.defineProperty(belowThresholdMove, 'pointerId', { value: 11 })
    window.dispatchEvent(belowThresholdMove)
    await flushUi()

    expect(card.classes()).not.toContain('kb-card--floating')

    const startDragMove = new MouseEvent('pointermove', { bubbles: true, clientX: 146, clientY: 152 })
    Object.defineProperty(startDragMove, 'pointerId', { value: 11 })
    window.dispatchEvent(startDragMove)
    await flushUi()

    expect(card.classes()).toContain('kb-card--dragging')
    expect(card.classes()).toContain('kb-card--floating')
    expect(card.attributes('style')).toContain('width: 248px;')
    expect(card.attributes('style')).toContain('translate3d(130px, 146px, 0)')

    const upEvent = new MouseEvent('pointerup', { bubbles: true, clientX: 146, clientY: 152 })
    Object.defineProperty(upEvent, 'pointerId', { value: 11 })
    window.dispatchEvent(upEvent)
    await flushUi()

    expect(card.classes()).not.toContain('kb-card--floating')
    expect(card.classes()).not.toContain('kb-card--dragging')
    expect(document.body.classList.contains('kb-kanban-dragging')).toBe(false)

    Object.defineProperty(cardEl, 'getBoundingClientRect', {
      configurable: true,
      value: originalRect,
    })
    Object.defineProperty(document, 'elementFromPoint', {
      configurable: true,
      value: originalElementFromPoint,
    })
    wrapper.unmount()
  })

  it('updates pointer drag transform through direct DOM writes without replacing the floating style prop on each move', async () => {
    vi.mocked(kanbanCommands.listBoards).mockResolvedValue([makeBoard()])
    vi.mocked(kanbanCommands.listCards).mockResolvedValue([makeCard()])

    const wrapper = await mountViewWithStubs('board-1', {
      KanbanColumn: PointerDragRuntimeColumnStub,
    })

    await vi.waitFor(() => {
      expect(wrapper.find('.pointer-drag-start').exists()).toBe(true)
    })

    const columnStub = wrapper.findComponent(PointerDragRuntimeColumnStub)
    const card = wrapper.find('.kb-card')
    const cardEl = card.element as HTMLElement
    const handleEl = wrapper.find('.pointer-drag-start').element as HTMLElement
    const dropTarget = wrapper.find('.drop-target').element as HTMLElement
    const originalRect = cardEl.getBoundingClientRect
    const originalElementFromPoint = document.elementFromPoint

    Object.defineProperty(cardEl, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({
        x: 80,
        y: 110,
        top: 110,
        left: 80,
        right: 328,
        bottom: 172,
        width: 248,
        height: 62,
      }),
    })

    Object.defineProperty(document, 'elementFromPoint', {
      configurable: true,
      value: vi.fn(() => dropTarget),
    })

    const pointerDownEvent = new MouseEvent('pointerdown', {
      bubbles: true,
      button: 0,
      clientX: 110,
      clientY: 126,
    })
    Object.defineProperty(pointerDownEvent, 'pointerId', { value: 15 })
    handleEl.dispatchEvent(pointerDownEvent)

    const startDragMove = new MouseEvent('pointermove', { bubbles: true, clientX: 146, clientY: 152 })
    Object.defineProperty(startDragMove, 'pointerId', { value: 15 })
    window.dispatchEvent(startDragMove)
    await flushUi()

    expect((columnStub.vm as { floatingStyleChanges: number }).floatingStyleChanges).toBe(1)
    expect(card.attributes('style')).toContain('translate3d(130px, 146px, 0)')

    const followMove = new MouseEvent('pointermove', { bubbles: true, clientX: 196, clientY: 210 })
    Object.defineProperty(followMove, 'pointerId', { value: 15 })
    window.dispatchEvent(followMove)
    await flushPointerFrames(3)

    expect((columnStub.vm as { floatingStyleChanges: number }).floatingStyleChanges).toBe(1)
    expect(card.attributes('style')).toContain('translate3d(180px, 204px, 0)')

    const upEvent = new MouseEvent('pointerup', { bubbles: true, clientX: 196, clientY: 210 })
    Object.defineProperty(upEvent, 'pointerId', { value: 15 })
    window.dispatchEvent(upEvent)
    await flushUi()

    Object.defineProperty(cardEl, 'getBoundingClientRect', {
      configurable: true,
      value: originalRect,
    })
    Object.defineProperty(document, 'elementFromPoint', {
      configurable: true,
      value: originalElementFromPoint,
    })
    wrapper.unmount()
  })

  it('maps vertical wheel input to horizontal board scrolling when the board overflows', async () => {
    vi.mocked(kanbanCommands.listBoards).mockResolvedValue([
      {
        ...makeBoard(),
        propertyDefinitions: [
          {
            id: 'status',
            name: 'Status',
            type: 'select',
            order: 0,
            options: [
              { id: 'todo', name: 'Todo', color: '#3b82f6' },
              { id: 'done', name: 'Done', color: '#22c55e' },
            ],
          },
        ],
      },
    ])
    vi.mocked(kanbanCommands.listCards).mockResolvedValue([makeCard()])

    const wrapper = await mountView()

    await vi.waitFor(() => {
      expect(wrapper.find('.kb-view__board').exists()).toBe(true)
    })

    const boardEl = wrapper.get('.kb-view__board').element as HTMLElement
    let scrollLeft = 24
    Object.defineProperty(boardEl, 'clientWidth', { configurable: true, value: 320 })
    Object.defineProperty(boardEl, 'scrollWidth', { configurable: true, value: 920 })
    Object.defineProperty(boardEl, 'scrollLeft', {
      configurable: true,
      get: () => scrollLeft,
      set: (value: number) => { scrollLeft = value },
    })

    const wheelEvent = new WheelEvent('wheel', {
      bubbles: true,
      cancelable: true,
      deltaY: 120,
      deltaX: 0,
    })

    boardEl.dispatchEvent(wheelEvent)

    expect(scrollLeft).toBe(144)
    expect(wheelEvent.defaultPrevented).toBe(true)

    wrapper.unmount()
  })

  it('does not intercept wheel scrolling when the board does not overflow horizontally', async () => {
    vi.mocked(kanbanCommands.listBoards).mockResolvedValue([makeBoard()])
    vi.mocked(kanbanCommands.listCards).mockResolvedValue([makeCard()])

    const wrapper = await mountView()

    await vi.waitFor(() => {
      expect(wrapper.find('.kb-view__board').exists()).toBe(true)
    })

    const boardEl = wrapper.get('.kb-view__board').element as HTMLElement
    let scrollLeft = 12
    Object.defineProperty(boardEl, 'clientWidth', { configurable: true, value: 640 })
    Object.defineProperty(boardEl, 'scrollWidth', { configurable: true, value: 640 })
    Object.defineProperty(boardEl, 'scrollLeft', {
      configurable: true,
      get: () => scrollLeft,
      set: (value: number) => { scrollLeft = value },
    })

    const wheelEvent = new WheelEvent('wheel', {
      bubbles: true,
      cancelable: true,
      deltaY: 120,
      deltaX: 0,
    })

    boardEl.dispatchEvent(wheelEvent)

    expect(scrollLeft).toBe(12)
    expect(wheelEvent.defaultPrevented).toBe(false)

    wrapper.unmount()
  })

  it('creates a card from the inline quick add row', async () => {
    vi.mocked(kanbanCommands.listBoards).mockResolvedValue([makeBoard()])
    vi.mocked(kanbanCommands.listCards).mockResolvedValue([makeCard()])
    vi.mocked(kanbanCommands.createCard).mockResolvedValue({
      ...makeCard(),
      id: 'card-2',
      title: 'Draft launch note',
      columnOrder: 1,
    })

    const wrapper = await mountViewWithStubs('board-1', {})

    await vi.waitFor(() => {
      expect(wrapper.find('.kb-column__add-btn').exists()).toBe(true)
    })

    await wrapper.find('.kb-column__add-btn').trigger('click')
    await wrapper.find('.kb-column__quick-input').setValue('Draft launch note')
    await wrapper.find('.kb-column__quick-add').trigger('submit')
    await flushUi()

    expect(kanbanCommands.createCard).toHaveBeenCalledWith('/workspace', 'board-1', 'Draft launch note', 'todo', 'status', 1)

    wrapper.unmount()
  })

  it('persists board display settings from the toolbar menu', async () => {
    const board = {
      ...makeBoard(),
      viewSettings: {
        board: {
          visiblePropertyIds: ['priority'],
          propertyOrder: ['priority'],
          showCardPreview: true,
          cardDensity: 'comfortable' as const,
        },
      },
    }
    vi.mocked(kanbanCommands.listBoards).mockResolvedValue([board])
    vi.mocked(kanbanCommands.listCards).mockResolvedValue([
      {
        ...makeCard(),
        fields: [
          {
            id: 'priority',
            name: 'Priority',
            type: 'select',
            value: 'high',
            order: 0,
            options: [{ id: 'high', name: 'High' }],
          },
        ],
      },
    ])
    vi.mocked(kanbanCommands.updateBoard).mockResolvedValue({
      ...board,
      viewSettings: {
        board: {
          visiblePropertyIds: ['priority'],
          propertyOrder: ['priority'],
          showCardPreview: true,
          cardDensity: 'compact',
        },
      },
    })

    const wrapper = await mountViewWithStubs('board-1', {})

    await vi.waitFor(() => {
      expect(wrapper.text()).toContain('Display')
    })

    await wrapper.findAll('.kb-toolbar__btn').find(button => button.text() === 'Display')?.trigger('click')
    await flushUi()

    const compactDensityButton = Array.from(document.body.querySelectorAll<HTMLButtonElement>('.kb-toolbar__density-btn'))
      .find(button => button.textContent?.trim() === 'Compact')
    expect(compactDensityButton).toBeTruthy()
    compactDensityButton!.click()
    await flushUi()

    expect(kanbanCommands.updateBoard).toHaveBeenCalledWith('/workspace', 'board-1', {
      viewSettings: {
        board: {
          visiblePropertyIds: ['priority'],
          propertyOrder: ['priority'],
          showCardPreview: true,
          cardDensity: 'compact',
        },
      },
    })

    wrapper.unmount()
  })
})
