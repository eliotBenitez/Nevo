import { describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import KanbanAutomations from './KanbanAutomations.vue'
import type { KanbanAutomation, KanbanBoard } from '../../../types/kanban'
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

  const columnBoard = (): KanbanBoard => ({
    ...makeBoard(true),
    propertyDefinitions: [{ id: 'status', name: 'Status', type: 'select', order: 0, options: [
      { id: 'col-1', name: 'To Do' }, { id: 'col-2', name: 'Review' },
    ] }],
    automations: [{ id: 'a1', trigger: 'status_change', triggerValue: 'col-2', action: 'move_to', actionValue: 'col-1', enabled: true }],
  })

  function mountModal(board: KanbanBoard) {
    const i18n = createI18n({ legacy: false, locale: 'en', messages: { en: enMessages } })
    return mount(KanbanAutomations, {
      props: { board },
      attachTo: document.body,
      global: { plugins: [i18n], stubs: { NvModal: { template: '<div><slot /></div>' } } },
    })
  }

  it('shows column names instead of ids and emits delete', async () => {
    const wrapper = mountModal(columnBoard())
    expect(wrapper.text()).toContain('status → Review')
    expect(wrapper.text()).toContain('move to To do')
    expect(wrapper.text()).not.toContain('col-2')
    await wrapper.get('.ka-rule__delete').trigger('click')
    expect(wrapper.emitted('delete-automation')).toEqual([['a1']])
    wrapper.unmount()
  })

  it('adds a rule from the form', async () => {
    const wrapper = mountModal(columnBoard())
    await wrapper.get('.ka-section__action').trigger('click')
    const form = wrapper.get('.ka-form')
    expect(wrapper.findAll('.ka-form__tag')).toHaveLength(0)

    await form.findAll('.nv-select__trigger')[2].trigger('click')
    await vi.waitFor(() => expect(document.querySelector('.nv-select__menu')).not.toBeNull())
    const tagOption = Array.from(document.querySelectorAll<HTMLButtonElement>('.nv-select__option')).find(o => o.textContent?.includes('Add a tag'))!
    tagOption.click()
    await nextTick()

    expect(wrapper.get('.ka-form button[type="submit"]').attributes('disabled')).toBeDefined()
    await wrapper.get('.ka-form__tag').setValue('  urgent ')
    await form.trigger('submit')

    const [automation] = wrapper.emitted('add-automation')![0] as [KanbanAutomation]
    expect(automation).toMatchObject({ trigger: 'status_change', triggerValue: 'col-1', action: 'add_tag', actionValue: 'urgent', enabled: true })
    expect(automation.id).toBeTruthy()
    expect(wrapper.find('.ka-form').exists()).toBe(false)
    wrapper.unmount()
  })

  it('hides stale run counts and flags unsupported rules', () => {
    const board = makeBoard(true)
    board.automations = [{ ...board.automations![0], runCount: 4, runWeek: '2000-01-03' }]
    const wrapper = mountModal(board)
    expect(wrapper.find('.ka-rule__runs').exists()).toBe(false)
    expect(wrapper.text()).toContain('not supported yet')
    wrapper.unmount()
  })
})
