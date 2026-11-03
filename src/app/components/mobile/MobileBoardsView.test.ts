import { afterEach, describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import en from '../../../locales/en.json'
import MobileBoardsView from './MobileBoardsView.vue'

const i18n = createI18n({ legacy: false, locale: 'en', messages: { en } })

const boards = [
  { id: 'board-1', title: 'Roadmap', icon: '🗂️', updatedAt: '2026-08-02T10:00:00.000Z' },
]

describe('MobileBoardsView', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('opens a board and requests its deletion from the row menu', async () => {
    const wrapper = mount(MobileBoardsView, {
      attachTo: document.body,
      props: { workspaceName: 'Atelier', boards, enabled: true },
      global: { plugins: [i18n] },
    })

    await wrapper.get('.mobile-board-card__open').trigger('click')
    expect(wrapper.emitted('open')).toEqual([['board-1']])

    await wrapper.get('.mobile-board-card__more').trigger('click')
    await nextTick()
    Array.from(document.body.querySelectorAll<HTMLButtonElement>('.nv-menu-item'))
      .find(item => item.textContent?.trim() === 'Delete')
      ?.click()

    expect(wrapper.emitted('board-action')).toEqual([[
      { action: 'delete', boardId: 'board-1', boardTitle: 'Roadmap', boardIcon: '🗂️' },
    ]])
    wrapper.unmount()
  })
})
