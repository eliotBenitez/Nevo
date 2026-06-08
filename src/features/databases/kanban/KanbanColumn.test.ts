import { afterEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { defineComponent, nextTick } from 'vue'
import KanbanColumn from './KanbanColumn.vue'
import type { KanbanBoard, KanbanCard, KanbanPropertyOption } from '../../../types/kanban'
import enMessages from '../../../locales/en.json'
import ruMessages from '../../../locales/ru.json'

function makeBoard(): KanbanBoard {
  return {
    id: 'board-1',
    title: 'Дорожная карта',
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

function makeColumn(): KanbanPropertyOption {
  return {
    id: 'todo',
    name: 'К выполнению',
    color: '#3b82f6',
  }
}

const KanbanCardStub = defineComponent({
  props: {
    card: {
      type: Object,
      required: true,
    },
  },
  template: '<div class="kb-card-stub">{{ card.title }}</div>',
})

function mountColumn(canDelete = true, cards: KanbanCard[] = []) {
  const i18n = createI18n({
    legacy: false,
    locale: 'ru',
    messages: {
      en: enMessages,
      ru: ruMessages,
    },
  })

  return mount(KanbanColumn, {
    attachTo: document.body,
    props: {
      board: makeBoard(),
      column: makeColumn(),
      cards,
      canDelete,
    },
    global: {
      plugins: [i18n],
      stubs: {
        KanbanCardVue: KanbanCardStub,
      },
    },
  })
}

async function flushPopup() {
  await nextTick()
  await nextTick()
}

function dispatchOutsidePointerDown() {
  const EventCtor = window.PointerEvent ?? window.MouseEvent
  document.body.dispatchEvent(new EventCtor('pointerdown', { bubbles: true }))
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('KanbanColumn', () => {
  it('opens the column popup, supports keyboard navigation, and enters rename mode', async () => {
    const wrapper = mountColumn()

    await wrapper.get('[aria-label="Меню колонки"]').trigger('click')
    await flushPopup()

    const menu = document.body.querySelector<HTMLElement>('[role="menu"]')
    expect(menu).not.toBeNull()

    const menuItems = Array.from(document.body.querySelectorAll<HTMLButtonElement>('.nv-menu-item'))
    expect(menuItems.map(item => item.textContent?.trim())).toEqual([
      'Переименовать колонку',
      'Удалить колонку',
    ])
    expect(document.activeElement).toBe(menuItems[0])

    menu?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
    expect(document.activeElement).toBe(menuItems[1])

    menuItems[0]?.click()
    await flushPopup()

    expect(wrapper.find('.kb-column__name-input').exists()).toBe(true)
    expect(document.body.querySelector('[role="menu"]')).toBeNull()

    wrapper.unmount()
  })

  it('emits delete-column from the popup action', async () => {
    const wrapper = mountColumn()

    await wrapper.get('[aria-label="Меню колонки"]').trigger('click')
    await flushPopup()

    const deleteItem = Array.from(document.body.querySelectorAll<HTMLButtonElement>('.nv-menu-item'))
      .find(item => item.textContent?.includes('Удалить колонку'))

    deleteItem?.click()
    await flushPopup()

    expect(wrapper.emitted('delete-column')).toEqual([['todo']])
    expect(document.body.querySelector('[role="menu"]')).toBeNull()

    wrapper.unmount()
  })

  it('renders delete as disabled and non-interactive when the column cannot be deleted', async () => {
    const wrapper = mountColumn(false)

    await wrapper.get('[aria-label="Меню колонки"]').trigger('click')
    await flushPopup()

    const deleteItem = Array.from(document.body.querySelectorAll<HTMLButtonElement>('.nv-menu-item'))
      .find(item => item.textContent?.includes('Удалить колонку'))

    expect(deleteItem).not.toBeUndefined()
    expect(deleteItem?.disabled).toBe(true)

    deleteItem?.click()
    await flushPopup()

    expect(wrapper.emitted('delete-column')).toBeUndefined()
    expect(document.body.querySelector('[role="menu"]')).not.toBeNull()

    wrapper.unmount()
  })

  it('closes the popup on outside click', async () => {
    const wrapper = mountColumn()

    await wrapper.get('[aria-label="Меню колонки"]').trigger('click')
    await flushPopup()
    expect(document.body.querySelector('[role="menu"]')).not.toBeNull()

    dispatchOutsidePointerDown()
    await flushPopup()

    expect(document.body.querySelector('[role="menu"]')).toBeNull()

    wrapper.unmount()
  })
})
