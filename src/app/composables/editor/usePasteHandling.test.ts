import { describe, expect, it, vi } from 'vitest'
import { EditorState } from 'prosemirror-state'
import { Slice } from 'prosemirror-model'
import type { EditorView } from 'prosemirror-view'
import { nevoBaseSchema } from '../../../editor-core/schema'
import { createPasteHandler } from './usePasteHandling'
import { looksLikeMarkdown, parseMarkdownToSlice } from './markdownPaste'

vi.mock('./markdownPaste', () => ({
  looksLikeMarkdown: vi.fn((text: string) => text.startsWith('#')),
  parseMarkdownToSlice: vi.fn(() => null),
}))

const mockedParse = vi.mocked(parseMarkdownToSlice)
const mockedLooks = vi.mocked(looksLikeMarkdown)

function makeView(initial = '') {
  const doc = nevoBaseSchema.node('doc', null, [
    nevoBaseSchema.node('paragraph', null, initial ? [nevoBaseSchema.text(initial)] : []),
  ])
  let state = EditorState.create({ schema: nevoBaseSchema, doc })
  const dispatch = vi.fn((tr) => { state = state.apply(tr) })
  const view = {
    get state() { return state },
    dispatch,
  }
  return { view: view as unknown as EditorView, dispatch, getText: () => state.doc.textContent, paragraphs: () => state.doc.childCount }
}

function clipboardEvent(data: Record<string, string>): ClipboardEvent {
  return {
    clipboardData: { getData: (type: string) => data[type] ?? '' },
    preventDefault: vi.fn(),
  } as unknown as ClipboardEvent
}

describe('createPasteHandler', () => {
  it('short-circuits when an image was pasted', () => {
    const onImagePaste = vi.fn(() => true)
    const handle = createPasteHandler({ getPasteBehavior: () => 'plain-text', onImagePaste })
    const { view, dispatch } = makeView()
    const event = clipboardEvent({ 'text/plain': 'hello' })

    expect(handle(view, event)).toBe(true)
    expect(onImagePaste).toHaveBeenCalledWith(event)
    expect(dispatch).not.toHaveBeenCalled()
  })

  it('splits plain text into paragraphs in plain-text mode', () => {
    const handle = createPasteHandler({ getPasteBehavior: () => 'plain-text' })
    const { view, getText, paragraphs } = makeView()
    const event = clipboardEvent({ 'text/plain': 'one\ntwo\nthree' })

    expect(handle(view, event)).toBe(true)
    expect(paragraphs()).toBe(3)
    expect(getText()).toBe('onetwothree')
    expect(event.preventDefault).toHaveBeenCalled()
  })

  it('returns false for empty plain-text paste', () => {
    const handle = createPasteHandler({ getPasteBehavior: () => 'plain-text' })
    const { view, dispatch } = makeView()
    expect(handle(view, clipboardEvent({}))).toBe(false)
    expect(dispatch).not.toHaveBeenCalled()
  })

  it('defers to ProseMirror for rich HTML paste (never inserts raw HTML)', () => {
    const handle = createPasteHandler({ getPasteBehavior: () => 'smart' })
    const { view, dispatch } = makeView()
    const event = clipboardEvent({ 'text/html': '<b>x</b>', 'text/plain': '# md' })

    expect(handle(view, event)).toBe(false)
    expect(dispatch).not.toHaveBeenCalled()
    expect(mockedParse).not.toHaveBeenCalled()
  })

  it('converts Markdown text to a slice in rich mode', () => {
    mockedLooks.mockReturnValueOnce(true)
    mockedParse.mockReturnValueOnce(Slice.empty)
    const resolveWikiLink = vi.fn()
    const handle = createPasteHandler({ getPasteBehavior: () => 'smart', resolveWikiLink })
    const { view, dispatch } = makeView()
    const event = clipboardEvent({ 'text/plain': '# Heading' })

    expect(handle(view, event)).toBe(true)
    expect(mockedParse).toHaveBeenCalledWith('# Heading', view.state.schema, resolveWikiLink)
    expect(dispatch).toHaveBeenCalled()
    expect(event.preventDefault).toHaveBeenCalled()
  })

  it('falls through to no-op when Markdown parsing yields no slice', () => {
    mockedLooks.mockReturnValueOnce(true)
    mockedParse.mockReturnValueOnce(null)
    const handle = createPasteHandler({ getPasteBehavior: () => 'smart' })
    const { view, dispatch } = makeView()

    expect(handle(view, clipboardEvent({ 'text/plain': '# Heading' }))).toBe(false)
    expect(dispatch).not.toHaveBeenCalled()
  })
})
