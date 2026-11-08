import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import KanbanAutomations from './KanbanAutomations.vue'
import type { KanbanBoard } from '../../../types/kanban'
import enMessages from '../../../locales/en.json'

function makeBoard(enabled: boolean): KanbanBoard {
  return {
    id: 'board-1', title: 'B', icon: 'K', folderId: null, statusPropertyId: 'status', propertyDefinitions: [],
    automations: [{ id: 'a1', trigger: 'subtasks_done', action: 'notify', enabled }],
    createdAt: 't', updatedAt: 't',
  }
}

describe('KanbanAutomations', () => {
  it('emits toggle-automation from the rule switch and follows the board prop', async () => {
    const i18n = createI18n({ legacy: false, locale: 'en', messages: { en: enMessages } })
    const wrapper = mount(KanbanAutomations, {
      props: { board: makeBoard(true) },
      global: { plugins: [i18n], stubs: { NvModal: { template: '<div><slot /></div>' } } },
    })

    const toggle = wrapper.get('[role="switch"]')
    expect(toggle.attributes('aria-checked')).toBe('true')
    await toggle.trigger('click')
    expect(wrapper.emitted('toggle-automation')).toEqual([['a1', false]])

    await wrapper.setProps({ board: makeBoard(false) })
    expect(wrapper.get('[role="switch"]').attributes('aria-checked')).toBe('false')
    wrapper.unmount()
  })
})
