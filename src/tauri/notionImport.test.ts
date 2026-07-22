import { beforeEach, describe, expect, it, vi } from 'vitest'

const invoke = vi.hoisted(() => vi.fn())
vi.mock('@tauri-apps/api/core', () => ({ invoke }))
vi.mock('../utils/logger', () => ({ appLogger: { error: vi.fn() } }))

import { importNotionAssets, pickAndScanNotionExport, releaseNotionImport } from './commands'

describe('Notion import Tauri wrappers', () => {
  beforeEach(() => {
    invoke.mockReset()
    invoke.mockResolvedValue(null)
  })

  it('uses the scan command without exposing an archive path to the frontend', async () => {
    await pickAndScanNotionExport()
    expect(invoke).toHaveBeenCalledWith('pick_and_scan_notion_export', undefined)
  })

  it('sends camelCase workspace, token, and batch paths payloads', async () => {
    await importNotionAssets('/workspace', 'session-token', ['files/image.png'])
    expect(invoke).toHaveBeenCalledWith('import_notion_assets', {
      workspacePath: '/workspace',
      sessionToken: 'session-token',
      paths: ['files/image.png'],
    })
  })

  it('releases the opaque session token', async () => {
    await releaseNotionImport('session-token')
    expect(invoke).toHaveBeenCalledWith('release_notion_import', { sessionToken: 'session-token' })
  })
})
