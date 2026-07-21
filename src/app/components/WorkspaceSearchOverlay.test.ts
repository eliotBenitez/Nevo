import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DOMWrapper, mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import WorkspaceSearchOverlay from './WorkspaceSearchOverlay.vue'
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

// Teleported content lives outside the mounted wrapper's element tree, so
// @vue/test-utils' wrapper.get()/find() can't see it; query document.body
// directly and wrap the result to keep using .trigger()/.attributes().
function getInput(): DOMWrapper<HTMLInputElement> {
  const input = document.body.querySelector('input')
  if (!input) throw new Error('search overlay input not found in document.body')
  return new DOMWrapper(input)
}

describe('WorkspaceSearchOverlay', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    // Search routes through the workspace backend; a local handle makes it
    // delegate to the mocked noteCommands.searchWorkspaceBlocks.
    useWorkspaceStore().activeHandle = { kind: 'local', path: '/workspace' }
    vi.clearAllMocks()
    vi.mocked(noteCommands.searchWorkspaceBlocks).mockResolvedValue([createBlockResult()])
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('renders grouped mixed results for notes, blocks, and settings', async () => {
    const wrapper = mount(WorkspaceSearchOverlay, {
      attachTo: document.body,
      global: {
        plugins: [i18n],
      },
      props: {
        open: true,
        manifest,
        workspacePath: '/workspace',
        settingsItems,
      },
    })

    await nextTick()

    await getInput().setValue('alpha')
    await flushSearch()

    expect(document.body.textContent ?? '').toContain('Notes & Folders')
    expect(document.body.textContent ?? '').toContain('Blocks')
    expect(document.body.textContent ?? '').toContain('Settings')
    expect(document.body.textContent ?? '').toContain('Alpha note')
    expect(document.body.textContent ?? '').toContain('alpha block match')
    expect(document.body.textContent ?? '').toContain('Alpha theme')

    wrapper.unmount()
  })

  it('seeds the query and autofocuses the input when opened', async () => {
    const wrapper = mount(WorkspaceSearchOverlay, {
      attachTo: document.body,
      global: {
        plugins: [i18n],
      },
      props: {
        open: true,
        seed: 'alpha',
        manifest,
        workspacePath: '/workspace',
        settingsItems,
      },
    })

    await flushSearch()

    const input = getInput()
    expect((input.element as HTMLInputElement).value).toBe('alpha')
    expect(document.activeElement).toBe(input.element)

    wrapper.unmount()
  })

  it('selects the active result with ArrowDown + Enter and emits select-result', async () => {
    const wrapper = mount(WorkspaceSearchOverlay, {
      attachTo: document.body,
      global: {
        plugins: [i18n],
      },
      props: {
        open: true,
        seed: 'alpha',
        manifest,
        workspacePath: '/workspace',
        settingsItems,
      },
    })

    await flushSearch()

    const input = getInput()
    await input.trigger('keydown', { key: 'ArrowDown' })
    await input.trigger('keydown', { key: 'Enter' })

    expect(wrapper.emitted('select-result')?.[0]?.[0]).toEqual(
      expect.objectContaining({
        type: 'note',
        id: 'note-1',
      }),
    )
    expect(wrapper.emitted('close')).toBeTruthy()

    wrapper.unmount()
  })

  it('emits close on Escape', async () => {
    const wrapper = mount(WorkspaceSearchOverlay, {
      attachTo: document.body,
      global: {
        plugins: [i18n],
      },
      props: {
        open: true,
        manifest,
        workspacePath: '/workspace',
        settingsItems,
      },
    })

    await flushSearch()

    const input = getInput()
    await input.trigger('keydown', { key: 'Escape' })

    expect(wrapper.emitted('close')).toHaveLength(1)

    wrapper.unmount()
  })

  it('exposes combobox and listbox semantics for keyboard navigation', async () => {
    const wrapper = mount(WorkspaceSearchOverlay, {
      attachTo: document.body,
      global: {
        plugins: [i18n],
      },
      props: {
        open: true,
        seed: 'alpha',
        manifest,
        workspacePath: '/workspace',
        settingsItems,
      },
    })

    await flushSearch()
    const input = getInput()
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
