import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { EditorState, TextSelection } from 'prosemirror-state'
import { EditorView } from 'prosemirror-view'
import { nevoBaseSchema } from '../../../editor-core/schema'
import type { AiGenerateOptions } from '../../../composables/useAiCompletion'

const search = vi.fn()
vi.mock('../../../tauri/ai', () => ({ aiCommands: { searchNoteContext: (...a: unknown[]) => search(...a) } }))

let generateImpl: (opts: AiGenerateOptions) => Promise<void>
const generate = vi.fn((opts: AiGenerateOptions) => generateImpl(opts))
vi.mock('../../../composables/useAiCompletion', () => ({ useAiCompletion: () => ({ generate }) }))

vi.mock('../../../stores/workspace', () => ({
  useWorkspaceStore: () => ({ activePath: '/ws', settings: { ai: {} } }),
}))
const notes = new Map([
  ['cur', { id: 'cur', title: 'Current' }],
  ['a', { id: 'a', title: 'Alpha' }],
])
vi.mock('../../../stores/tree', () => ({ useTreeStore: () => ({ noteById: notes }) }))

import { clearActiveEditor, registerActiveEditor } from '../editor/activeEditorRegistry'
import { useAiChatStore } from '../../../stores/aiChat'
import { useAiChatSession } from './useAiChatSession'

function openEditor(text: string, select?: [number, number]) {
  let state = EditorState.create({
    doc: nevoBaseSchema.node('doc', null, [nevoBaseSchema.node('paragraph', null, [nevoBaseSchema.text(text)])]),
    schema: nevoBaseSchema,
  })
  if (select) state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, select[0], select[1])))
  registerActiveEditor(new EditorView(document.createElement('div'), { state }), 'cur')
}

const hit = (noteId: string) => ({ noteId, noteTitle: noteId, folderId: null, blockIndex: 2, text: `text of ${noteId}`, score: 1 })

describe('useAiChatSession', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    clearActiveEditor()
    search.mockReset()
    generate.mockClear()
    generateImpl = async (o) => { o.onToken('Answer [1]'); o.onDone?.() }
  })

  it('workspace scope searches, filters unknown/current notes, current note is source 1', async () => {
    openEditor('my note body')
    search.mockResolvedValue([hit('cur'), hit('ghost'), hit('a')])
    const store = useAiChatStore()
    await useAiChatSession().send('question?')

    expect(search).toHaveBeenCalledWith('/ws', 'question?', 11)
    const msg = store.messages[1]
    if (msg.role !== 'assistant') throw new Error('expected assistant')
    expect(msg.sources.map(s => [s.n, s.noteId, s.blockIndex])).toEqual([[1, 'cur', null], [2, 'a', 2]])
    expect(msg.text).toBe('Answer [1]')
    expect(msg.status).toBe('done')
    expect(generate.mock.calls[0][0].prompt).toContain('my note body')
  })

  it('fills the source limit with other notes when the open note takes hits', async () => {
    openEditor('body')
    const others = Array.from({ length: 10 }, (_, i) => `n${i}`)
    for (const id of others) notes.set(id, { id, title: id })
    search.mockResolvedValue([hit('cur'), hit('cur'), hit('cur'), ...others.map(hit)])
    const store = useAiChatStore()
    await useAiChatSession().send('q')
    const msg = store.messages[1]
    if (msg.role !== 'assistant') throw new Error('expected assistant')
    expect(msg.sources.filter(s => !s.current).map(s => s.noteId)).toEqual(others.slice(0, 8))
    for (const id of others) notes.delete(id)
  })

  it('note scope does not search', async () => {
    openEditor('body')
    const store = useAiChatStore()
    store.scope = 'note'
    await useAiChatSession().send('q')
    expect(search).not.toHaveBeenCalled()
  })

  it('note scope keeps the current note even after its chip was removed', async () => {
    openEditor('only body')
    const store = useAiChatStore()
    store.scope = 'note'
    store.includeCurrentNote = false
    await useAiChatSession().send('summarize')
    expect(generate.mock.calls[0][0].prompt).toContain('only body')
  })

  it('captures a non-empty selection', async () => {
    openEditor('one two three', [5, 8])
    search.mockResolvedValue([])
    const store = useAiChatStore()
    await useAiChatSession().send('rewrite')
    const msg = store.messages[1]
    expect(msg.role === 'assistant' && msg.selection).toEqual({ noteId: 'cur', from: 5, to: 8, text: 'two' })
  })

  it('stop ignores later tokens', async () => {
    search.mockResolvedValue([])
    let emit!: AiGenerateOptions
    generateImpl = (o) => { emit = o; o.onToken('a'); return new Promise(() => {}) }
    const store = useAiChatStore()
    const session = useAiChatSession()
    void session.send('q')
    await vi.waitFor(() => expect(generate).toHaveBeenCalled())
    session.stop()
    emit.onToken('b')
    emit.onDone?.()
    const msg = store.messages[1]
    expect(msg.role === 'assistant' && [msg.text, msg.status]).toEqual(['a', 'stopped'])
    expect(store.streaming).toBe(false)
  })

  it('classifies errors', async () => {
    search.mockResolvedValue([])
    generateImpl = async (o) => o.onError?.('AI privacy mode blocks non-local endpoints')
    const store = useAiChatStore()
    await useAiChatSession().send('q')
    const msg = store.messages[1]
    expect(msg.role === 'assistant' && [msg.status, msg.errorKind]).toEqual(['error', 'privacy'])
  })

  it('sets unread when the panel is closed, not when open', async () => {
    search.mockResolvedValue([])
    const store = useAiChatStore()
    await useAiChatSession().send('q')
    expect(store.unread).toBe(true)
    store.setOpen(true)
    await useAiChatSession().send('q2')
    expect(store.unread).toBe(false)
  })

  it('retry replaces the failed exchange', async () => {
    search.mockResolvedValue([])
    generateImpl = async (o) => o.onError?.('boom')
    const store = useAiChatStore()
    const session = useAiChatSession()
    await session.send('q')
    generateImpl = async (o) => { o.onToken('ok'); o.onDone?.() }
    await session.retry(store.messages[1].id)
    expect(store.messages.map(m => m.role)).toEqual(['user', 'assistant'])
    expect(store.messages[1].role === 'assistant' && store.messages[1].text).toBe('ok')
  })
})
