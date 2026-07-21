import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import KanbanBoardModal from './KanbanBoardModal.vue'
import { useKanbanStore } from '../../../stores/kanban'
import enMessages from '../../../locales/en.json'

vi.mock('../../../stores/kanban', () => ({
  useKanbanStore: vi.fn(),
}))

const createBoard = vi.fn()

function mountModal() {
  return mount(KanbanBoardModal, {
    attachTo: document.body,
    props: { mode: 'create' },
    global: {
      plugins: [createI18n({
        legacy: false,
        locale: 'en',
        messages: { en: enMessages },
      })],
      stubs: { teleport: true },
    },
  })
}

describe('KanbanBoardModal', () => {
  beforeEach(() => {
    createBoard.mockReset()
    createBoard.mockResolvedValue({ id: 'board-1' })
    vi.mocked(useKanbanStore).mockReturnValue({ createBoard } as unknown as ReturnType<typeof useKanbanStore>)
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('creates a named board through an accessible form and selected icon', async () => {
    const wrapper = mountModal()
    await wrapper.vm.$nextTick()

    const dialog = wrapper.get('.kb-bm')
    const input = wrapper.get<HTMLInputElement>('#kb-bm-title-input')

    expect(dialog.attributes('role')).toBe('dialog')
    expect(dialog.attributes('aria-modal')).toBe('true')
    expect(wrapper.get('#kb-bm-description').text()).toBe('Set a name and icon to get your workflow started.')
    expect(document.activeElement).toBe(input.element)
    const iconButtons = wrapper.findAll<HTMLButtonElement>('.kb-bm__icon-btn')
    const folderIcon = iconButtons.find(button => button.attributes('aria-label') === 'Icon: 🗂️')
    const rocketIcon = iconButtons.find(button => button.attributes('aria-label') === 'Icon: 🚀')

    expect(folderIcon?.attributes('aria-pressed')).toBe('true')
    expect(rocketIcon).toBeTruthy()

    await input.setValue('Roadmap')
    await rocketIcon!.trigger('click')
    await wrapper.get('form').trigger('submit')

    expect(createBoard).toHaveBeenCalledWith('Roadmap', '🚀')
    expect(wrapper.emitted('created')).toEqual([['board-1']])

    wrapper.unmount()
  })

  it('closes from Escape without submitting', async () => {
    const wrapper = mountModal()

    await wrapper.get('#kb-bm-title-input').trigger('keydown', { key: 'Escape' })

    expect(wrapper.emitted('close')).toEqual([[]])
    expect(createBoard).not.toHaveBeenCalled()

    wrapper.unmount()
  })
})
