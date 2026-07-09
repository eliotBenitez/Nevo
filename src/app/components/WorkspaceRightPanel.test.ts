import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { createPinia, setActivePinia } from 'pinia'
import { defineComponent } from 'vue'
import WorkspaceRightPanel from './WorkspaceRightPanel.vue'
import en from '../../locales/en.json'
import type { NoteDocument } from '../../types/note'
import { useNoteStore } from '../../stores/note'

vi.mock('@tauri-apps/plugin-opener', () => ({
  openUrl: vi.fn(),
}))

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
})
