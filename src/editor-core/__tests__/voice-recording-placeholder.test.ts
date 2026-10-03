import { describe, expect, it, vi } from 'vitest'
import { EditorState, TextSelection } from 'prosemirror-state'
import { EditorView } from 'prosemirror-view'
import { history, undo } from 'prosemirror-history'
import { nevoBaseSchema } from '../schema'
import { createNevoEditorState } from '../state'
import type { BlockNode } from '../../types/note'
import {
  createVoiceRecordingPlaceholderPlugin,
  getVoiceRecordingPlaceholder,
  removeVoiceRecordingPlaceholder,
  replaceVoiceRecordingPlaceholder,
  setVoiceRecordingPlaceholderPhase,
  showVoiceRecordingPlaceholder,
} from '../plugins/voice-recording-placeholder'

const schema = nevoBaseSchema

function makeView(paragraphs: string[], cursorInParagraph = 0) {
  const doc = schema.node('doc', null, paragraphs.map(text =>
    schema.node('paragraph', null, text ? [schema.text(text)] : [])))
  const options = { t: (k: string) => k, onStop: vi.fn(), onCancel: vi.fn(), getElapsedMs: () => 65_000 }
  let state = EditorState.create({ doc, plugins: [createVoiceRecordingPlaceholderPlugin(options)] })
  let offset = 1
  for (let i = 0; i < cursorInParagraph; i++) offset += doc.child(i).nodeSize
  state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, offset)))
  const view = new EditorView(document.createElement('div'), { state })
  return { view, options }
}

function audioNode() {
  return schema.nodes.media_block.create({ kind: 'audio', src: '.nevo/assets/a.wav', name: 'R.wav', mime: 'audio/wav', size: 3, duration: 1.2, poster: '' })
}

describe('voice recording placeholder', () => {
  it('keeps surrounding paragraphs separate and puts the placeholder inside the middle paragraph', () => {
    const { view, options } = makeView(['Above', '', 'Below'], 1)
    showVoiceRecordingPlaceholder(view, 'r1')
    const placeholder = getVoiceRecordingPlaceholder(view.state)!
    expect(view.state.doc.content.content.map(node => node.textContent)).toEqual(['Above', '', 'Below'])
    expect(view.dom.querySelectorAll(':scope > p')).toHaveLength(3)
    const widget = view.dom.querySelector('[data-voice-recording-placeholder]')!
    expect(widget.tagName).toBe('SPAN')
    expect(widget.parentElement?.tagName).toBe('P')
    expect(widget.parentElement?.previousElementSibling?.textContent).toBe('Above')
    expect(widget.parentElement?.nextElementSibling?.textContent).toBe('Below')
    expect(placeholder).toMatchObject({ id: 'r1', phase: 'recording' })
    expect(widget.textContent).toContain('01:05')
    ;(widget.querySelector('[data-action="stop"]') as HTMLButtonElement).click()
    expect(options.onStop).toHaveBeenCalledWith('r1')
    ;(widget.querySelector('[data-action="cancel"]') as HTMLButtonElement).click()
    expect(options.onCancel).toHaveBeenCalledWith('r1')
  })

  it('maps its position when text is inserted before it', () => {
    const { view } = makeView(['first', ''], 1)
    showVoiceRecordingPlaceholder(view, 'r1')
    const before = getVoiceRecordingPlaceholder(view.state)!.pos
    view.dispatch(view.state.tr.insertText('abc', 1))
    expect(getVoiceRecordingPlaceholder(view.state)!.pos).toBe(before + 3)
  })

  it('disables buttons in the saving phase', () => {
    const { view } = makeView([''], 0)
    showVoiceRecordingPlaceholder(view, 'r1')
    setVoiceRecordingPlaceholderPhase(view, 'r1', 'saving')
    const stop = view.dom.querySelector('[data-action="stop"]') as HTMLButtonElement
    expect(stop.disabled).toBe(true)
    const widget = view.dom.querySelector('[data-voice-recording-placeholder]')!
    expect(widget.getAttribute('aria-label')).toBe('voiceRecording.saving')
  })

  it('replaces the slot paragraph with audio without moving neighbors', () => {
    const { view } = makeView(['Above', '', 'Below'], 1)
    showVoiceRecordingPlaceholder(view, 'r1')
    expect(replaceVoiceRecordingPlaceholder(view, 'r1', audioNode())).toBe(true)
    expect(view.state.doc.childCount).toBe(3)
    expect(view.state.doc.child(0).textContent).toBe('Above')
    expect(view.state.doc.child(1).type.name).toBe('media_block')
    expect(view.state.doc.child(2).textContent).toBe('Below')
    expect(getVoiceRecordingPlaceholder(view.state)).toBeNull()
  })

  it('removes only its created slot on cancel and preserves surrounding blocks', () => {
    const { view } = makeView(['Above', 'Middle', 'Below'], 1)
    showVoiceRecordingPlaceholder(view, 'r1')
    removeVoiceRecordingPlaceholder(view, 'r1')
    expect(view.state.doc.content.content.map(node => node.textContent)).toEqual(['Above', 'Middle', 'Below'])

    showVoiceRecordingPlaceholder(view, 'r2')
    const slotPos = view.state.doc.child(0).nodeSize
    view.dispatch(view.state.tr.insertText('Draft', slotPos + 1))
    removeVoiceRecordingPlaceholder(view, 'r2')
    expect(view.state.doc.content.content.map(node => node.textContent)).toEqual(['Above', 'Draft', 'Middle', 'Below'])
  })

  it('does not remove a neighboring empty paragraph after the recording slot is deleted', () => {
    const doc = schema.node('doc', null, [
      schema.node('heading', { level: 1 }, [schema.text('Heading')]),
      schema.node('paragraph'),
      schema.node('paragraph', null, [schema.text('Below')]),
    ])
    let state = EditorState.create({ doc, plugins: [createVoiceRecordingPlaceholderPlugin({
      t: (k: string) => k,
      onStop: vi.fn(),
      onCancel: vi.fn(),
      getElapsedMs: () => 0,
    })] })
    state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 2)))
    const view = new EditorView(document.createElement('div'), { state })
    showVoiceRecordingPlaceholder(view, 'r1')
    const slotPos = view.state.doc.child(0).nodeSize
    view.dispatch(view.state.tr.delete(slotPos, slotPos + 2))

    removeVoiceRecordingPlaceholder(view, 'r1')
    expect(view.state.doc.childCount).toBe(3)
    expect(view.state.doc.child(1).type.name).toBe('paragraph')
    expect(view.state.doc.child(1).textContent).toBe('')
    expect(view.state.doc.child(2).textContent).toBe('Below')
  })

  it('preserves edits made in the slot and inserts audio before the edited paragraph', () => {
    const { view } = makeView(['Above', 'Middle', 'Below'], 1)
    showVoiceRecordingPlaceholder(view, 'r1')
    const slot = view.state.doc.child(1)
    view.dispatch(view.state.tr.insertText(' edited', view.state.doc.child(0).nodeSize + 1 + slot.content.size))
    expect(view.dom.querySelectorAll(':scope > p')[1].textContent).toContain(' edited')
    expect(replaceVoiceRecordingPlaceholder(view, 'r1', audioNode())).toBe(true)
    expect(view.state.doc.child(0).textContent).toBe('Above')
    expect(view.state.doc.child(1).type.name).toBe('media_block')
    expect(view.state.doc.child(2).textContent).toBe(' edited')
    expect(view.state.doc.child(3).textContent).toBe('Middle')
    expect(view.state.doc.child(4).textContent).toBe('Below')
    expect(view.dom.querySelectorAll(':scope > p')[1].textContent).toContain(' edited')
  })

  it('guards Backspace and Delete at the recording slot boundaries', () => {
    const { view } = makeView(['Above', 'Middle', 'Below'], 1)
    showVoiceRecordingPlaceholder(view, 'r1')
    const middleStart = view.state.doc.child(0).nodeSize + view.state.doc.child(1).nodeSize + 1
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, middleStart)))
    const backspace = new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true, cancelable: true })
    view.dom.dispatchEvent(backspace)
    expect(backspace.defaultPrevented).toBe(true)

    const aboveEnd = 1 + 'Above'.length
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, aboveEnd)))
    const deleteKey = new KeyboardEvent('keydown', { key: 'Delete', bubbles: true, cancelable: true })
    view.dom.dispatchEvent(deleteKey)
    expect(deleteKey.defaultPrevented).toBe(true)

    const slotPos = view.state.doc.child(0).nodeSize
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, slotPos + 1)))
    const backspaceInSlot = new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true, cancelable: true })
    view.dom.dispatchEvent(backspaceInSlot)
    expect(backspaceInSlot.defaultPrevented).toBe(true)
    const deleteInSlot = new KeyboardEvent('keydown', { key: 'Delete', bubbles: true, cancelable: true })
    view.dom.dispatchEvent(deleteInSlot)
    expect(deleteInSlot.defaultPrevented).toBe(true)

    expect(view.state.doc.content.content.map(node => node.textContent)).toEqual(['Above', '', 'Middle', 'Below'])
    expect(view.dom.querySelectorAll(':scope > p')).toHaveLength(4)
  })

  it('keeps transient slot changes out of history and leaves audio insertion undoable', () => {
    const doc = schema.node('doc', null, ['Above', 'Middle'].map(text =>
      schema.node('paragraph', null, [schema.text(text)])))
    const options = { t: (k: string) => k, onStop: vi.fn(), onCancel: vi.fn(), getElapsedMs: () => 0 }
    const state = EditorState.create({ doc, plugins: [history(), createVoiceRecordingPlaceholderPlugin(options)] })
    const view = new EditorView(document.createElement('div'), { state })

    showVoiceRecordingPlaceholder(view, 'r1')
    expect(undo(view.state, tr => view.dispatch(tr))).toBe(false)
    expect(getVoiceRecordingPlaceholder(view.state)).not.toBeNull()
    expect(view.state.doc.childCount).toBe(3)

    removeVoiceRecordingPlaceholder(view, 'r1')
    expect(undo(view.state, tr => view.dispatch(tr))).toBe(false)
    expect(view.state.doc.content.content.map(node => node.textContent)).toEqual(['Above', 'Middle'])

    const middleStart = view.state.doc.child(0).nodeSize + 1
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, middleStart)))
    showVoiceRecordingPlaceholder(view, 'r2')
    view.dispatch(view.state.tr.insertText('!', 1))
    expect(getVoiceRecordingPlaceholder(view.state)!.pos).toBe(view.state.doc.child(0).nodeSize)
    expect(undo(view.state, tr => view.dispatch(tr))).toBe(true)
    expect(getVoiceRecordingPlaceholder(view.state)!.pos).toBe(view.state.doc.child(0).nodeSize)
    expect(replaceVoiceRecordingPlaceholder(view, 'r2', audioNode())).toBe(true)
    expect(view.state.doc.child(1).type.name).toBe('media_block')
    expect(undo(view.state, tr => view.dispatch(tr))).toBe(true)
    expect(view.state.doc.content.content.map(node => node.textContent)).toEqual(['Above', '', 'Middle'])
    expect(getVoiceRecordingPlaceholder(view.state)).toBeNull()
  })

  it('inserts before a non-empty paragraph without replacing it', () => {
    const { view } = makeView(['first', 'typed later'], 1)
    showVoiceRecordingPlaceholder(view, 'r1')
    replaceVoiceRecordingPlaceholder(view, 'r1', audioNode())
    expect(view.state.doc.child(1).type.name).toBe('media_block')
    expect(view.state.doc.child(2).textContent).toBe('typed later')
  })

  it('hides a deleted slot and inserts audio at its mapped boundary', () => {
    const { view } = makeView(['Above', 'Middle', 'Below'], 1)
    showVoiceRecordingPlaceholder(view, 'r1')
    const slotPos = getVoiceRecordingPlaceholder(view.state)!.pos
    view.dispatch(view.state.tr.delete(slotPos, slotPos + 2))
    expect(view.dom.querySelector('[data-voice-recording-placeholder]')).toBeNull()
    expect(replaceVoiceRecordingPlaceholder(view, 'r1', audioNode())).toBe(true)
    expect(view.state.doc.childCount).toBe(4)
    expect(view.state.doc.child(0).textContent).toBe('Above')
    expect(view.state.doc.child(1).type.name).toBe('media_block')
    expect(view.state.doc.child(2).textContent).toBe('Middle')
    expect(view.state.doc.child(3).textContent).toBe('Below')
  })

  it('inserts after the containing top-level block when the immediate parent cannot hold the node (list item)', () => {
    const doc = schema.node('doc', null, [
      schema.node('bullet_list', null, [
        schema.node('list_item', null, [schema.node('paragraph', null, [schema.text('item')])]),
      ]),
      schema.node('paragraph', null, [schema.text('after')]),
    ])
    const options = { t: (k: string) => k, onStop: vi.fn(), onCancel: vi.fn(), getElapsedMs: () => 0 }
    let state = EditorState.create({ doc, plugins: [createVoiceRecordingPlaceholderPlugin(options)] })
    let itemParagraphPos = -1
    doc.descendants((node, pos) => {
      if (itemParagraphPos !== -1) return false
      if (node.type.name === 'paragraph' && node.textContent === 'item') { itemParagraphPos = pos; return false }
      return true
    })
    const cursorPos = itemParagraphPos + 1 + 'item'.length // end of 'item' text
    state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, cursorPos)))
    const view = new EditorView(document.createElement('div'), { state })

    showVoiceRecordingPlaceholder(view, 'r1')
    expect(replaceVoiceRecordingPlaceholder(view, 'r1', audioNode())).toBe(true)

    expect(view.state.doc.childCount).toBe(3)
    expect(view.state.doc.child(0).type.name).toBe('bullet_list')
    expect(view.state.doc.child(1).type.name).toBe('media_block')
    expect(view.state.doc.child(2).type.name).toBe('paragraph')
    expect(view.state.doc.child(2).textContent).toBe('after')
  })

  it('ignores actions for another id and removes cleanly', () => {
    const { view } = makeView([''], 0)
    showVoiceRecordingPlaceholder(view, 'r1')
    removeVoiceRecordingPlaceholder(view, 'other')
    expect(getVoiceRecordingPlaceholder(view.state)).not.toBeNull()
    removeVoiceRecordingPlaceholder(view, 'r1')
    expect(getVoiceRecordingPlaceholder(view.state)).toBeNull()
    expect(replaceVoiceRecordingPlaceholder(view, 'r1', audioNode())).toBe(false)
  })

  it('adds only a plain paragraph slot to the document when shown', () => {
    const { view } = makeView(['a'], 0)
    showVoiceRecordingPlaceholder(view, 'r1')
    expect(view.state.doc.childCount).toBe(2)
    expect(view.state.doc.child(0).textContent).toBe('')
    expect(view.state.doc.child(0).attrs).toEqual({ id: null })
    expect(view.state.doc.child(1).textContent).toBe('a')
  })

  it('treats Escape inside the widget as cancel', () => {
    const { view, options } = makeView([''], 0)
    showVoiceRecordingPlaceholder(view, 'r1')
    const widget = view.dom.querySelector('[data-voice-recording-placeholder]')!
    widget.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(options.onCancel).toHaveBeenCalledWith('r1')
  })
})

describe('voice-recording slash item registration', () => {
  const emptyContent: BlockNode = {
    type: 'doc',
    content: [{ type: 'paragraph', content: [] }],
  }

  it('adds the voice-recording slash item only when a request handler is given', () => {
    const withHandler = createNevoEditorState({
      schema: nevoBaseSchema,
      content: emptyContent,
      onVoiceRecordingRequest: vi.fn(),
    })
    expect(withHandler.slashItems.some(item => item.id === 'voice-recording')).toBe(true)

    const withoutHandler = createNevoEditorState({
      schema: nevoBaseSchema,
      content: emptyContent,
    })
    expect(withoutHandler.slashItems.some(item => item.id === 'voice-recording')).toBe(false)
  })
})
