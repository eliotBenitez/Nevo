import { afterEach, describe, expect, it, vi } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createI18n } from 'vue-i18n'
import { defineComponent, nextTick } from 'vue'
import KanbanCardModal from './KanbanCardModal.vue'
import NvButton from '../../../ui/primitives/NvButton.vue'
import NvCheckbox from '../../../ui/primitives/NvCheckbox.vue'
import NvNumberInput from '../../../ui/primitives/NvNumberInput.vue'
import type { KanbanBoard, KanbanCard, KanbanCardField } from '../../../types/kanban'
import { useKanbanStore } from '../../../stores/kanban'
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
          { id: 'done', name: 'Готово', color: '#22c55e' },
        ],
      },
    ],
    automations: [
      {
        id: 'auto-1',
        trigger: 'status_change',
        triggerValue: 'done',
        action: 'notify',
        enabled: true,
      },
    ],
    createdAt: '2026-05-16T10:00:00.000Z',
    updatedAt: '2026-05-16T10:00:00.000Z',
  }
}

function makeFields(): KanbanCardField[] {
  return [
    {
      id: 'summary',
      name: 'Сводка',
      type: 'text',
      value: 'Черновик',
      order: 0,
    },
    {
      id: 'points',
      name: 'Points',
      type: 'number',
      value: 5,
      order: 1,
    },
    {
      id: 'done',
      name: 'Готово',
      type: 'checkbox',
      value: true,
      order: 2,
    },
  ]
}

function makeCard(fields: KanbanCardField[] = makeFields()): KanbanCard {
  return {
    id: 'card-1',
    boardId: 'board-1',
    title: 'Проверить локализацию',
    content: { type: 'doc', content: [] },
    properties: { status: 'todo' },
    fields,
    columnOrder: 0,
    createdAt: '2026-05-16T10:00:00.000Z',
    updatedAt: '2026-05-16T10:00:00.000Z',
  }
}

const MiniEditorStub = defineComponent({
  props: {
    modelValue: {
      type: Object,
      default: () => ({}),
    },
    placeholder: {
      type: String,
      default: '',
    },
    workspacePath: {
      type: String,
      default: null,
    },
    pluginManifests: {
      type: Array,
      default: () => [],
    },
    settings: {
      type: Object,
      default: () => ({}),
    },
  },
  template: '<div class="mini-editor-stub">{{ placeholder }}</div>',
})

const DatePickerStub = defineComponent({
  template: '<div class="date-picker-stub" />',
})

const SelectStub = defineComponent({
  props: {
    options: {
      type: Array,
      default: () => [],
    },
  },
  template: '<div class="select-stub">{{ options.length }}</div>',
})

function mountModal(card = makeCard()): VueWrapper {
  setActivePinia(createPinia())

  const i18n = createI18n({
    legacy: false,
    locale: 'ru',
    messages: {
      en: enMessages,
      ru: ruMessages,
    },
  })

  return mount(KanbanCardModal, {
    attachTo: document.body,
    props: {
      board: makeBoard(),
      card,
    },
    global: {
      plugins: [i18n],
      stubs: {
        NvMiniEditor: MiniEditorStub,
        NvDatePicker: DatePickerStub,
        NvSelect: SelectStub,
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

async function clickAddFieldTrigger() {
  const trigger = document.body.querySelector<HTMLButtonElement>('.km-add-prop-btn')
  expect(trigger).not.toBeNull()
  trigger?.click()
  await flushPopup()
}

afterEach(() => {
  vi.restoreAllMocks()
  document.body.innerHTML = ''
})

describe('KanbanCardModal', () => {
  it('renders localized actions and removes breadcrumb metadata from the header', async () => {
    const wrapper = mountModal()

    await nextTick()

    const dialog = document.body.querySelector<HTMLElement>('[aria-modal="true"]')
    expect(dialog).not.toBeNull()
    expect(dialog?.getAttribute('aria-label')).toBe('Детали карточки')
    expect(document.body.querySelector('.km-breadcrumb')).toBeNull()
    expect(document.body.querySelector('.km-card-id')).toBeNull()

    const bodyText = document.body.textContent ?? ''
    expect(bodyText).toContain('Заметки')
    expect(bodyText).toContain('Связанные карточки')
    expect(bodyText).toContain('Свойства')
    expect(bodyText).toContain('Автоматизация')
    expect(bodyText).toContain('Добавить поле')
    expect(bodyText).toContain('Сохранить')
    expect(bodyText).toContain('Отмена')
    expect(bodyText).not.toContain('Save')
    expect(bodyText).not.toContain('Спросить ИИ')
    expect(bodyText).not.toContain('Поделиться')

    expect(wrapper.findAllComponents(NvButton).length).toBeGreaterThan(0)
    expect(wrapper.findComponent(NvNumberInput).exists()).toBe(true)
    expect(wrapper.findComponent(NvCheckbox).exists()).toBe(true)

    wrapper.unmount()
  })

  it('passes workspace settings to compact editor and saves card content without changing title input separately', async () => {
    const wrapper = mountModal()
    const kanbanStore = useKanbanStore()
    const updateCardSpy = vi.spyOn(kanbanStore, 'updateCard').mockResolvedValue(undefined)

    await nextTick()

    const editor = wrapper.findComponent(MiniEditorStub)
    expect(editor.exists()).toBe(true)
    expect(editor.props('modelValue')).toEqual({ type: 'doc', content: [] })
    expect(editor.props('pluginManifests')).toEqual([])
    expect(editor.props('settings')).toMatchObject({
      editor: expect.objectContaining({ slashCommands: true }),
      features: expect.objectContaining({ kanban: true }),
    })

    const nextContent = {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Новая заметка' }] }],
    }
    await editor.vm.$emit('update:modelValue', nextContent)
    expect(document.body.querySelector<HTMLInputElement>('.km-title-input')?.value).toBe('Проверить локализацию')

    const saveButton = Array.from(document.body.querySelectorAll<HTMLButtonElement>('button'))
      .find(button => button.textContent?.trim() === 'Сохранить')
    expect(saveButton).toBeTruthy()
    saveButton?.click()
    await nextTick()

    expect(updateCardSpy).toHaveBeenCalledWith('board-1', 'card-1', expect.objectContaining({
      title: 'Проверить локализацию',
      content: nextContent,
    }))

    wrapper.unmount()
  })

  it('keeps notes and properties rendered side by side for long property lists', async () => {
    const longFields: KanbanCardField[] = Array.from({ length: 12 }, (_, index) => ({
      id: `field-${index}`,
      name: `Поле ${index + 1}`,
      type: index % 3 === 0 ? 'number' : 'text',
      value: index % 3 === 0 ? index + 1 : `Значение ${index + 1}`,
      order: index,
    }))

    const wrapper = mountModal(makeCard(longFields))

    await nextTick()

    const body = document.body.querySelector<HTMLElement>('.km-body')
    const content = document.body.querySelector<HTMLElement>('.km-content')
    const props = document.body.querySelector<HTMLElement>('.km-props')

    expect(body).not.toBeNull()
    expect(content).not.toBeNull()
    expect(props).not.toBeNull()
    expect(body?.children).toHaveLength(2)
    expect(body?.children[0]).toBe(content)
    expect(body?.children[1]).toBe(props)
    expect(content?.querySelector('.mini-editor-stub')).not.toBeNull()
    expect(content?.querySelector('.km-notes-editor')).not.toBeNull()
    expect(props?.querySelectorAll('.km-field-card')).toHaveLength(12)
    expect(wrapper.findAllComponents(NvNumberInput).length).toBe(4)

    wrapper.unmount()
  })

  it('opens the add field popup, supports keyboard navigation, creates a field, and closes', async () => {
    const wrapper = mountModal()

    await nextTick()

    await clickAddFieldTrigger()

    const menu = document.body.querySelector<HTMLElement>('[role="menu"]')
    expect(menu).not.toBeNull()

    const menuItems = Array.from(document.body.querySelectorAll<HTMLButtonElement>('.nv-menu-item'))
    expect(menuItems.map(item => item.textContent?.trim())).toEqual([
      'Текст',
      'Число',
      'Дата',
      'Флажок',
      'Список',
      'Множественный выбор',
    ])
    expect(document.activeElement).toBe(menuItems[0])

    menu?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
    expect(document.activeElement).toBe(menuItems[1])

    menuItems[2]?.click()
    await flushPopup()

    expect(document.body.querySelector('[role="menu"]')).toBeNull()
    expect(document.body.textContent ?? '').not.toContain('Тип поля')
    expect(document.body.querySelectorAll('.date-picker-stub')).toHaveLength(1)

    wrapper.unmount()
  })

  it('closes the add field popup on outside click', async () => {
    const wrapper = mountModal()

    await nextTick()

    await clickAddFieldTrigger()
    expect(document.body.querySelector('[role="menu"]')).not.toBeNull()

    dispatchOutsidePointerDown()
    await flushPopup()

    expect(document.body.querySelector('[role="menu"]')).toBeNull()

    wrapper.unmount()
  })
})
