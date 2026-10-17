import type { EditorView } from 'prosemirror-view'
import type { Slice } from 'prosemirror-model'
import { parseMarkdownToSlice } from '../editor/markdownPaste'
import type { AiChatSelection } from '../../../stores/aiChat'

export class SelectionChangedError extends Error {
  constructor() {
    super('The selected text changed since the answer was requested.')
    this.name = 'SelectionChangedError'
  }
}

export class EmptyAnswerError extends Error {
  constructor() {
    super('The answer produced no content.')
    this.name = 'EmptyAnswerError'
  }
}

function sliceFor(view: EditorView, markdown: string): Slice {
  const slice = parseMarkdownToSlice(markdown, view.state.schema)
  if (!slice) throw new EmptyAnswerError()
  return slice
}

/** Empty selection: replaces the caret. Otherwise inserts after the block holding the selection end. */
export function insertAnswer(view: EditorView, markdown: string): void {
  const slice = sliceFor(view, markdown)
  const { selection, tr } = view.state
  if (selection.empty) {
    tr.replaceSelection(slice)
  } else {
    const { $to } = selection
    // Splitting the user's paragraph at the selection end would cut their sentence in two.
    const at = $to.parent.isTextblock ? $to.after() : $to.pos
    tr.replaceRange(at, at, slice)
  }
  view.dispatch(tr.scrollIntoView())
}

export function replaceSelection(view: EditorView, capture: AiChatSelection, markdown: string): void {
  const { doc, tr } = view.state
  const { from, to } = capture
  if (to > doc.content.size || from < 0 || doc.textBetween(from, to) !== capture.text) {
    throw new SelectionChangedError()
  }
  const slice = sliceFor(view, markdown)
  const single = slice.content.childCount === 1 ? slice.content.firstChild! : null
  if (single?.type.name === 'paragraph' && doc.resolve(from).sameParent(doc.resolve(to)) && doc.resolve(from).parent.isTextblock) {
    tr.replaceWith(from, to, single.content)
  } else {
    tr.replaceRange(from, to, slice)
  }
  view.dispatch(tr.scrollIntoView())
}
