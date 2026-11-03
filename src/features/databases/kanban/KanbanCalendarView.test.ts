import { afterEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createI18n } from 'vue-i18n'
import KanbanCalendarView from './KanbanCalendarView.vue'
import type { KanbanBoard, KanbanCard } from '../../../types/kanban'
import enMessages from '../../../locales/en.json'
import { useKanbanStore } from '../../../stores/kanban'

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
      global: { plugins: [createPinia(), createI18n({ legacy: false, locale: 'en', messages: { en: enMessages } })] },
    })

    const day = wrapper.find('.kb-cal__event').element.closest('.kb-cal__day')
    expect(day?.querySelector('.kb-cal__day-num')?.textContent).toBe('15')
    expect(wrapper.find('.kb-cal__day-num--today').text()).toBe('15')
  })

  it('flags only cards due before today as overdue', () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 9, 15, 12, 0))

    const overdue = (value: string) => mount(KanbanCalendarView, {
      props: { board, cards: [cardDueOn(value)] },
      global: { plugins: [createPinia(), createI18n({ legacy: false, locale: 'en', messages: { en: enMessages } })] },
    }).find('.kb-cal__event--overdue').exists()

    expect(overdue('2026-10-14')).toBe(true)
    expect(overdue('2026-10-15')).toBe(false)
    expect(overdue('2026-10-16')).toBe(false)
  })

  describe('drag to reschedule', () => {
    const init = { bubbles: true, pointerId: 1, isPrimary: true, button: 0 }

    function mountDraggable(value: string) {
      vi.useFakeTimers({ toFake: ['Date'] })
      vi.setSystemTime(new Date(2026, 9, 15, 12, 0))
      const pinia = createPinia()
      setActivePinia(pinia)
      const store = useKanbanStore(pinia)
      const updateCard = vi.spyOn(store, 'updateCard').mockResolvedValue(undefined as never)
      const wrapper = mount(KanbanCalendarView, {
        attachTo: document.body,
        props: { board, cards: [cardDueOn(value)] },
        global: { plugins: [pinia, createI18n({ legacy: false, locale: 'en', messages: { en: enMessages } })] },
      })
      return { wrapper, updateCard }
    }

    function drag(wrapper: ReturnType<typeof mountDraggable>['wrapper'], iso: string | null) {
      const target = iso ? wrapper.get(`[data-iso="${iso}"]`).element : document.body
      document.elementFromPoint = vi.fn(() => target)
      wrapper.get('.kb-cal__event').element.dispatchEvent(new PointerEvent('pointerdown', { ...init, clientX: 10, clientY: 10 }))
      window.dispatchEvent(new PointerEvent('pointermove', { ...init, clientX: 80, clientY: 60 }))
      window.dispatchEvent(new PointerEvent('pointerup', { ...init, clientX: 80, clientY: 60 }))
    }

    it('updates the active date field when a card is dropped on another day', () => {
      const { wrapper, updateCard } = mountDraggable('2026-10-15')
      drag(wrapper, '2026-10-20')
      window.dispatchEvent(new MouseEvent('click'))

      expect(updateCard).toHaveBeenCalledTimes(1)
      const [boardId, cardId, updates] = updateCard.mock.calls[0]
      expect(boardId).toBe('board-1')
      expect(cardId).toBe('card-1')
      expect(updates.fields?.[0]).toMatchObject({ id: 'due', value: '2026-10-20' })
      wrapper.unmount()
    })

    it('keeps the time part of the stored date', () => {
      const { wrapper, updateCard } = mountDraggable('2026-10-15T09:30:00.000Z')
      drag(wrapper, '2026-10-21')
      window.dispatchEvent(new MouseEvent('click'))

      expect(updateCard.mock.calls[0][2].fields?.[0].value).toBe('2026-10-21T09:30:00.000Z')
      wrapper.unmount()
    })

    it('does nothing when dropped on the same day or outside a day cell', () => {
      const { wrapper, updateCard } = mountDraggable('2026-10-15')
      drag(wrapper, '2026-10-15')
      drag(wrapper, null)
      window.dispatchEvent(new MouseEvent('click'))

      expect(updateCard).not.toHaveBeenCalled()
      wrapper.unmount()
    })
  })
})
