import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { createI18n } from 'vue-i18n'
import en from '../../locales/en.json'
import WorkspaceHome from './WorkspaceHome.vue'
import type { WorkspaceHomeItem } from '../composables/useWorkspaceHome'

const i18n = createI18n({
  legacy: false,
  locale: 'en',
  messages: { en },
})

function item(overrides: Partial<WorkspaceHomeItem>): WorkspaceHomeItem {
  return {
    key: 'note:note-1',
    favorite: { kind: 'note', id: 'note-1' },
    kind: 'note',
    title: 'Alpha',
    icon: '📄',
    route: '/workspace/note/note-1',
    updatedAt: '2026-07-19T10:00:00.000Z',
    available: true,
    loading: false,
    ...overrides,
  }
}

function mountHome(overrides: Record<string, unknown> = {}) {
  return mount(WorkspaceHome, {
    global: { plugins: [i18n] },
    props: {
      workspaceName: 'My Workspace',
      searchShortcut: 'Ctrl+P',
      favoriteItems: [],
      recentItems: [],
      kanbanEnabled: true,
      isWorkspaceEmpty: false,
      ...overrides,
    },
  })
}

describe('WorkspaceHome', () => {
  it('delegates search and all direct quick actions', async () => {
    const wrapper = mountHome()

    await wrapper.get('.workspace-home__search').trigger('click')
    await wrapper.findAll('.workspace-home__action')[0].trigger('click')
    await wrapper.findAll('.workspace-home__action')[1].trigger('click')
    await wrapper.findAll('.workspace-home__action')[3].trigger('click')

    expect(wrapper.emitted('search')).toEqual([[]])
    expect(wrapper.emitted('create-note')).toEqual([[]])
    expect(wrapper.emitted('create-folder')).toEqual([[]])
    expect(wrapper.emitted('create-board')).toEqual([[]])
  })

  it('offers file and Obsidian-vault import from one keyboard-operable quick action', async () => {
    const wrapper = mountHome()
    const trigger = wrapper.get('.workspace-home__import .workspace-home__action')

    expect(wrapper.get('.workspace-home__import').text()).toContain('Import')
    await trigger.trigger('click')
    await nextTick()
    await nextTick()

    let items = Array.from(document.querySelectorAll<HTMLButtonElement>('.nv-popup-menu__panel .nv-menu-item'))
    expect(items.map(item => item.textContent?.trim())).toEqual(['Import .md', 'Import Obsidian vault'])
    expect(document.activeElement).toBe(items[0])

    items[0].click()
    await nextTick()
    await trigger.trigger('click')
    await nextTick()
    await nextTick()
    items = Array.from(document.querySelectorAll<HTMLButtonElement>('.nv-popup-menu__panel .nv-menu-item'))
    items[1].click()

    expect(wrapper.emitted('import-md')).toEqual([[]])
    expect(wrapper.emitted('import-obsidian')).toEqual([[]])
  })

  it('renders favorites, a unified recent feed, and emits the selected item', async () => {
    const note = item({})
    const board = item({
      key: 'board:board-1',
      favorite: { kind: 'board', id: 'board-1' },
      kind: 'board',
      title: 'Roadmap',
      icon: '🗂️',
      route: '/workspace/plugin/nevo.kanban/board-1',
    })
    const wrapper = mountHome({ favoriteItems: [note], recentItems: [board, note] })

    expect(wrapper.findAll('.workspace-home__favorite')).toHaveLength(1)
    expect(wrapper.findAll('.workspace-home__recent')).toHaveLength(2)
    await wrapper.get('button.workspace-home__favorite').trigger('click')

    expect(wrapper.emitted('open-item')).toEqual([[note]])
  })

  it('shows the starter state and hides Kanban when the capability is unavailable', () => {
    const wrapper = mountHome({ isWorkspaceEmpty: true, kanbanEnabled: false })

    expect(wrapper.text()).toContain('Your workspace is ready')
    expect(wrapper.findAll('.workspace-home__action')).toHaveLength(3)
    expect(wrapper.find('.workspace-home__section--recent').exists()).toBe(false)
  })
})
