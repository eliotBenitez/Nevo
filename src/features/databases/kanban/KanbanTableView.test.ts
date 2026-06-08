import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import KanbanTableView from './KanbanTableView.vue'
import type { KanbanBoard, KanbanCard } from '../../../types/kanban'
import enMessages from '../../../locales/en.json'
import ruMessages from '../../../locales/ru.json'

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
        name: 'Статус',
        type: 'select',
        order: 0,
        options: [
          { id: 'todo', name: 'К выполнению', color: '#3b82f6' },
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
    title: '',
    content: { type: 'doc', content: [] },
    properties: { status: 'todo' },
    fields: [
      {
        id: 'due-date',
        name: 'Дата релиза',
        type: 'date',
        value: '2026-05-18',
        order: 0,
      },
    ],
    columnOrder: 0,
    createdAt: '2026-05-16T10:00:00.000Z',
    updatedAt: '2026-05-16T10:00:00.000Z',
  }
}

describe('KanbanTableView', () => {
  it('renders localized headers and summary text', () => {
    const i18n = createI18n({
      legacy: false,
      locale: 'ru',
      messages: {
        en: enMessages,
        ru: ruMessages,
      },
    })

    const wrapper = mount(KanbanTableView, {
      props: {
        board: makeBoard(),
        cards: [makeCard()],
      },
      global: {
        plugins: [i18n],
      },
    })

    expect(wrapper.text()).toContain('Статус')
    expect(wrapper.text()).toContain('Выбрать поля')
    expect(wrapper.text()).toContain('Дата релиза')
    expect(wrapper.text()).toContain('Без названия')
    expect(wrapper.text()).toContain('1 карточек · 1 групп')
    expect(wrapper.text()).not.toContain('items')

    wrapper.unmount()
  })
})
