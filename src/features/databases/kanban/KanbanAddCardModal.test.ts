import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import KanbanAddCardModal from './KanbanAddCardModal.vue'
import type { KanbanBoard } from '../../../types/kanban'
import enMessages from '../../../locales/en.json'

const board: KanbanBoard = {
  id: 'b', title: 'B', icon: 'K', folderId: null, statusPropertyId: 'st',
  propertyDefinitions: [{ id: 'st', name: 'Status', type: 'select', order: 0, options: [{ id: 'todo', name: 'To Do' }] }],
  templates: [{ id: 't1', name: 'Bug report', icon: 'B' }],
  createdAt: 't', updatedAt: 't',
}

function mountModal(props: Record<string, unknown> = {}) {
  const i18n = createI18n({ legacy: false, locale: 'en', messages: { en: enMessages } })
  return mount(KanbanAddCardModal, {
    props: { board, ...props },
    global: { plugins: [i18n], stubs: { NvModal: { template: '<div><slot /><slot name="footer" /></div>' } } },
  })
}

describe('KanbanAddCardModal templates', () => {
  it('uses the template name as the title when none is typed', async () => {
    const wrapper = mountModal({ defaultTemplateId: 't1' })
    expect(wrapper.get('.kadd-title-input').attributes('placeholder')).toBe('Bug report')
    await wrapper.get('.kadd-btn--primary').trigger('click')
    expect(wrapper.emitted('confirm')).toEqual([['Bug report', 'todo', 't1']])
  })

  it('emits no template id and requires a title without a template', async () => {
    const wrapper = mountModal()
    expect(wrapper.get('.kadd-btn--primary').attributes('disabled')).toBeDefined()
    await wrapper.get('.kadd-title-input').setValue('Plain')
    await wrapper.get('.kadd-btn--primary').trigger('click')
    expect(wrapper.emitted('confirm')).toEqual([['Plain', 'todo', undefined]])
  })
})
