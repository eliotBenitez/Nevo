import { flushPromises, mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { defineComponent } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import type { NoteDocument } from '../../types/note'
import WorkspaceNoteHost from './WorkspaceNoteHost.vue'

const mockedSourceExport = vi.hoisted(() => ({ exportNotebookSource: vi.fn().mockResolvedValue({ status: 'exported' as const }) }))

vi.mock('../../tauri/notebook', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../tauri/notebook')>(),
  exportNotebookSource: mockedSourceExport.exportNotebookSource,
}))

const i18n = createI18n({
  legacy: false,
  locale: 'en',
  messages: { en: { app: { notebook: { readOnlyTitle: 'Read only', readOnlyDescription: 'Unsupported data', exportJson: 'Export JSON', exportingJson: 'Exporting', exportJsonError: 'Export failed', loadErrorTitle: 'Could not open note', loadErrorDescription: 'The original data is unchanged.' } } } },
})

function note(overrides: Partial<NoteDocument> = {}): NoteDocument {
  return {
    id: 'host-note', title: 'Note', icon: '📄', folderId: null,
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Document' }] }] },
    ...overrides,
  }
}

function mountHost(value: NoteDocument) {
  return mount(WorkspaceNoteHost, {
    props: {
      note: value,
      workspacePath: '/workspace',
      workspaceName: 'Workspace',
      pluginManifests: [],
      settings: {} as never,
      saveStatus: 'saved',
      containerTitle: null,
      containerKind: null,
      containerItems: [],
    },
    global: { plugins: [i18n] },
  })
}

describe('WorkspaceNoteHost format boundary', () => {
  it('never mounts the writable editor for a future notebook version', async () => {
    const wrapper = mountHost(note({
      documentKind: 'notebook',
      content: { type: 'doc', content: [] },
      notebook: { version: 2, pages: [] } as never,
    }))
    await flushPromises()

    expect(wrapper.find('[data-editor-mounted]').exists()).toBe(false)
    expect(wrapper.find('[data-notebook-mounted]').exists()).toBe(false)
    expect(wrapper.text()).toContain('Read only')
    expect(wrapper.text()).toContain('Export JSON')
    wrapper.unmount()
  })

  it('preserves the folder overview while no note is loaded', async () => {
    const wrapper = mount(WorkspaceNoteHost, {
      props: {
        note: null,
        workspacePath: '/workspace',
        pluginManifests: [],
        settings: {} as never,
        saveStatus: 'saved',
        containerTitle: 'Research',
        containerKind: 'folder',
        containerItems: [{ kind: 'note', meta: { id: 'child', title: 'Child note', icon: '📄' } } as never],
      },
      global: { plugins: [i18n], stubs: { WorkspaceEditorPane: defineComponent({
        name: 'WorkspaceEditorPane', props: {
          containerTitle: { type: String, default: null }, containerItems: { type: Array, default: () => [] },
        }, template: '<div />',
      }) } },
    })
    await flushPromises()
    const editor = wrapper.findComponent({ name: 'WorkspaceEditorPane' })
    expect(editor.props('containerTitle')).toBe('Research')
    expect(editor.props('containerItems')).toMatchObject([{ meta: { title: 'Child note' } }])
    wrapper.unmount()
  })

  it('surfaces a malformed load and exports original source through the native picker', async () => {
    const wrapper = mount(WorkspaceNoteHost, {
      props: {
        note: null,
        noteId: 'broken-note',
        loadError: true,
        workspacePath: '/workspace',
        pluginManifests: [],
        settings: {} as never,
        saveStatus: 'saved',
        containerTitle: null,
        containerKind: null,
        containerItems: [],
      },
      global: { plugins: [i18n] },
    })
    await flushPromises()
    expect(wrapper.text()).toContain('Could not open note')
    await wrapper.get('button').trigger('click')
    expect(mockedSourceExport.exportNotebookSource).toHaveBeenCalledWith({ workspacePath: '/workspace', noteId: 'broken-note' })
    wrapper.unmount()
  })
})
