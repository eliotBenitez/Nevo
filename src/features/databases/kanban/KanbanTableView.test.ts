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
    expect(wrapper.text()).toContain('1 карточка · 1 группа')
    expect(wrapper.text()).not.toContain('items')

    wrapper.unmount()
  })
  function mountTable(board: KanbanBoard, cards: KanbanCard[]) {
    const i18n = createI18n({ legacy: false, locale: 'ru', messages: { en: enMessages, ru: ruMessages } })
    return mount(KanbanTableView, { props: { board, cards }, global: { plugins: [i18n] } })
  }

  it('pluralizes the footer summary for Russian', () => {
    const cases: Array<[number, string]> = [
      [1, '1 карточка · 1 группа'],
      [2, '2 карточки · 1 группа'],
      [5, '5 карточек · 1 группа'],
      [21, '21 карточка · 1 группа'],
    ]
    for (const [count, expected] of cases) {
      const cards = Array.from({ length: count }, (_, index) => ({ ...makeCard(), id: `card-${index}` }))
      const wrapper = mountTable(makeBoard(), cards)
      expect(wrapper.text()).toContain(expected)
      wrapper.unmount()
    }
  })

  it('localizes default status names in the header, group rows and chips', () => {
    const board = makeBoard()
    board.propertyDefinitions[0].name = 'Status'
    board.propertyDefinitions[0].options = [{ id: 'todo', name: 'To Do', color: '#3b82f6' }]
    const wrapper = mountTable(board, [makeCard()])
    expect(wrapper.find('.kb-table__th--status').text()).toBe(ruMessages.kanban.defaultStatuses.status)
    expect(wrapper.find('.kb-table__group-name').text()).toBe(ruMessages.kanban.defaultStatuses.toDo)
    expect(wrapper.find('.kb-table__status').text()).toBe(ruMessages.kanban.defaultStatuses.toDo)
    expect(wrapper.text()).not.toContain('To Do')
    wrapper.unmount()
  })
})
