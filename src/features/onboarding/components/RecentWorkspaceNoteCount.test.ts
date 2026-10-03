import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createI18n } from 'vue-i18n'
import WelcomeView from './WelcomeView.vue'
import OpenWorkspaceView from './OpenWorkspaceView.vue'
import { useWorkspaceStore } from '../../../stores/workspace'
import { workspaceCommands } from '../../../tauri/commands'
import type { FolderMeta, NoteMeta } from '../../../types/note'
import type { WorkspaceManifest } from '../../../types/workspace'
import en from '../../../locales/en.json'
import ru from '../../../locales/ru.json'

vi.mock('../../../tauri/commands', () => ({ workspaceCommands: { loadManifest: vi.fn() } }))

let wrapper: VueWrapper | undefined
afterEach(() => {
  wrapper?.unmount()
  vi.resetAllMocks()
})

function manifest(count: number): WorkspaceManifest {
  const nested: FolderMeta = {
    id: 'nested', title: 'Nested', icon: '', parentId: 'folder', order: 0, children: [],
    notes: Array.from({ length: count }, (_, i): NoteMeta => ({ id: `note-${i}`, title: 'Note', icon: '', folderId: 'nested', updatedAt: '' })),
  }
  return {
    id: 'ws', name: 'Atelier', glyph: 'N', gradient: '', schemaVersion: 1, createdAt: '', rootOrder: [],
    rootNotes: [],
    tree: [{ id: 'folder', title: 'Folder', icon: '', parentId: null, order: 0, notes: [], children: [nested] }],
    trash: [{ id: 'trashed', type: 'note', title: 'Deleted', deletedAt: '', originalParentId: null }],
  }
}

for (const [name, component] of [['welcome', WelcomeView], ['open', OpenWorkspaceView]] as const) {
  describe(`${name} recent workspace note count`, () => {
    function render(locale = 'ru') {
      const pinia = createPinia()
      setActivePinia(pinia)
      useWorkspaceStore().recents = [{ id: 'ws', name: 'Atelier', glyph: 'N', gradient: '', path: '/workspace', lastOpened: '2026-09-26T00:00:00Z', pageCount: 0 }]
      wrapper = mount(component, { global: { plugins: [pinia, createI18n({ legacy: false, locale, messages: { en, ru } })] } })
      return wrapper
    }

    it.each([[0, '0 заметок'], [1, '1 заметка'], [2, '2 заметки'], [5, '5 заметок'], [21, '21 заметка']])('counts nested notes and formats %i', async (count, label) => {
      vi.mocked(workspaceCommands.loadManifest).mockResolvedValue(manifest(count))
      const view = render()
      await flushPromises()
      expect(view.text()).toContain(label)
      expect(view.text()).not.toContain('страниц')
    })

    it('hides the stale count while loading and after a read failure', async () => {
      let reject!: (reason: Error) => void
      vi.mocked(workspaceCommands.loadManifest).mockReturnValue(new Promise((_, fail) => { reject = fail }))
      const view = render()
      expect(view.text()).not.toMatch(/0 (страниц|заметок)/)
      reject(new Error('unavailable'))
      await flushPromises()
      expect(view.text()).not.toMatch(/0 (страниц|заметок)/)
      expect(view.text()).toContain('Atelier')
    })

    it.each([[1, '1 note'], [2, '2 notes']])('formats English %i', async (count, label) => {
      vi.mocked(workspaceCommands.loadManifest).mockResolvedValue(manifest(count))
      const view = render('en')
      await flushPromises()
      expect(view.text()).toContain(label)
    })
  })
}
