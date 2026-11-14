import { describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import KanbanAutomations from './KanbanAutomations.vue'
import type { KanbanAutomation, KanbanBoard, KanbanCard, KanbanTemplate } from '../../../types/kanban'
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
    expect(wrapper.text()).toContain('a card enters Review')
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

  it('hides stale run counts', () => {
    const board = makeBoard(true)
    board.automations = [{ ...board.automations![0], runCount: 4, runWeek: '2000-01-03' }]
    const wrapper = mountModal(board)
    expect(wrapper.find('.ka-rule__runs').exists()).toBe(false)
    wrapper.unmount()
  })

  it('saves a due date rule with days and date field, and a notify action', async () => {
    const board = columnBoard()
    const cards = [{ id: 'c', fields: [{ id: 'f', name: 'Due', type: 'date', value: '2026-11-20', order: 0 }] }] as unknown as KanbanCard[]
    const i18n = createI18n({ legacy: false, locale: 'en', messages: { en: enMessages } })
    const wrapper = mount(KanbanAutomations, {
      props: { board, cards },
      attachTo: document.body,
      global: { plugins: [i18n], stubs: { NvModal: { template: '<div><slot /></div>' } } },
    })
    await wrapper.get('.ka-section__action').trigger('click')
    const form = wrapper.get('.ka-form')
    const pick = async (index: number, label: string) => {
      await form.findAll('.nv-select__trigger')[index].trigger('click')
      await vi.waitFor(() => expect(document.querySelector('.nv-select__menu')).not.toBeNull())
      Array.from(document.querySelectorAll<HTMLButtonElement>('.nv-select__option')).find(o => o.textContent?.includes(label))!.click()
      await nextTick()
    }
    await pick(0, 'A due date is near')
    await wrapper.get('.ka-form__days').setValue(5)
    await pick(1, 'Due')
    await pick(2, 'Send a notification')
    await form.trigger('submit')

    const [automation] = wrapper.emitted('add-automation')![0] as [KanbanAutomation]
    expect(automation).toMatchObject({ trigger: 'due_date_near', triggerValue: '5', dateField: 'Due', action: 'notify', enabled: true })
    expect(automation.actionValue).toBeUndefined()
    wrapper.unmount()
  })

  it('shows the templates empty state, then emits use and delete for a saved template', async () => {
    const empty = mountModal(columnBoard())
    expect(empty.text()).toContain('No templates yet')
    empty.unmount()

    const board = { ...columnBoard(), templates: [{ id: 't1', name: 'Bug report', icon: 'B', card: { fields: [] } }] }
    const wrapper = mountModal(board)
    expect(wrapper.text()).toContain('Bug report')
    expect(wrapper.text()).toContain('No fields')
    await wrapper.get('.ka-template__use').trigger('click')
    expect(wrapper.emitted('use-template')).toEqual([['t1']])
    await wrapper.get('.ka-template__delete').trigger('click')
    expect(wrapper.emitted('delete-template')).toEqual([['t1']])
    wrapper.unmount()
  })

  it('saves a card as a template named after it', async () => {
    const i18n = createI18n({ legacy: false, locale: 'en', messages: { en: enMessages } })
    const cards = [{ id: 'c1', title: 'Fix login', icon: '🐞', content: { type: 'doc', content: [] }, properties: {}, fields: [] }] as unknown as KanbanCard[]
    const wrapper = mount(KanbanAutomations, {
      props: { board: columnBoard(), cards },
      attachTo: document.body,
      global: { plugins: [i18n], stubs: { NvModal: { template: '<div><slot /></div>' } } },
    })
    await wrapper.get('.ka-templates__save-as').trigger('click')
    expect((wrapper.get('.ka-templates__name').element as HTMLInputElement).value).toBe('Fix login')
    await wrapper.get('.ka-templates__form').trigger('submit')
    const [template] = wrapper.emitted('save-template')![0] as [KanbanTemplate]
    expect(template).toMatchObject({ name: 'Fix login', icon: '🐞' })
    wrapper.unmount()
  })

  it('lists dependencies from card links', () => {
    const link = (id: string, links: KanbanCard['links']) => ({ id, title: id.toUpperCase(), links, fields: [] }) as unknown as KanbanCard
    const i18n = createI18n({ legacy: false, locale: 'en', messages: { en: enMessages } })
    const wrapper = mount(KanbanAutomations, {
      props: { board: columnBoard(), cards: [link('a', [{ cardId: 'b', kind: 'blocks' }]), link('b', [])] },
      global: { plugins: [i18n], stubs: { NvModal: { template: '<div><slot /></div>' } } },
    })
    expect(wrapper.get('.ka-dep').text()).toBe('A blocks B')
    expect(wrapper.text()).not.toContain('No dependencies tracked yet')
    wrapper.unmount()
  })
})
