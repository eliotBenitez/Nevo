import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { createI18n } from 'vue-i18n'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import EditorQueryPopover from './EditorQueryPopover.vue'
import NvCheckbox from '../../../ui/primitives/NvCheckbox.vue'
import NvDatePicker from '../../../ui/primitives/NvDatePicker.vue'
import NvSelect from '../../../ui/primitives/NvSelect.vue'
import NvTextInput from '../../../ui/primitives/NvTextInput.vue'
import { emptyQueryBlockData } from '../../../features/query/queryBlockData'
import en from '../../../locales/en.json'
import { useWorkspaceStore } from '../../../stores/workspace'
import type { FolderMeta } from '../../../types/note'
import type { WorkspaceManifest } from '../../../types/workspace'

const i18n = createI18n({ legacy: false, locale: 'en', messages: { en } })

function mountPopover(
  onUpdateData?: (value: ReturnType<typeof emptyQueryBlockData>) => void,
  options: { teleport?: boolean; data?: ReturnType<typeof emptyQueryBlockData> } = {},
) {
  return mount(EditorQueryPopover, {
    attachTo: document.body,
    props: {
      open: true,
      data: options.data ?? emptyQueryBlockData(),
      popoverStyle: { top: '100px', left: '200px' },
      'onUpdate:data': onUpdateData,
    },
    global: {
      plugins: [i18n],
      stubs: { teleport: options.teleport ?? true },
    },
  })
}

function folder(id: string, title: string, children: FolderMeta[] = []): FolderMeta {
  return { id, title, icon: '📁', parentId: null, order: 0, children, notes: [] }
}

describe('EditorQueryPopover', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('composes the query form from shared input primitives', () => {
    const wrapper = mountPopover()

    expect(wrapper.findAllComponents(NvTextInput)).toHaveLength(2)
    expect(wrapper.findAllComponents(NvDatePicker)).toHaveLength(2)
    expect(wrapper.findAllComponents(NvCheckbox)).toHaveLength(1)
    expect(wrapper.findAllComponents(NvSelect)).toHaveLength(4)
    expect(wrapper.find('.nv-db-filter__input').exists()).toBe(false)
    expect(wrapper.findAll('.query-popover__control')).toHaveLength(8)
  })

  it('maps shared control values back to query filters', async () => {
    const onUpdateData = vi.fn()
    const wrapper = mountPopover(onUpdateData)

    await wrapper.findAllComponents(NvTextInput)[0].get('input').setValue('red, urgent')
    await wrapper.findComponent(NvCheckbox).get('input').setValue(true)

    expect(onUpdateData.mock.calls[0]?.[0]).toMatchObject({ filters: { tagsAny: ['red', 'urgent'] } })
    expect(onUpdateData.mock.calls[1]?.[0]).toMatchObject({ filters: { includeSubtree: true } })
  })

  it('opens the date picker and maps a selected day back to the query filters', async () => {
    const onUpdateData = vi.fn()
    const data = emptyQueryBlockData()
    data.filters.dateFrom = '2026-08-06'
    const wrapper = mountPopover(onUpdateData, { teleport: false, data })
    const datePicker = wrapper.findAllComponents(NvDatePicker)[0]

    await datePicker.get('.ndp-trigger').trigger('click')
    expect(datePicker.get('.ndp-trigger').classes()).toContain('ndp-trigger--open')
    const calendar = document.body.querySelector<HTMLElement>('.ndp-popover')
    expect(calendar).not.toBeNull()

    const selectedDay = Array.from(calendar?.querySelectorAll<HTMLButtonElement>('.ndp-day') ?? [])
      .find((day) => day.textContent?.trim() === '6' && !day.classList.contains('ndp-day--muted'))
    selectedDay?.click()
    await nextTick()

    expect(onUpdateData).toHaveBeenCalledOnce()
    expect(onUpdateData.mock.calls[0]?.[0].filters.dateFrom).toBe('2026-08-06')
    // The panel is an .editor-overlay (z-index 1300); the calendar must stack above it.
    expect(calendar?.className).toContain('tw:z-[2000]')
    wrapper.unmount()
  })

  it('adds a sort rule without submitting the popover form', async () => {
    const onUpdateData = vi.fn()
    const wrapper = mountPopover(onUpdateData)

    await wrapper.get('.nv-menu-item').trigger('click')

    expect(wrapper.emitted('apply')).toBeUndefined()
    expect(onUpdateData.mock.calls[0]?.[0].sorts).toEqual([{ field: 'title', direction: 'asc' }])
    wrapper.unmount()
  })

  it('picks the folder filter from the workspace folder list', async () => {
    useWorkspaceStore().manifest = {
      tree: [folder('w', 'Work', [folder('p', 'Projects')]), folder('h', 'Home')],
    } as unknown as WorkspaceManifest
    const onUpdateData = vi.fn()
    const wrapper = mountPopover(onUpdateData)
    const folderSelect = wrapper.findAllComponents(NvSelect)
      .find((select) => select.props('ariaLabel') === en.editor.queryBlock.filters.folder)!

    expect(folderSelect.props('options').map((option) => option.value))
      .toEqual(['', 'Work', 'Work / Projects', 'Home'])
    folderSelect.vm.$emit('update:modelValue', 'Work / Projects')
    folderSelect.vm.$emit('update:modelValue', '')

    expect(onUpdateData.mock.calls[0]?.[0].filters.folderPathPrefix).toBe('Work / Projects')
    expect(onUpdateData.mock.calls[1]?.[0].filters.folderPathPrefix).toBeNull()
    wrapper.unmount()
  })

  it('keeps a saved folder path that is no longer in the tree selectable', () => {
    const data = emptyQueryBlockData()
    data.filters.folderPathPrefix = 'Archive'
    const wrapper = mountPopover(undefined, { data })
    const folderSelect = wrapper.findAllComponents(NvSelect)
      .find((select) => select.props('ariaLabel') === en.editor.queryBlock.filters.folder)!

    expect(folderSelect.props('modelValue')).toBe('Archive')
    expect(folderSelect.props('options').map((option) => option.value)).toEqual(['', 'Archive'])
    wrapper.unmount()
  })
})
