import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import TitleBarSearch from './TitleBarSearch.vue'
import { useWorkspaceStore } from '../../stores/workspace'
import en from '../../locales/en.json'
import type { WorkspaceManifest } from '../../types/workspace'
import type { WorkspaceSettingSearchItem, WorkspaceBlockSearchItem } from '../../types/search'
import { noteCommands } from '../../tauri/commands'

vi.mock('../../tauri/commands', () => ({
  noteCommands: {
    createNote: vi.fn(),
    loadNote: vi.fn(),
    saveNote: vi.fn(),
    deleteNote: vi.fn(),
    moveNote: vi.fn(),
    listNoteSnapshots: vi.fn(),
    loadNoteSnapshot: vi.fn(),
    restoreNoteSnapshot: vi.fn(),
    pruneNoteSnapshots: vi.fn(),
    importImageAsset: vi.fn(),
    searchWorkspaceBlocks: vi.fn(),
  },
}))

const i18n = createI18n({
  legacy: false,
  locale: 'en',
  messages: { en },
})

const manifest: WorkspaceManifest = {
  id: 'workspace-1',
  name: 'Workspace',
  glyph: 'N',
  gradient: 'violet',
  schemaVersion: 1,
  createdAt: '2026-05-16T10:00:00.000Z',
  rootOrder: ['note-1', 'folder-1'],
  rootNotes: [
    {
      id: 'note-1',
      title: 'Alpha note',
      icon: '📄',
      folderId: null,
      updatedAt: '2026-05-16T10:00:00.000Z',
    },
  ],
  tree: [
    {
      id: 'folder-1',
      title: 'Alpha folder',
      icon: '📁',
      parentId: null,
      order: 0,
      notes: [],
      children: [],
    },
  ],
}

const settingsItems: WorkspaceSettingSearchItem[] = [
  {
    type: 'setting',
    id: 'appearance.mode',
    title: 'Alpha theme',
    description: 'Choose the alpha theme',
    value: 'Light',
    section: 'appearance',
    sectionLabel: 'Appearance',
  },
]

function createBlockResult(): WorkspaceBlockSearchItem {
  return {
    type: 'block',
    id: 'note-2:0',
    noteId: 'note-2',
    noteTitle: 'Block note',
    folderId: null,
    blockIndex: 0,
    snippet: 'alpha block match',
    blockText: 'alpha block match',
  }
}

async function flushSearch() {
  await Promise.resolve()
  await Promise.resolve()
  await nextTick()
}

describe('TitleBarSearch', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    // Search now routes through the workspace backend; a local handle makes it
    // delegate to the mocked noteCommands.searchWorkspaceBlocks.
    useWorkspaceStore().activeHandle = { kind: 'local', path: '/workspace' }
    vi.clearAllMocks()
    vi.mocked(noteCommands.searchWorkspaceBlocks).mockResolvedValue([createBlockResult()])
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('renders grouped mixed results for notes, blocks, and settings', async () => {
    const wrapper = mount(TitleBarSearch, {
      attachTo: document.body,
      global: {
        plugins: [i18n],
      },
      props: {
        manifest,
        workspacePath: '/workspace',
        settingsItems,
        searchShortcut: 'Ctrl+P',
      },
    })

    expect(wrapper.text()).toContain('Ctrl')
    expect(wrapper.text()).toContain('P')
    expect(wrapper.text()).not.toContain('↵')
    expect(wrapper.text()).not.toContain('esc')

    const input = wrapper.get('input')
    await input.setValue('alpha')
    await flushSearch()

    expect(document.body.textContent ?? '').toContain('Notes & Folders')
    expect(document.body.textContent ?? '').toContain('Blocks')
    expect(document.body.textContent ?? '').toContain('Settings')
    expect(document.body.textContent ?? '').toContain('Alpha note')
    expect(document.body.textContent ?? '').toContain('alpha block match')
    expect(document.body.textContent ?? '').toContain('Alpha theme')

    wrapper.unmount()
  })

  it('supports imperative focus and keyboard selection', async () => {
    const wrapper = mount(TitleBarSearch, {
      attachTo: document.body,
      global: {
        plugins: [i18n],
      },
      props: {
        manifest,
        workspacePath: '/workspace',
        settingsItems,
        searchShortcut: 'Ctrl+P',
      },
    })

    ;(wrapper.vm as unknown as { focusSearch: (seed?: string) => void }).focusSearch('alpha')
    await flushSearch()

    const input = wrapper.get('input')
    expect((input.element as HTMLInputElement).value).toBe('alpha')
    expect(document.activeElement).toBe(input.element)

    await input.trigger('keydown', { key: 'ArrowDown' })
    await input.trigger('keydown', { key: 'Enter' })

    expect(wrapper.emitted('select-result')?.[0]?.[0]).toEqual(
      expect.objectContaining({
        type: 'note',
        id: 'note-1',
      }),
    )

    wrapper.unmount()
  })

  it('exposes combobox and listbox semantics for keyboard navigation', async () => {
    const wrapper = mount(TitleBarSearch, {
      attachTo: document.body,
      global: {
        plugins: [i18n],
      },
      props: {
        manifest,
        workspacePath: '/workspace',
        settingsItems,
        searchShortcut: 'Ctrl+P',
      },
    })

    const input = wrapper.get('input')
    await input.setValue('alpha')
    await flushSearch()
    await input.trigger('keydown', { key: 'ArrowDown' })

    expect(input.attributes('role')).toBe('combobox')
    expect(input.attributes('aria-expanded')).toBe('true')
    expect(input.attributes('aria-controls')).toBeTruthy()
    expect(input.attributes('aria-activedescendant')).toBeTruthy()

    const listbox = document.body.querySelector('[role="listbox"]')
    const activeOption = document.getElementById(input.attributes('aria-activedescendant')!)
    expect(listbox).toBeTruthy()
    expect(activeOption?.getAttribute('role')).toBe('option')
    expect(activeOption?.getAttribute('aria-selected')).toBe('true')

    wrapper.unmount()
  })
})
