import { beforeEach, describe, expect, it, vi } from 'vitest'

const invoke = vi.hoisted(() => vi.fn())

const FakeChannel = vi.hoisted(() => class FakeChannel<T> {
  onmessage: (event: T) => void = () => {}
})

vi.mock('@tauri-apps/api/core', () => ({ invoke, Channel: FakeChannel }))
vi.mock('../utils/logger', () => ({ appLogger: { error: vi.fn() } }))

import { workspaceTransferCommands } from './workspaceTransfer'
import type { TransferProgress } from '../types/workspace-transfer'

describe('workspace transfer Tauri wrappers', () => {
  beforeEach(() => {
    invoke.mockReset()
    invoke.mockResolvedValue(null)
  })

  it('exports the archive with camelCase args and a progress channel', async () => {
    invoke.mockResolvedValueOnce(true)
    const events: TransferProgress[] = []

    const result = await workspaceTransferCommands.exportWorkspaceArchive(
      { workspacePath: '/ws', defaultFileName: 'ws-export.nevoz', password: null },
      (event) => events.push(event),
    )

    expect(result).toBe(true)
    expect(invoke).toHaveBeenCalledTimes(1)
    const [command, args] = invoke.mock.calls[0]
    expect(command).toBe('export_workspace_archive')
    expect(args).toMatchObject({
      workspacePath: '/ws',
      defaultFileName: 'ws-export.nevoz',
      password: null,
    })
    expect(args.onEvent).toBeInstanceOf(FakeChannel)

    const payload: TransferProgress = { type: 'started', total: 3 }
    args.onEvent.onmessage(payload)
    expect(events).toEqual([payload])
  })

  it('imports an archive as a new workspace and forwards progress messages', async () => {
    invoke.mockResolvedValueOnce('/new/workspace')
    const events: TransferProgress[] = []

    const result = await workspaceTransferCommands.importWorkspaceArchiveAsNew(
      'secret',
      (event) => events.push(event),
    )

    expect(result).toBe('/new/workspace')
    expect(invoke).toHaveBeenCalledWith('import_workspace_archive_as_new', expect.objectContaining({
      password: 'secret',
    }))
    const args = invoke.mock.calls[0][1]
    args.onEvent.onmessage({ type: 'extracting', done: 1, total: 4 })
    expect(events).toEqual([{ type: 'extracting', done: 1, total: 4 }])
  })

  it('extracts an archive to a temp directory for the merge flow', async () => {
    const extracted = { tempDir: '/cache/workspace-transfer/abc', header: {
      formatVersion: 1,
      appVersion: '1.0.0',
      exportedAt: '2026-01-01T00:00:00Z',
      encrypted: false,
      workspace: { id: 'w1', name: 'My Workspace', glyph: '📘', gradient: '', schemaVersion: 3 },
    } }
    invoke.mockResolvedValueOnce(extracted)

    const result = await workspaceTransferCommands.extractWorkspaceArchiveToTemp(null, () => {})

    expect(result).toEqual(extracted)
    expect(invoke).toHaveBeenCalledWith('extract_workspace_archive_to_temp', expect.objectContaining({
      password: null,
    }))
  })

  it('releases a temp directory by its path', async () => {
    await workspaceTransferCommands.releaseWorkspaceArchiveTemp('/cache/workspace-transfer/abc')
    expect(invoke).toHaveBeenCalledWith('release_workspace_archive_temp', {
      tempDir: '/cache/workspace-transfer/abc',
    })
  })

  it('merges an archive into the current workspace and forwards progress messages', async () => {
    const report = {
      importedNotes: 2,
      importedFolders: 1,
      importedAssets: 0,
      importedDatabases: 1,
      skippedBoards: 0,
      skippedSnapshots: 0,
    }
    invoke.mockResolvedValueOnce(report)
    const events: TransferProgress[] = []

    const result = await workspaceTransferCommands.mergeWorkspaceArchive(
      '/workspaces/team',
      'secret',
      (event) => events.push(event),
    )

    expect(result).toEqual(report)
    expect(invoke).toHaveBeenCalledWith('merge_workspace_archive', expect.objectContaining({
      currentWorkspacePath: '/workspaces/team',
      password: 'secret',
    }))
    const args = invoke.mock.calls[0][1]
    args.onEvent.onmessage({ type: 'file', done: 2, total: 5 })
    expect(events).toEqual([{ type: 'file', done: 2, total: 5 }])
  })
})
