import { describe, expect, it } from 'vitest'
import { defineComponent, ref } from 'vue'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import en from '../../locales/en.json'
import { createDefaultWorkspaceSettings } from '../../utils/workspace-settings'
import type { WorkspaceManifest, WorkspaceSettings } from '../../types/workspace'
import { useWorkspaceHome } from './useWorkspaceHome'

const i18n = createI18n({
  legacy: false,
  locale: 'en',
  messages: { en },
})

function createManifest(): WorkspaceManifest {
  return {
    id: 'workspace-1',
    name: 'Workspace',
    glyph: 'N',
    gradient: 'violet',
    schemaVersion: 1,
    createdAt: '2026-07-01T00:00:00.000Z',
    rootOrder: ['note-1', 'folder-1'],
    rootNotes: [
      { id: 'note-1', title: 'Alpha', icon: '📄', folderId: null, updatedAt: '2026-07-18T10:00:00.000Z' },
    ],
    tree: [{
      id: 'folder-1',
      title: 'Projects',
      icon: '📁',
      parentId: null,
      order: 0,
      children: [],
      notes: [
        { id: 'note-2', title: 'Beta', icon: '📝', folderId: 'folder-1', updatedAt: '2026-07-19T10:00:00.000Z' },
        { id: 'note-invalid', title: 'No date', icon: '📄', folderId: 'folder-1', updatedAt: 'not-a-date' },
      ],
    }],
  }
}

function mountHome(settingsOverride?: Partial<WorkspaceSettings['general']>) {
  const manifest = ref<WorkspaceManifest | null>(createManifest())
  const settings = ref(createDefaultWorkspaceSettings())
  Object.assign(settings.value.general, settingsOverride)
  const boards = ref([
    { id: 'board-1', title: 'Roadmap', icon: '🗂️', updatedAt: '2026-07-19T10:00:00.000Z' },
  ])
  const pluginViews = ref([{
    id: 'dashboard',
    pluginId: 'plugin.alpha',
    title: 'Dashboard',
    route: '/workspace/plugin/plugin.alpha/dashboard',
    frame: {
      type: 'sandboxed-plugin-iframe' as const,
      pluginId: 'plugin.alpha',
      source: 'nevoplugin://alpha/dashboard.html',
      sandbox: 'allow-scripts' as const,
    },
  }])
  const pluginItems = ref([])
  const pluginUiReady = ref(true)
  const kanbanEnabled = ref(true)
  let home!: ReturnType<typeof useWorkspaceHome>
  const updateSettings = async (mutator: (draft: WorkspaceSettings) => void) => {
    const draft = JSON.parse(JSON.stringify(settings.value)) as WorkspaceSettings
    mutator(draft)
    settings.value = draft
  }
  const Harness = defineComponent({
    setup() {
      home = useWorkspaceHome({
        manifest,
        settings,
        boards,
        kanbanEnabled,
        pluginViews,
        pluginItems,
        pluginUiReady,
        updateSettings,
      })
      return () => null
    },
  })
  const wrapper = mount(Harness, { global: { plugins: [i18n] } })
  return { wrapper, home, manifest, settings, pluginViews, pluginUiReady, kanbanEnabled }
}

describe('useWorkspaceHome', () => {
  it('resolves every favorite type and combines recent notes and boards stably', () => {
    const { wrapper, home } = mountHome({
      homeFavorites: [
        { kind: 'note', id: 'note-1' },
        { kind: 'folder', id: 'folder-1' },
        { kind: 'board', id: 'board-1' },
        { kind: 'graph' },
        { kind: 'pluginView', pluginId: 'plugin.alpha', contributionId: 'dashboard' },
      ],
    })

    expect(home.favoriteItems.value.map(item => item.route)).toEqual([
      '/workspace/note/note-1',
      '/workspace/folder/folder-1',
      '/workspace/plugin/nevo.kanban/board-1',
      '/workspace/graph',
      '/workspace/plugin/plugin.alpha/dashboard',
    ])
    expect(home.recentItems.value.map(item => item.title)).toEqual(['Beta', 'Roadmap', 'Alpha'])
    wrapper.unmount()
  })

  it('keeps loading plugin positions on Home and exposes missing items only to the manager', () => {
    const { wrapper, home, pluginViews, pluginUiReady } = mountHome({
      homeFavorites: [
        { kind: 'pluginView', pluginId: 'plugin.missing', contributionId: 'view' },
      ],
    })

    pluginViews.value = []
    pluginUiReady.value = false
    expect(home.favoriteItems.value[0]).toMatchObject({ loading: true, available: false })

    pluginUiReady.value = true
    expect(home.favoriteItems.value).toEqual([])
    expect(home.managerItems.value[0]).toMatchObject({ loading: false, available: false })
    wrapper.unmount()
  })

  it('adds, removes and reorders without replacing the eighth favorite', async () => {
    const favorites = Array.from({ length: 8 }, (_, index) => ({
      kind: 'note' as const,
      id: `note-${index}`,
    }))
    const { wrapper, home, settings } = mountHome({ homeFavorites: favorites })

    await expect(home.addFavorite({ kind: 'graph' })).resolves.toBe('limit')
    expect(settings.value.general.homeFavorites).toEqual(favorites)

    await home.removeFavorite({ kind: 'note', id: 'note-0' })
    await expect(home.addFavorite({ kind: 'graph' })).resolves.toBe('added')
    await home.moveFavorite(7, 0)

    expect(settings.value.general.homeFavorites[0]).toEqual({ kind: 'graph' })
    wrapper.unmount()
  })

  it('reports a fully empty workspace independently from system and plugin views', () => {
    const { wrapper, home, manifest, kanbanEnabled } = mountHome()
    manifest.value = { ...createManifest(), rootOrder: [], rootNotes: [], tree: [] }

    expect(home.isWorkspaceEmpty.value).toBe(false)
    // The enabled board is workspace content; once hidden, the workspace is empty.
    kanbanEnabled.value = false
    expect(home.isWorkspaceEmpty.value).toBe(true)
    wrapper.unmount()
  })
})
