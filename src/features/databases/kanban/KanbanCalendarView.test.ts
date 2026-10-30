import { afterEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import KanbanCalendarView from './KanbanCalendarView.vue'
import type { KanbanBoard, KanbanCard } from '../../../types/kanban'
import enMessages from '../../../locales/en.json'

const board: KanbanBoard = {
  id: 'board-1',
  title: 'Board',
  icon: '🗂️',
  folderId: null,
  statusPropertyId: 'status',
  propertyDefinitions: [],
  createdAt: '2026-10-01T10:00:00.000Z',
  updatedAt: '2026-10-01T10:00:00.000Z',
}

function cardDueOn(date: string): KanbanCard {
  return {
    id: 'card-1',
    boardId: 'board-1',
    title: 'Due card',
    icon: '✅',
    content: { type: 'doc', content: [] },
    properties: {},
    fields: [{ id: 'due', name: 'Due', type: 'date', value: date, order: 0 }],
    columnOrder: 0,
    createdAt: '2026-10-01T10:00:00.000Z',
    updatedAt: '2026-10-01T10:00:00.000Z',
  }
}

describe('KanbanCalendarView', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  // The suite runs in Europe/Moscow (UTC+3), where a local midnight is still the
  // previous day in UTC — a UTC-derived day key would shift cards by one day.
  it('places a card and the today marker on their local calendar day', () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 9, 15, 1, 30))

    const wrapper = mount(KanbanCalendarView, {
      props: { board, cards: [cardDueOn('2026-10-15')] },
      global: { plugins: [createI18n({ legacy: false, locale: 'en', messages: { en: enMessages } })] },
    })

    const day = wrapper.find('.kb-cal__event').element.closest('.kb-cal__day')
    expect(day?.querySelector('.kb-cal__day-num')?.textContent).toBe('15')
    expect(wrapper.find('.kb-cal__day-num--today').text()).toBe('15')
  })
})
