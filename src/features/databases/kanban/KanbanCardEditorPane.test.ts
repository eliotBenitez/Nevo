import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import KanbanCardEditorPane from './KanbanCardEditorPane.vue'
import type { KanbanBoard, KanbanCard } from '../../../types/kanban'
import enMessages from '../../../locales/en.json'

const updateCard = vi.fn()
let collectedPriority: 'none' | 'low' | 'medium' | 'high' | 'urgent' = 'none'
const collectProperties = vi.fn(() => ({ fields: [], priority: collectedPriority }))
vi.mock('../../../stores/kanban', () => ({ useKanbanStore: () => ({ updateCard, deleteCard: vi.fn() }) }))
vi.mock('../../../stores/workspace', () => ({ useWorkspaceStore: () => ({ activePath: '', plugins: [], settings: {} }) }))
vi.mock('../../../ui/composables/useConfirmDialog', () => ({ useConfirmDialog: () => ({ confirm: vi.fn(async () => true) }) }))

const PropertiesStub = defineComponent({
  props: { card: { type: Object, required: true }, statusValue: { type: String, default: null } },
  setup(_props, { expose }) { expose({ collect: collectProperties }) },
  template: '<div class="properties-stub" />',
})
const EditorStub = defineComponent({
  props: { modelValue: { type: Object, default: null }, showBlockHandle: { type: Boolean, default: true } },
  emits: ['update:modelValue'],
  template: '<div class="editor-stub nv-prosemirror" />',
})
const LinksStub = defineComponent({ template: '<div class="links-stub" />' })

const card = { id: 'card-1', title: 'First', content: { type: 'doc', content: [] }, fields: [], properties: {}, links: [], priority: 'low' } as unknown as KanbanCard
const board = { id: 'board-1', title: 'Board', icon: 'FileText', properties: [], statusPropertyId: '' } as unknown as KanbanBoard

function mountPane() {
  return mount(KanbanCardEditorPane, {
    props: { card, board },
    global: {
      plugins: [createI18n({ legacy: false, locale: 'en', messages: { en: enMessages } })],
      stubs: { KanbanCardProperties: PropertiesStub, NvMiniEditor: EditorStub, KanbanCardLinks: LinksStub, NvButton: true },
    },
  })
}

describe('KanbanCardEditorPane', () => {
  beforeEach(() => {
    updateCard.mockReset()
    collectProperties.mockClear()
    collectedPriority = 'none'
  })

  it('saves the latest edits before allowing a flush to complete', async () => {
    let resolveFirst!: () => void
    updateCard.mockImplementationOnce(() => new Promise<void>(resolve => { resolveFirst = resolve }))
    const wrapper = mountPane()
    const input = wrapper.get('input')
    await input.setValue('Second')
    const flushing = (wrapper.vm as unknown as { flush: () => Promise<boolean> }).flush()
    await nextTick()
    await input.setValue('Latest')
    resolveFirst()
    expect(await flushing).toBe(true)
    expect(updateCard).toHaveBeenCalledTimes(2)
    expect(updateCard.mock.calls[1][2].title).toBe('Latest')
    wrapper.unmount()
  })

  it('hides block handles in the card notes editor', () => {
    const wrapper = mountPane()
    expect(wrapper.findComponent(EditorStub).props('showBlockHandle')).toBe(false)
    wrapper.unmount()
  })

  it('keeps the editor open when saving fails', async () => {
    updateCard.mockRejectedValueOnce(new Error('disk unavailable'))
    const wrapper = mountPane()
    await wrapper.get('input').setValue('Changed')
    expect(await (wrapper.vm as unknown as { flush: () => Promise<boolean> }).flush()).toBe(false)
    expect(wrapper.text()).toContain('Could not save changes.')
    wrapper.unmount()
  })

  it('saves dirty title and body edits before Escape closes the card', async () => {
    const wrapper = mountPane()
    await wrapper.get('input').setValue('Updated title')
    const editor = wrapper.findComponent(EditorStub)
    const updatedContent = { type: 'doc', content: [{ type: 'paragraph' }] }
    editor.vm.$emit('update:modelValue', updatedContent)

    await wrapper.get('input').trigger('keydown', { key: 'Escape' })
    await vi.waitFor(() => expect(wrapper.emitted('back')).toHaveLength(1))

    expect(updateCard).toHaveBeenCalledTimes(1)
    expect(updateCard.mock.calls[0][2].title).toBe('Updated title')
    expect(updateCard.mock.calls[0][2].content).toEqual(updatedContent)
    wrapper.unmount()
  })

  it('closes the properties popover before Escape closes the card', async () => {
    const wrapper = mountPane()
    const details = wrapper.get('.kb-editor-properties').element as HTMLDetailsElement
    details.open = true

    await wrapper.get('input').trigger('keydown', { key: 'Escape' })
    expect(details.open).toBe(false)
    expect(wrapper.emitted('back')).toBeUndefined()

    await wrapper.get('input').trigger('keydown', { key: 'Escape' })
    await vi.waitFor(() => expect(wrapper.emitted('back')).toHaveLength(1))
    wrapper.unmount()
  })

  it('closes on ProseMirror Escape even when the editor later prevents the event', async () => {
    const wrapper = mountPane()
    const editor = wrapper.find('.editor-stub').element
    editor.addEventListener('keydown', event => event.preventDefault())
    const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
    editor.dispatchEvent(event)
    await nextTick()
    expect(event.defaultPrevented).toBe(true)
    await vi.waitFor(() => expect(wrapper.emitted('back')).toHaveLength(1))
    wrapper.unmount()
  })

  it('lets any visible editor overlay handle Escape before closing the card', async () => {
    const wrapper = mountPane()
    document.body.append(wrapper.element)
    const popup = document.createElement('div')
    popup.className = 'editor-overlay floating-toolbar'
    document.body.append(popup)
    const editor = wrapper.find('.editor-stub').element

    editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
    expect(wrapper.emitted('back')).toBeUndefined()

    popup.remove()
    editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
    await vi.waitFor(() => expect(wrapper.emitted('back')).toHaveLength(1))
    wrapper.unmount()
  })

  it('closes the card when Escape originates outside the pane', async () => {
    const wrapper = mountPane()
    document.body.append(wrapper.element)
    const boardCard = document.createElement('button')
    boardCard.className = 'kb-card'
    document.body.append(boardCard)

    boardCard.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
    await vi.waitFor(() => expect(wrapper.emitted('back')).toHaveLength(1))

    boardCard.remove()
    wrapper.unmount()
  })

  it('keeps the card open when saving fails during Escape', async () => {
    updateCard.mockRejectedValueOnce(new Error('disk unavailable'))
    const wrapper = mountPane()
    await wrapper.get('input').setValue('Unsaved')

    await wrapper.get('input').trigger('keydown', { key: 'Escape' })
    await vi.waitFor(() => expect(wrapper.text()).toContain('Could not save changes.'))
    expect(wrapper.emitted('back')).toBeUndefined()
    wrapper.unmount()
  })

  it('persists clearing a previously set priority', async () => {
    const wrapper = mountPane()
    await wrapper.get('input').setValue('First, without priority')
    expect(await (wrapper.vm as unknown as { flush: () => Promise<boolean> }).flush()).toBe(true)
    expect(updateCard).toHaveBeenCalledTimes(1)
    expect(updateCard.mock.calls[0][2].priority).toBe('none')
    wrapper.unmount()
  })

  it('closes properties on outside pointerdown but keeps them mounted for autosave', async () => {
    const wrapper = mountPane()
    document.body.append(wrapper.element)
    const details = wrapper.get('.kb-editor-properties').element as HTMLDetailsElement
    details.open = true

    const selectMenu = document.createElement('div')
    selectMenu.className = 'nv-select__menu'
    const menuItem = document.createElement('button')
    selectMenu.append(menuItem)
    document.body.append(selectMenu)
    menuItem.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    expect(details.open).toBe(true)
    selectMenu.remove()

    const tagDropdown = document.createElement('div')
    tagDropdown.className = 'nv-popup-menu__panel'
    const tagOption = document.createElement('button')
    tagDropdown.append(tagOption)
    document.body.append(tagDropdown)
    tagOption.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    expect(details.open).toBe(true)
    tagDropdown.remove()

    wrapper.get('.kb-editor-title').element.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    await nextTick()
    expect(details.open).toBe(false)
    expect(wrapper.findComponent(PropertiesStub).exists()).toBe(true)

    await wrapper.get('input').setValue('Saved with properties closed')
    expect(await (wrapper.vm as unknown as { flush: () => Promise<boolean> }).flush()).toBe(true)
    expect(collectProperties).toHaveBeenCalledTimes(1)
    expect(updateCard.mock.calls[0][2].priority).toBe('none')
    wrapper.unmount()
  })
})
