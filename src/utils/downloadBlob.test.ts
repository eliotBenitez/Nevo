import { afterEach, describe, expect, it, vi } from 'vitest'

const exportDrawFile = vi.fn()
vi.mock('../tauri/commands', () => ({ noteCommands: { exportDrawFile: (...args: unknown[]) => exportDrawFile(...args) } }))

import { downloadBlob } from './downloadBlob'

describe('downloadBlob', () => {
  afterEach(() => {
    delete (globalThis as { isTauri?: boolean }).isTauri
    exportDrawFile.mockReset()
    vi.restoreAllMocks()
  })

  it('saves bytes natively in Tauri', async () => {
    ;(globalThis as { isTauri?: boolean }).isTauri = true
    exportDrawFile.mockResolvedValue(true)
    await downloadBlob(new Blob([new Uint8Array([1, 2, 3])]), 'a.png')
    expect(exportDrawFile).toHaveBeenCalledWith('a.png', new Uint8Array([1, 2, 3]))
  })

  it('falls back to an anchor download when native save fails', async () => {
    ;(globalThis as { isTauri?: boolean }).isTauri = true
    exportDrawFile.mockRejectedValue(new Error('boom'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    URL.createObjectURL = vi.fn(() => 'blob:x')
    URL.revokeObjectURL = vi.fn()
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    await downloadBlob(new Blob(['x']), 'a.svg')
    expect(click).toHaveBeenCalledTimes(1)
  })
})
