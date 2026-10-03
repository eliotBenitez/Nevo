import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { createI18n } from 'vue-i18n'
import en from '../../locales/en.json'
import ru from '../../locales/ru.json'
import WorkspaceHome from './WorkspaceHome.vue'
import type { WorkspaceHomeItem } from '../composables/useWorkspaceHome'

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

function mountHome(overrides: Record<string, unknown> = {}, language: 'en' | 'ru' = 'en') {
  const i18n = createI18n({
    legacy: false,
    locale: language,
    messages: { en, ru },
  })
  return mount(WorkspaceHome, {
    global: { plugins: [i18n] },
    props: {
      workspaceName: 'My Workspace',
      searchShortcut: 'Ctrl+P',
      favoriteItems: [],
      recentItems: [],
      kanbanEnabled: true,
      isWorkspaceEmpty: false,
      backendKind: 'local',
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

  it('offers Markdown, Obsidian, and Notion import from one keyboard-operable quick action', async () => {
    const wrapper = mountHome()
    const trigger = wrapper.get('.workspace-home__import .workspace-home__action')

    expect(wrapper.get('.workspace-home__import').text()).toContain('Import')
    await trigger.trigger('click')
    await nextTick()
    await nextTick()

    let items = Array.from(document.querySelectorAll<HTMLButtonElement>('.nv-popup-menu__panel .nv-menu-item'))
    expect(items.map(item => item.textContent?.trim())).toEqual(['Import .md', 'Import Obsidian vault', 'Import Notion ZIP'])
    expect(document.activeElement).toBe(items[0])

    items[0].click()
    await nextTick()
    await trigger.trigger('click')
    await nextTick()
    await nextTick()
    items = Array.from(document.querySelectorAll<HTMLButtonElement>('.nv-popup-menu__panel .nv-menu-item'))
    items[1].click()
    await nextTick()
    await trigger.trigger('click')
    await nextTick()
    await nextTick()
    items = Array.from(document.querySelectorAll<HTMLButtonElement>('.nv-popup-menu__panel .nv-menu-item'))
    items[2].click()

    expect(wrapper.emitted('import-md')).toEqual([[]])
    expect(wrapper.emitted('import-obsidian')).toEqual([[]])
    expect(wrapper.emitted('import-notion')).toEqual([[]])
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
    await wrapper.get('.workspace-home__recent').trigger('click')
    await wrapper.get('.workspace-home__manage').trigger('click')

    expect(wrapper.emitted('open-item')).toEqual([[note], [board]])
    expect(wrapper.emitted('manage-favorites')).toEqual([[]])
  })

  it('shows diagnostics only when both values are available and pluralizes the note count', async () => {
    const wrapper = mountHome()
    expect(wrapper.find('.workspace-home__meta').exists()).toBe(false)

    await wrapper.setProps({ noteCount: 1 })
    expect(wrapper.find('.workspace-home__meta').exists()).toBe(false)

    await wrapper.setProps({ workspaceBytes: 1024 })
    expect(wrapper.get('.workspace-home__meta').text()).toBe('1 note · 1.0 KB')

    await wrapper.setProps({ noteCount: 2 })
    expect(wrapper.get('.workspace-home__meta').text()).toBe('2 notes · 1.0 KB')

    await wrapper.setProps({ noteCount: 0 })
    expect(wrapper.get('.workspace-home__meta').text()).toBe('0 notes · 1.0 KB')
  })

  it('uses the correct Russian note forms', async () => {
    const wrapper = mountHome({ noteCount: 1, workspaceBytes: 1024 }, 'ru')
    expect(wrapper.get('.workspace-home__meta').text()).toBe('1 заметка · 1.0 KB')

    await wrapper.setProps({ noteCount: 2 })
    expect(wrapper.get('.workspace-home__meta').text()).toBe('2 заметки · 1.0 KB')

    await wrapper.setProps({ noteCount: 5 })
    expect(wrapper.get('.workspace-home__meta').text()).toBe('5 заметок · 1.0 KB')

    await wrapper.setProps({ noteCount: 21 })
    expect(wrapper.get('.workspace-home__meta').text()).toBe('21 заметка · 1.0 KB')
  })

  it('uses the compact recent heading from the home reference', () => {
    const wrapper = mountHome({ recentItems: [item({})] }, 'ru')
    expect(wrapper.get('.workspace-home__section--recent h2').text()).toBe('Недавние')
  })

  it('shows the starter state and hides Kanban when the capability is unavailable', () => {
    const wrapper = mountHome({ isWorkspaceEmpty: true, kanbanEnabled: false })

    expect(wrapper.text()).toContain('Your workspace is ready')
    expect(wrapper.findAll('.workspace-home__action')).toHaveLength(3)
    expect(wrapper.find('.workspace-home__section--recent').exists()).toBe(false)
  })
})
