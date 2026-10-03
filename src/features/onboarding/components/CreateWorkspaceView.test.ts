import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createI18n } from 'vue-i18n'
import CreateWorkspaceView from './CreateWorkspaceView.vue'
import { useOnboardingStore } from '../../../stores/onboarding'
import en from '../../../locales/en.json'
import type { WorkspaceManifest } from '../../../types/workspace'
import { workspaceCommands, noteCommands, folderCommands } from '../../../tauri/commands'

vi.mock('../../../tauri/commands', () => ({
  workspaceCommands: {
    createWorkspace: vi.fn(),
    openWorkspace: vi.fn(),
    loadManifest: vi.fn(),
    saveManifest: vi.fn(),
    loadSettings: vi.fn().mockResolvedValue({}),
    saveSettings: vi.fn(),
    loadCustomCss: vi.fn().mockResolvedValue(''),
    saveCustomCss: vi.fn(),
    listPlugins: vi.fn().mockResolvedValue([]),
    setPluginEnabled: vi.fn(),
    marketplaceListPlugins: vi.fn(),
    marketplaceInstallPlugin: vi.fn(),
    marketplaceUpdatePlugin: vi.fn(),
    marketplaceRemovePlugin: vi.fn(),
    marketplaceRefreshCache: vi.fn(),
    getWorkspaceDiagnostics: vi.fn().mockResolvedValue({}),
    pruneWorkspaceSnapshots: vi.fn(),
    cleanupOrphanedAssets: vi.fn(),
  },
  noteCommands: {
    createNote: vi.fn(),
    saveNote: vi.fn().mockResolvedValue(undefined),
    loadNote: vi.fn(),
    deleteNote: vi.fn(),
    moveNote: vi.fn(),
    listSidebarNotePreviews: vi.fn().mockResolvedValue([]),
  },
  folderCommands: {
    createFolder: vi.fn(),
    renameFolder: vi.fn(),
    deleteFolder: vi.fn(),
  },
  templateCommands: {},
  kanbanCommands: {},
  graphCommands: {},
  noteQueryCommands: {},
  githubSyncCommands: {},
  systemCommands: {
    pickWorkspaceDirectory: vi.fn(),
  },
  collabCommands: {
    hasLegacyCollabDir: vi.fn().mockResolvedValue(false),
  },
  configCommands: {
    loadAppConfig: vi.fn(),
    saveAppConfig: vi.fn().mockResolvedValue(undefined),
    getAppMetadata: vi.fn(),
  },
}))

vi.mock('../../../utils/logger', () => ({
  appLogger: {
    error: vi.fn().mockResolvedValue(undefined),
    warn: vi.fn().mockResolvedValue(undefined),
    info: vi.fn().mockResolvedValue(undefined),
    debug: vi.fn().mockResolvedValue(undefined),
  },
}))

function manifest(): WorkspaceManifest {
  return {
    id: 'workspace-id',
    name: 'Atelier',
    glyph: 'N',
    gradient: 'linear-gradient(red, blue)',
    schemaVersion: 1,
    createdAt: '2026-05-15T10:00:00.000Z',
    rootOrder: [],
    tree: [],
    rootNotes: [],
  }
}

let wrapper: VueWrapper | null = null

function mountView() {
  const pinia = createPinia()
  setActivePinia(pinia)
  wrapper = mount(CreateWorkspaceView, {
    global: {
      plugins: [
        pinia,
        createI18n({ legacy: false, locale: 'en', messages: { en } }),
      ],
    },
  })
  return wrapper
}

// Drives the wizard from the name step (already prefilled) to the template
// step, without needing to touch the name/location inputs.
async function advanceToTemplateStep(view: VueWrapper) {
  await view.get('.footer-btn-next').trigger('click')
  await view.get('.footer-btn-next').trigger('click')
}

async function selectTemplate(view: VueWrapper, index: number) {
  const radios = view.findAll('[role="radio"]')
  await radios[index].trigger('click')
}

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
})

describe('CreateWorkspaceView starter note', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(workspaceCommands.createWorkspace).mockResolvedValue(manifest())
    let noteSequence = 0
    vi.mocked(noteCommands.createNote).mockImplementation(async (_path, _folderId, title, icon) => {
      noteSequence += 1
      return {
        id: `note-${noteSequence}`,
        title,
        icon,
        folderId: null,
        createdAt: '2026-05-15T10:00:00.000Z',
        updatedAt: '2026-05-15T10:00:00.000Z',
        content: { type: 'doc', content: [] },
      }
    })
    vi.mocked(folderCommands.createFolder).mockImplementation(async (_path, parentId, title, icon) => ({
      id: 'folder-1',
      title,
      icon,
      parentId,
      order: 0,
      children: [],
      notes: [],
    }))
  })

  it('creates the starter note before any template starters, for a non-empty template', async () => {
    const view = mountView()
    await advanceToTemplateStep(view)
    await selectTemplate(view, 1) // 'researcher'

    await view.get('.footer-btn-create').trigger('click')
    await flushPromises()
    await flushPromises()

    const createNoteCalls = vi.mocked(noteCommands.createNote).mock.invocationCallOrder
    const createFolderCalls = vi.mocked(folderCommands.createFolder).mock.invocationCallOrder
    const saveNoteCalls = vi.mocked(noteCommands.saveNote).mock.invocationCallOrder

    // First createNote call is the starter note; saveNote (writing its
    // content) also happens before any template folder/note is created.
    expect(vi.mocked(noteCommands.createNote).mock.calls[0][2]).toBe(en.onboarding.starterNote.title)
    expect(saveNoteCalls[0]).toBeLessThan(createFolderCalls[0])
    expect(createNoteCalls[0]).toBeLessThan(createFolderCalls[0])

    expect(view.emitted('done')).toBeTruthy()
  })

  it('creates the starter note for the empty template too', async () => {
    const view = mountView()
    await advanceToTemplateStep(view)
    // Default selected template is already 'empty'.

    await view.get('.footer-btn-create').trigger('click')
    await flushPromises()
    await flushPromises()

    expect(noteCommands.createNote).toHaveBeenCalledTimes(1)
    expect(vi.mocked(noteCommands.createNote).mock.calls[0][2]).toBe(en.onboarding.starterNote.title)
    expect(noteCommands.saveNote).toHaveBeenCalledTimes(1)
    expect(view.emitted('done')).toBeTruthy()
  })

  it('records the starter note id on the onboarding store', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    wrapper = mount(CreateWorkspaceView, {
      global: {
        plugins: [pinia, createI18n({ legacy: false, locale: 'en', messages: { en } })],
      },
    })
    const onboardingStore = useOnboardingStore()

    await advanceToTemplateStep(wrapper)
    await wrapper.get('.footer-btn-create').trigger('click')
    await flushPromises()
    await flushPromises()

    expect(onboardingStore.starterNoteId).toBe('note-1')
  })

  it('does not block workspace creation when saving the starter note fails', async () => {
    vi.mocked(noteCommands.saveNote).mockRejectedValueOnce(new Error('disk full'))
    const view = mountView()
    await advanceToTemplateStep(view)
    await selectTemplate(view, 1) // 'researcher' — has template starters

    await view.get('.footer-btn-create').trigger('click')
    await flushPromises()
    await flushPromises()

    const { appLogger } = await import('../../../utils/logger')
    expect(vi.mocked(appLogger.warn)).toHaveBeenCalledWith(expect.objectContaining({
      source: 'frontend.onboarding',
      event: 'create_starter_note',
    }))
    // Template starters still get created despite the starter note failure.
    expect(folderCommands.createFolder).toHaveBeenCalled()
    expect(view.emitted('done')).toBeTruthy()
  })
})
