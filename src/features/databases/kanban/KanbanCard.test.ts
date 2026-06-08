import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import KanbanCard from './KanbanCard.vue'
import type { KanbanBoard, KanbanCard as KanbanCardType } from '../../../types/kanban'
import enMessages from '../../../locales/en.json'

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

function makeCard(): KanbanCardType {
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

function makeCardWithFields(): KanbanCardType {
  return {
    ...makeCard(),
    content: {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Preview text from the body' }],
        },
      ],
    },
    fields: [
      {
        id: 'priority',
        name: 'Priority',
        type: 'select',
        value: 'high',
        order: 0,
        options: [{ id: 'high', name: 'High', color: '#ef4444' }],
      },
      {
        id: 'owner',
        name: 'Owner',
        type: 'text',
        value: 'Mina',
        order: 1,
      },
    ],
  }
}

describe('KanbanCard', () => {
  it('emits handle-pointerdown when pressing the handle', async () => {
    const i18n = createI18n({
      legacy: false,
      locale: 'en',
      messages: {
        en: enMessages,
      },
    })

    const wrapper = mount(KanbanCard, {
      props: {
        card: makeCard(),
        board: makeBoard(),
      },
      global: {
        plugins: [i18n],
      },
    })

    const pointerDownEvent = new MouseEvent('pointerdown', {
      bubbles: true,
      button: 0,
      clientX: 12,
      clientY: 16,
    })
    Object.defineProperty(pointerDownEvent, 'pointerId', { value: 3 })
    wrapper.find('.kb-card__handle').element.dispatchEvent(pointerDownEvent)

    expect(wrapper.emitted('handle-pointerdown')).toHaveLength(1)
    expect(wrapper.emitted('handle-pointerdown')?.[0]?.[1]).toBe('card-1')

    wrapper.unmount()
  })

  it('applies floating drag visuals when the active card is lifted', () => {
    const i18n = createI18n({
      legacy: false,
      locale: 'en',
      messages: {
        en: enMessages,
      },
    })

    const wrapper = mount(KanbanCard, {
      props: {
        card: makeCard(),
        board: makeBoard(),
        isDragging: true,
        isFloatingDrag: true,
        floatingStyle: {
          width: '248px',
          transform: 'translate3d(32px, 48px, 0) rotate(2deg) scale(1.018)',
        },
      },
      global: {
        plugins: [i18n],
      },
    })

    const card = wrapper.get('.kb-card')

    expect(card.classes()).toContain('kb-card--dragging')
    expect(card.classes()).toContain('kb-card--floating')
    expect(card.attributes('style')).toContain('width: 248px;')
    expect(card.attributes('style')).toContain('translate3d(32px, 48px, 0)')

    wrapper.unmount()
  })

  it('renders only visible properties from board display settings', () => {
    const i18n = createI18n({
      legacy: false,
      locale: 'en',
      messages: {
        en: enMessages,
      },
    })

    const wrapper = mount(KanbanCard, {
      props: {
        card: makeCardWithFields(),
        board: makeBoard(),
        viewSettings: {
          visiblePropertyIds: ['priority'],
          propertyOrder: ['priority', 'owner'],
          showCardPreview: true,
          cardDensity: 'comfortable',
        },
      },
      global: {
        plugins: [i18n],
      },
    })

    expect(wrapper.text()).toContain('Priority')
    expect(wrapper.text()).toContain('High')
    expect(wrapper.text()).not.toContain('Owner')
    expect(wrapper.text()).not.toContain('Mina')
    expect(wrapper.text()).toContain('Preview text from the body')

    wrapper.unmount()
  })

  it('uses compact density without dropping the title', () => {
    const i18n = createI18n({
      legacy: false,
      locale: 'en',
      messages: {
        en: enMessages,
      },
    })

    const wrapper = mount(KanbanCard, {
      props: {
        card: makeCardWithFields(),
        board: makeBoard(),
        viewSettings: {
          visiblePropertyIds: ['priority', 'owner'],
          propertyOrder: ['priority', 'owner'],
          showCardPreview: true,
          cardDensity: 'compact',
        },
      },
      global: {
        plugins: [i18n],
      },
    })

    expect(wrapper.get('.kb-card').classes()).toContain('kb-card--compact')
    expect(wrapper.text()).toContain('Ship tests')
    expect(wrapper.text()).not.toContain('Preview text from the body')

    wrapper.unmount()
  })
})
