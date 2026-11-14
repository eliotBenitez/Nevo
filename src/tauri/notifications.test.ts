import { beforeEach, describe, expect, it, vi } from 'vitest'
import { sendSystemNotification } from './notifications'

const core = vi.hoisted(() => ({ isTauri: vi.fn(() => true) }))
const plugin = vi.hoisted(() => ({
  isPermissionGranted: vi.fn(),
  requestPermission: vi.fn(),
  sendNotification: vi.fn(),
}))
vi.mock('@tauri-apps/api/core', () => core)
vi.mock('@tauri-apps/plugin-notification', () => plugin)
vi.mock('../utils/logger', () => ({ appLogger: { error: vi.fn(async () => undefined) } }))

describe('sendSystemNotification', () => {
  beforeEach(() => {
    core.isTauri.mockReturnValue(true)
    Object.values(plugin).forEach(fn => fn.mockReset())
  })

  it('does nothing outside Tauri', async () => {
    core.isTauri.mockReturnValue(false)
    expect(await sendSystemNotification('t', 'b')).toBe(false)
    expect(plugin.sendNotification).not.toHaveBeenCalled()
  })

  it('sends when permission is already granted', async () => {
    plugin.isPermissionGranted.mockResolvedValue(true)
    expect(await sendSystemNotification('t', 'b')).toBe(true)
    expect(plugin.sendNotification).toHaveBeenCalledWith({ title: 't', body: 'b' })
  })

  it('requests permission and respects denial', async () => {
    plugin.isPermissionGranted.mockResolvedValue(false)
    plugin.requestPermission.mockResolvedValue('denied')
    expect(await sendSystemNotification('t', 'b')).toBe(false)
    expect(plugin.sendNotification).not.toHaveBeenCalled()
  })

  it('swallows failures', async () => {
    plugin.isPermissionGranted.mockRejectedValue(new Error('boom'))
    expect(await sendSystemNotification('t', 'b')).toBe(false)
  })
})
