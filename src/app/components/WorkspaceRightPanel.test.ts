import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { createPinia, setActivePinia } from 'pinia'
import { defineComponent, nextTick } from 'vue'
import WorkspaceRightPanel from './WorkspaceRightPanel.vue'
import en from '../../locales/en.json'
import type { NoteDocument } from '../../types/note'
import { useWorkspaceStore } from '../../stores/workspace'
import { useNoteStore } from '../../stores/note'

const SelectStub = defineComponent({
  name: 'NvSelect',
  props: {
    modelValue: { type: String, required: true },
    options: { type: Array, required: true },
    disabled: { type: Boolean, default: false },
  },
  emits: ['update:modelValue'],
  template: `
    <select class="select-stub" :value="modelValue" :disabled="disabled" @change="$emit('update:modelValue', $event.target.value)">
      <option v-for="option in options" :key="option.value" :value="option.value">{{ option.label }}</option>
    </select>
  `,
})

const DatePickerStub = defineComponent({
  name: 'NvDatePicker',
  props: {
    modelValue: { type: String, default: null },
    disabled: { type: Boolean, default: false },
  },
  emits: ['update:modelValue'],
  template: `
    <div class="date-picker-stub">
      <input class="date-picker-stub__input" type="date" :value="modelValue ?? ''" :disabled="disabled" @input="$emit('update:modelValue', $event.target.value || null)">
      <button v-if="modelValue" class="date-picker-stub__clear" type="button" @click="$emit('update:modelValue', null)">clear</button>
    </div>
  `,
})

const i18n = createI18n({ legacy: false, locale: 'en', messages: { en } })

class ResizeObserverStub {
  observe() {}
  disconnect() {}
}

function createNote(): NoteDocument {
  return {
    id: 'note-1',
    title: 'Note',
    icon: '📄',
    folderId: null,
    createdAt: '2026-07-04T10:00:00.000Z',
    updatedAt: '2026-07-04T10:00:00.000Z',
    properties: {
      type: null,
      tags: [],
      date: '2026-07-04',
      status: null,
    },
    content: {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Text' }] }],
    },
  }
}

function mountPanel(note: NoteDocument) {
  return mount(WorkspaceRightPanel, {
    props: { note, editorRootEl: null },
    global: {
      plugins: [i18n],
      stubs: {
        NvSelect: SelectStub,
        NvDatePicker: DatePickerStub,
      },
    },
  })
}

describe('WorkspaceRightPanel', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    Object.defineProperty(globalThis, 'ResizeObserver', {
      value: ResizeObserverStub,
      configurable: true,
      writable: true,
    })
  })

  it('updates note type from properties select', async () => {
    const noteStore = useNoteStore()
    noteStore.activeNote = createNote()
    const wrapper = mountPanel(noteStore.activeNote)

    await wrapper.findAll('select')[0].setValue('task')

    expect(noteStore.activeNote?.properties?.type).toBe('task')
    wrapper.unmount()
  })

  it('adds and removes tags from tag input', async () => {
    const noteStore = useNoteStore()
    noteStore.activeNote = createNote()
    const wrapper = mountPanel(noteStore.activeNote)

    const input = wrapper.find('.right-panel__tag-input')
    await input.setValue('work')
    await input.trigger('keydown', { key: 'Enter' })

    expect(noteStore.activeNote?.properties?.tags).toEqual(['work'])

    await wrapper.setProps({ note: noteStore.activeNote })
    await wrapper.find('.right-panel__tag-remove').trigger('click')

    expect(noteStore.activeNote?.properties?.tags).toEqual([])
    wrapper.unmount()
  })

  it('clears note date to null', async () => {
    const noteStore = useNoteStore()
    noteStore.activeNote = createNote()
    const wrapper = mountPanel(noteStore.activeNote)

    await wrapper.find('.date-picker-stub__clear').trigger('click')

    expect(noteStore.activeNote?.properties?.date).toBeNull()
    wrapper.unmount()
  })

  it('updates note status from properties select', async () => {
    const noteStore = useNoteStore()
    noteStore.activeNote = createNote()
    const wrapper = mountPanel(noteStore.activeNote)

    await wrapper.findAll('select')[1].setValue('waiting')

    expect(noteStore.activeNote?.properties?.status).toBe('waiting')
    wrapper.unmount()
  })

  it('shows an embedded local graph in the Graph tab', async () => {
    const wrapper = mountPanel(createNote())

    await wrapper.get('#right-panel-tab-graph').trigger('click')
    await flushPromises()
    await vi.dynamicImportSettled()
    await nextTick()

    expect(wrapper.find('.right-panel__graph-button').exists()).toBe(false)
    expect(wrapper.find('.right-panel__graph-canvas').exists()).toBe(true)
    wrapper.unmount()
  })

  it('switches tabs with the arrow keys and exposes tab semantics', async () => {
    const wrapper = mountPanel(createNote())
    const documentTab = wrapper.get('#right-panel-tab-document')

    expect(documentTab.attributes('aria-selected')).toBe('true')
    expect(wrapper.find('#right-panel-tabpanel-document').exists()).toBe(true)

    await documentTab.trigger('keydown', { key: 'ArrowRight' })

    expect(wrapper.get('#right-panel-tab-links').attributes('aria-selected')).toBe('true')
    expect(wrapper.get('#right-panel-tab-links').attributes('tabindex')).toBe('0')
    expect(documentTab.attributes('tabindex')).toBe('-1')
    expect(wrapper.find('#right-panel-tabpanel-links').exists()).toBe(true)
    expect(wrapper.find('#right-panel-tabpanel-document').exists()).toBe(false)

    await wrapper.get('#right-panel-tab-links').trigger('keydown', { key: 'End' })
    expect(wrapper.get('#right-panel-tab-graph').attributes('aria-selected')).toBe('true')
    wrapper.unmount()
  })

  it('shows the last update as localized relative time', () => {
    const note = { ...createNote(), updatedAt: new Date().toISOString() }
    const wrapper = mountPanel(note)

    // The panel must use the app's localized relative-time helper, not an
    // English-only formatter.
    const expected = useWorkspaceStore().getRelativeTime(note.updatedAt)
    expect(wrapper.get('.right-panel__meta-value').text()).toBe(expected)
    wrapper.unmount()
  })
})
