import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { defineComponent } from 'vue'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import en from '../locales/en.json'
import type { WorkspaceManifest } from '../types/workspace'
import { useWorkspaceStore } from '../stores/workspace'
import { useToast } from '../ui/composables/useToast'

const workspaceTransferMocks = vi.hoisted(() => ({
  exportWorkspaceArchive: vi.fn(),
  importWorkspaceArchiveAsNew: vi.fn(),
  mergeWorkspaceArchive: vi.fn(),
}))
vi.mock('../tauri/workspaceTransfer', () => ({
  workspaceTransferCommands: {
    exportWorkspaceArchive: workspaceTransferMocks.exportWorkspaceArchive,
    importWorkspaceArchiveAsNew: workspaceTransferMocks.importWorkspaceArchiveAsNew,
    extractWorkspaceArchiveToTemp: vi.fn(),
    releaseWorkspaceArchiveTemp: vi.fn(),
    mergeWorkspaceArchive: workspaceTransferMocks.mergeWorkspaceArchive,
  },
}))

const promptPasswordMock = vi.hoisted(() => vi.fn())
vi.mock('../ui/composables/usePasswordPrompt', () => ({
  promptPassword: promptPasswordMock,
}))

import { useWorkspaceTransfer } from './useWorkspaceTransfer'

const i18n = createI18n({ legacy: false, locale: 'en', messages: { en } })

function manifestFixture(name: string): WorkspaceManifest {
  return {
    id: 'ws-1',
    name,
    glyph: 'N',
    gradient: '',
    schemaVersion: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    rootOrder: [],
    rootNotes: [],
    tree: [],
  }
}

function mountTransfer() {
  let transfer!: ReturnType<typeof useWorkspaceTransfer>
  const Harness = defineComponent({
    setup() {
      transfer = useWorkspaceTransfer()
      return () => null
    },
  })
  const wrapper = mount(Harness, { global: { plugins: [i18n] } })
  return { wrapper, transfer }
}

describe('useWorkspaceTransfer', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    workspaceTransferMocks.exportWorkspaceArchive.mockReset()
    workspaceTransferMocks.importWorkspaceArchiveAsNew.mockReset()
    workspaceTransferMocks.mergeWorkspaceArchive.mockReset()
    promptPasswordMock.mockReset()
    const { toastState, dismissToast } = useToast()
    for (const item of [...toastState.items]) dismissToast(item.id)
  })

  it('guards export for non-local workspaces without invoking the command', async () => {
    const store = useWorkspaceStore()
    store.activeHandle = null // no open workspace => backendKind is null, not 'local'

    const { transfer } = mountTransfer()
    await transfer.exportWorkspace()

    expect(workspaceTransferMocks.exportWorkspaceArchive).not.toHaveBeenCalled()
    expect(promptPasswordMock).not.toHaveBeenCalled()
    const { toastState } = useToast()
    expect(toastState.items.some(item => item.variant === 'error')).toBe(true)
  })

  it('builds a sanitized default archive name and trims the entered password', async () => {
    const store = useWorkspaceStore()
    store.activeHandle = { kind: 'local', path: '/workspaces/team' }
    store.manifest = manifestFixture('Team / Notes')
    promptPasswordMock.mockResolvedValueOnce('  secret  ')
    workspaceTransferMocks.exportWorkspaceArchive.mockResolvedValueOnce(true)

    const { transfer } = mountTransfer()
    await transfer.exportWorkspace()

    expect(workspaceTransferMocks.exportWorkspaceArchive).toHaveBeenCalledTimes(1)
    const [args] = workspaceTransferMocks.exportWorkspaceArchive.mock.calls[0]
    expect(args).toEqual({
      workspacePath: '/workspaces/team',
      defaultFileName: 'Team - Notes-export.nevoz',
      password: 'secret',
    })
  })

  it('treats a blank submitted password as "no password"', async () => {
    const store = useWorkspaceStore()
    store.activeHandle = { kind: 'local', path: '/workspaces/team' }
    store.manifest = manifestFixture('Team')
    promptPasswordMock.mockResolvedValueOnce('   ')
    workspaceTransferMocks.exportWorkspaceArchive.mockResolvedValueOnce(true)

    const { transfer } = mountTransfer()
    await transfer.exportWorkspace()

    const [args] = workspaceTransferMocks.exportWorkspaceArchive.mock.calls[0]
    expect(args.password).toBeNull()
  })

  it('does not export when the password prompt is cancelled', async () => {
    const store = useWorkspaceStore()
    store.activeHandle = { kind: 'local', path: '/workspaces/team' }
    store.manifest = manifestFixture('Team')
    promptPasswordMock.mockResolvedValueOnce(null)

    const { transfer } = mountTransfer()
    await transfer.exportWorkspace()

    expect(workspaceTransferMocks.exportWorkspaceArchive).not.toHaveBeenCalled()
  })

  describe('importMergeIntoCurrent', () => {
    it('guards merge for non-local workspaces without invoking the command', async () => {
      const store = useWorkspaceStore()
      store.activeHandle = null

      const { transfer } = mountTransfer()
      const result = await transfer.importMergeIntoCurrent()

      expect(result).toBeNull()
      expect(workspaceTransferMocks.mergeWorkspaceArchive).not.toHaveBeenCalled()
      const { toastState } = useToast()
      expect(toastState.items.some(item => item.variant === 'error')).toBe(true)
    })

    it('merges into the current workspace path, reloads it, and toasts the report counts', async () => {
      const store = useWorkspaceStore()
      store.activeHandle = { kind: 'local', path: '/workspaces/team' }
      store.manifest = manifestFixture('Team')
      const openWorkspace = vi.fn().mockResolvedValue(undefined)
      store.openWorkspace = openWorkspace
      const report = {
        importedNotes: 3,
        importedFolders: 2,
        importedAssets: 1,
        importedDatabases: 1,
        skippedBoards: 0,
        skippedSnapshots: 0,
      }
      workspaceTransferMocks.mergeWorkspaceArchive.mockResolvedValueOnce(report)

      const { transfer } = mountTransfer()
      const result = await transfer.importMergeIntoCurrent()

      expect(result).toEqual(report)
      expect(workspaceTransferMocks.mergeWorkspaceArchive).toHaveBeenCalledWith(
        '/workspaces/team',
        null,
        expect.any(Function),
      )
      expect(openWorkspace).toHaveBeenCalledWith('/workspaces/team')
      const { toastState } = useToast()
      const successToast = toastState.items.find(item => item.variant === 'success')
      expect(successToast?.message).toContain('3')
      expect(successToast?.message).toContain('2')
    })

    it('does not reload the workspace when the archive picker is cancelled', async () => {
      const store = useWorkspaceStore()
      store.activeHandle = { kind: 'local', path: '/workspaces/team' }
      store.manifest = manifestFixture('Team')
      const openWorkspace = vi.fn().mockResolvedValue(undefined)
      store.openWorkspace = openWorkspace
      workspaceTransferMocks.mergeWorkspaceArchive.mockResolvedValueOnce(null)

      const { transfer } = mountTransfer()
      const result = await transfer.importMergeIntoCurrent()

      expect(result).toBeNull()
      expect(openWorkspace).not.toHaveBeenCalled()
      const { toastState } = useToast()
      expect(toastState.items.some(item => item.variant === 'info')).toBe(true)
    })

    it('re-prompts for a password on an encrypted archive and retries the merge', async () => {
      const store = useWorkspaceStore()
      store.activeHandle = { kind: 'local', path: '/workspaces/team' }
      store.manifest = manifestFixture('Team')
      const openWorkspace = vi.fn().mockResolvedValue(undefined)
      store.openWorkspace = openWorkspace
      const report = {
        importedNotes: 1,
        importedFolders: 1,
        importedAssets: 0,
        importedDatabases: 0,
        skippedBoards: 0,
        skippedSnapshots: 0,
      }
      workspaceTransferMocks.mergeWorkspaceArchive
        .mockRejectedValueOnce(new Error('This archive is password-protected; a password is required'))
        .mockResolvedValueOnce(report)
      promptPasswordMock.mockResolvedValueOnce('secret')

      const { transfer } = mountTransfer()
      const result = await transfer.importMergeIntoCurrent()

      expect(result).toEqual(report)
      expect(workspaceTransferMocks.mergeWorkspaceArchive).toHaveBeenCalledTimes(2)
      expect(workspaceTransferMocks.mergeWorkspaceArchive).toHaveBeenLastCalledWith(
        '/workspaces/team',
        'secret',
        expect.any(Function),
      )
    })
  })
})
