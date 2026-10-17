import { beforeEach, describe, expect, it, vi } from 'vitest'

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }))
vi.mock('@tauri-apps/api/core', () => ({ invoke, Channel: class {} }))

import { aiCommands } from './ai'

describe('aiCommands.searchNoteContext', () => {
  beforeEach(() => invoke.mockReset())

  it('invokes search_note_context with camelCase payload keys', async () => {
    invoke.mockResolvedValue([])
    await aiCommands.searchNoteContext('/ws', 'sensors', 8)
    expect(invoke).toHaveBeenCalledWith('search_note_context', {
      workspacePath: '/ws',
      query: 'sensors',
      limit: 8,
    })
  })
})
