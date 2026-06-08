import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, nextTick, reactive, ref } from 'vue'
import { mount, type VueWrapper } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { createPinia } from 'pinia'
import WorkspaceEditorPane from './WorkspaceEditorPane.vue'
import en from '../../locales/en.json'
import type { NoteDocument, NoteMeta } from '../../types/note'
import type { WorkspaceSettings } from '../../types/workspace'
import { createDefaultWorkspaceSettings } from '../../utils/workspace-settings'

vi.mock('@tauri-apps/api/core', () => ({
  convertFileSrc: (src: string) => src,
}))

vi.mock('../../tauri/commands', () => ({
  workspaceCommands: {
    cleanupOrphanedAssets: vi.fn(async () => undefined),
  },
  collabCommands: {
    loadYjsState: vi.fn(async () => []),
    saveYjsState: vi.fn(async () => undefined),
  },
  noteCommands: {
    importImageAsset: vi.fn(async () => ({ src: '.nevo/assets/image.png' })),
    loadNote: vi.fn(),
    getMediaServerInfo: vi.fn(async () => ({ port: 1429, token: 'test-token' })),
  },
  templateCommands: {
    listTemplates: vi.fn(async () => []),
    createTemplate: vi.fn(),
    updateTemplate: vi.fn(),
    deleteTemplate: vi.fn(),
  },
}))

vi.mock('../../composables/useDeviceLayout', () => {
  const mockRef = <T,>(value: T) => ({ value, __v_isRef: true })
  return {
    useDeviceLayout: () => ({
      isTouch: mockRef(false),
      supportsHover: mockRef(true),
    }),
  }
})

const graphStoreMocks = vi.hoisted(() => ({
  updateNoteEdges: vi.fn(),
  loadNoteGraph: vi.fn(),
  clear: vi.fn(),
}))

const treeStoreMocks = vi.hoisted(() => ({
  noteById: new Map<string, NoteMeta>(),
  folderById: new Map(),
}))

const workspaceStoreMocks = vi.hoisted(() => ({
  manifest: null,
}))

const collabStoreMocks = vi.hoisted(() => ({
  leaveSession: vi.fn(async () => undefined),
  sessionNoteId: null as string | null,
}))

vi.mock('../../stores/graph', () => ({
  useGraphStore: () => graphStoreMocks,
}))

vi.mock('../../stores/tree', () => ({
  useTreeStore: () => treeStoreMocks,
}))

vi.mock('../../stores/workspace', () => ({
  useWorkspaceStore: () => workspaceStoreMocks,
}))

vi.mock('../../stores/collab', () => ({
  useCollabStore: () => collabStoreMocks,
}))

const i18n = createI18n({
  legacy: false,
  locale: 'en',
  messages: { en },
})

const settings: WorkspaceSettings = {
  ...createDefaultWorkspaceSettings(),
  editor: {
    ...createDefaultWorkspaceSettings().editor,
    editorStatsVisibility: 'off',
  },
}

function createNote(): NoteDocument {
  return {
    id: 'note-1',
    title: 'Enter regression',
    icon: 'lucide:file-text',
    folderId: null,
    createdAt: '2026-06-02T00:00:00.000Z',
    updatedAt: '2026-06-02T00:00:00.000Z',
    content: {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Alpha' }],
        },
      ],
    },
  }
}

async function flushVue() {
  await Promise.resolve()
  await Promise.resolve()
  await nextTick()
}

function mountHarness() {
  const Harness = defineComponent({
    components: { WorkspaceEditorPane },
    setup() {
      const note = ref(createNote())
      const saveStatus = ref<'saved' | 'saving' | 'unsaved' | 'error'>('saved')
      const state = reactive({ settings })

      function updateContent(content: NoteDocument['content']) {
        note.value = { ...note.value, content }
        saveStatus.value = 'unsaved'
      }

      function markContentDirty() {
        saveStatus.value = 'unsaved'
      }

      return { note, saveStatus, state, updateContent, markContentDirty }
    },
    template: `
      <WorkspaceEditorPane
        :note="note"
        workspace-path="/workspace"
        workspace-name="Workspace"
        :plugin-manifests="[]"
        :settings="state.settings"
        :save-status="saveStatus"
        :container-title="null"
        :container-kind="null"
        :container-items="[]"
        :pending-block-target="null"
        @update:content="updateContent"
        @content-dirty="markContentDirty"
      />
    `,
  })

  return mount(Harness, {
    attachTo: document.body,
    global: {
      plugins: [i18n, createPinia()],
      stubs: {
        DocAppearance: true,
        LocalGraphPanel: true,
        NoteBreadcrumb: {
          props: ['note'],
          template: '<div class="note-breadcrumb-stub"><slot name="actions" /></div>',
        },
      },
    },
  })
}

const wrappers: VueWrapper[] = []

describe('WorkspaceEditorPane Enter handling', () => {
  afterEach(() => {
    while (wrappers.length > 0) wrappers.pop()?.unmount()
    document.body.innerHTML = ''
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  it('splits a paragraph without surfacing an unhandled Vue update error', async () => {
    vi.useFakeTimers()
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const unhandled: unknown[] = []
    const onUnhandled = (event: PromiseRejectionEvent) => {
      unhandled.push(event.reason)
      event.preventDefault()
    }
    window.addEventListener('unhandledrejection', onUnhandled)

    const wrapper = mountHarness()
    wrappers.push(wrapper)
    await flushVue()

    const editor = wrapper.get('.ProseMirror').element as HTMLElement
    editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
    await flushVue()
    vi.advanceTimersByTime(250)
    await flushVue()

    window.removeEventListener('unhandledrejection', onUnhandled)
    expect(unhandled).toEqual([])
    expect(consoleError).not.toHaveBeenCalledWith(expect.stringContaining('emitsOptions'))
  })
})
