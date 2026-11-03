import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { createPinia, setActivePinia } from 'pinia'
import { useWorkspaceStore } from '../../stores/workspace'
import { useNoteStore } from '../../stores/note'
import { respondToMcpRequest } from '../../tauri/mcp'
import { useMcpBridgeHost } from './useMcpBridgeHost'

const eventMocks = vi.hoisted(() => ({
  listeners: new Map<string, (event: { payload: unknown }) => void>(),
  unlisten: vi.fn(),
}))

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(async (
    event: string,
    handler: (event: { payload: unknown }) => void,
  ) => {
    eventMocks.listeners.set(event, handler)
    return eventMocks.unlisten
  }),
}))

vi.mock('../../tauri/mcp', () => ({
  respondToMcpRequest: vi.fn().mockResolvedValue(undefined),
}))

const closedNotes = vi.hoisted(() => ({
  isOpenInEditor: vi.fn(() => false),
  readClosedNoteSnapshot: vi.fn(async (noteId: string) => ({ noteId, revision: 7 })),
  applyClosedNoteEdit: vi.fn(async () => ({ applied: true, noteId: 'note-2', revision: 8 })),
  writeClosedNoteMarkdown: vi.fn(async () => ({ applied: true, noteId: 'note-2', revision: 9 })),
}))

vi.mock('./editor/mcpClosedNoteEdits', () => closedNotes)

vi.mock('../../utils/logger', () => ({
  appLogger: {
    error: vi.fn().mockResolvedValue(undefined),
    warn: vi.fn().mockResolvedValue(undefined),
  },
}))

const hostOptions = {
  openNote: vi.fn(),
  renameNote: vi.fn().mockResolvedValue(undefined),
}

const Host = defineComponent({
  setup() {
    useMcpBridgeHost(hostOptions)
    return () => h('div')
  },
})

const i18n = createI18n({
  legacy: false,
  locale: 'en',
  messages: { en: {} },
})

describe('useMcpBridgeHost', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    eventMocks.listeners.clear()
    eventMocks.unlisten.mockClear()
    ;(globalThis as { isTauri?: boolean }).isTauri = true
  })

  afterEach(() => {
    delete (globalThis as { isTauri?: boolean }).isTauri
  })

  it('refreshes the live manifest after a structural MCP mutation', async () => {
    const workspaceStore = useWorkspaceStore()
    workspaceStore.activeHandle = { kind: 'local', path: '/tmp/workspace' }
    const refreshManifest = vi.spyOn(workspaceStore, 'refreshManifest').mockResolvedValue(undefined)
    const wrapper = mount(Host, { global: { plugins: [i18n] } })
    await flushPromises()

    const listener = eventMocks.listeners.get('mcp-workspace-changed')
    expect(listener).toBeDefined()
    listener?.({ payload: { method: 'notes.create', workspacePath: '/tmp/previous-workspace' } })
    await flushPromises()
    expect(refreshManifest).not.toHaveBeenCalled()

    listener?.({ payload: { method: 'notes.create', workspacePath: '/tmp/workspace' } })
    await flushPromises()

    expect(refreshManifest).toHaveBeenCalledOnce()

    wrapper.unmount()
    expect(eventMocks.unlisten).toHaveBeenCalledTimes(2)
  })

  it('routes agent renames through the shell and replies with the new title', async () => {
    const wrapper = mount(Host, { global: { plugins: [i18n] } })
    await flushPromises()

    eventMocks.listeners.get('mcp-bridge-request')?.({
      payload: { requestId: 'r1', kind: 'notes.rename', payload: { noteId: 'note-1', title: 'Renamed' } },
    })
    await flushPromises()

    expect(hostOptions.renameNote).toHaveBeenCalledWith('note-1', 'Renamed')
    expect(respondToMcpRequest).toHaveBeenCalledWith('r1', { noteId: 'note-1', title: 'Renamed' }, null)
    wrapper.unmount()
  })

  it('restores snapshots through the note store so an open note is reloaded', async () => {
    const noteStore = useNoteStore()
    const restore = vi.spyOn(noteStore, 'restoreSnapshot').mockResolvedValue({
      note: {} as never,
      recoverySnapshotId: 'recovery-1',
      warnings: [],
    })
    const wrapper = mount(Host, { global: { plugins: [i18n] } })
    await flushPromises()

    eventMocks.listeners.get('mcp-bridge-request')?.({
      payload: { requestId: 'r2', kind: 'history.restore', payload: { noteId: 'note-1', snapshotId: 's1' } },
    })
    await flushPromises()

    expect(restore).toHaveBeenCalledWith('note-1', 's1')
    expect(respondToMcpRequest).toHaveBeenCalledWith(
      'r2',
      { noteId: 'note-1', recoverySnapshotId: 'recovery-1', warnings: [] },
      null,
    )
    wrapper.unmount()
  })

  it('routes content calls for a note that is not open to the closed-note path', async () => {
    const wrapper = mount(Host, { global: { plugins: [i18n] } })
    await flushPromises()
    const send = (requestId: string, kind: string, payload: Record<string, unknown>) =>
      eventMocks.listeners.get('mcp-bridge-request')?.({ payload: { requestId, kind, payload } })

    send('s1', 'editor.snapshot', { noteId: 'note-2' })
    const edit = { noteId: 'note-2', revision: 7, operations: [{ type: 'insertText', text: 'x' }] }
    send('e1', 'editor.applyEdit', edit)
    const markdown = { noteId: 'note-2', markdown: '# Hi', mode: 'append' }
    send('m1', 'editor.writeMarkdown', markdown)
    await flushPromises()

    expect(closedNotes.isOpenInEditor).toHaveBeenCalledWith('note-2')
    expect(closedNotes.readClosedNoteSnapshot).toHaveBeenCalledWith('note-2')
    expect(closedNotes.applyClosedNoteEdit).toHaveBeenCalledWith(edit)
    expect(closedNotes.writeClosedNoteMarkdown).toHaveBeenCalledWith(markdown)
    expect(respondToMcpRequest).toHaveBeenCalledWith('s1', { noteId: 'note-2', revision: 7 }, null)
    expect(respondToMcpRequest).toHaveBeenCalledWith('e1', { applied: true, noteId: 'note-2', revision: 8 }, null)
    expect(respondToMcpRequest).toHaveBeenCalledWith('m1', { applied: true, noteId: 'note-2', revision: 9 }, null)
    wrapper.unmount()
  })
})
