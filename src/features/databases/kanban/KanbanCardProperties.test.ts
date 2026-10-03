import { afterEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import type { KanbanBoard, KanbanCard } from '../../../types/kanban'
import enMessages from '../../../locales/en.json'
import NvButton from '../../../ui/primitives/NvButton.vue'
import NvPopupMenu from '../../../ui/primitives/NvPopupMenu.vue'
import KanbanCardProperties from './KanbanCardProperties.vue'

const card = {
  id: 'card-1',
  title: 'Card',
  fields: [{
    id: 'tags',
    name: 'Tags',
    type: 'multi_select',
    value: [],
    options: [{ id: 'urgent', name: 'Urgent' }, { id: 'active', name: 'In progress' }],
    order: 0,
  }],
  priority: 'none',
} as unknown as KanbanCard

const board = { id: 'board-1', properties: [] } as unknown as KanbanBoard

describe('KanbanCardProperties tag picker', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('renders the tag picker outside a clipped properties popover and focuses its search input', async () => {
    const wrapper = mount(KanbanCardProperties, {
      attachTo: document.body,
      props: { card, board, statusValue: null, taskProgress: null, markDirty: vi.fn() },
      global: {
        plugins: [createI18n({ legacy: false, locale: 'en', messages: { en: enMessages } })],
        components: { NvButton, NvPopupMenu },
      },
    })
    const clippedParent = document.createElement('div')
    clippedParent.className = 'kb-editor-properties-popover'
    wrapper.element.parentElement?.insertBefore(clippedParent, wrapper.element)
    clippedParent.append(wrapper.element)

    await wrapper.get('.km-add-tag-pill-btn').trigger('click')
    await nextTick()
    await nextTick()

    const dropdown = document.body.querySelector('.km-tags-dropdown')
    expect(dropdown).not.toBeNull()
    expect(clippedParent.contains(dropdown)).toBe(false)
    expect(document.activeElement).toBe(dropdown?.querySelector('input'))

    wrapper.unmount()
  })
})
