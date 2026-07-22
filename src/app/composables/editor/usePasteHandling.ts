import type { EditorView } from 'prosemirror-view'
import type { WorkspaceSettings } from '../../../types/workspace'
import { looksLikeMarkdown, parseMarkdownToSlice } from './markdownPaste'

export interface PasteHandlerOptions {
  /** Read at paste time (not captured) so it tracks the live editor settings,
   *  matching the previous inline handler. */
  getPasteBehavior: () => WorkspaceSettings['editor']['pasteBehavior']
  /** Synchronously inspect the paste for image files; returns true when an image
   *  was found (import kicked off async) so text/markdown insertion is skipped. */
  onImagePaste?: (event: ClipboardEvent) => boolean
  resolveWikiLink?: (title: string) => string | null
}

/**
 * Build the ProseMirror `handlePaste` handler. Precedence:
 *  1. image paste — delegated to the host (imports the asset asynchronously);
 *  2. rich paste — let ProseMirror parse `text/html`, else convert Markdown text
 *     to a slice through the schema (never inserting raw HTML);
 *  3. plain-text paste — split on newlines into paragraphs.
 */
export function createPasteHandler(options: PasteHandlerOptions) {
  return function handlePaste(view: EditorView, event: ClipboardEvent): boolean {
    if (options.onImagePaste?.(event)) return true
    if (options.getPasteBehavior() !== 'plain-text') {
      const html = event.clipboardData?.getData('text/html')
      if (html) return false
      const mdText = event.clipboardData?.getData('text/plain')
      if (mdText && looksLikeMarkdown(mdText)) {
        const slice = parseMarkdownToSlice(mdText, view.state.schema, options.resolveWikiLink)
        if (slice) {
          event.preventDefault()
          view.dispatch(view.state.tr.replaceSelection(slice).scrollIntoView())
          return true
        }
      }
      return false
    }
    const text = event.clipboardData?.getData('text/plain')
    if (!text) return false
    event.preventDefault()
    const { state, dispatch } = view
    const { schema } = state
    const paragraphType = schema.nodes.paragraph
    if (!paragraphType) {
      dispatch(state.tr.insertText(text).scrollIntoView())
      return true
    }
    const lines = text.split('\n')
    let tr = state.tr.deleteSelection()
    let pos = tr.selection.from
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i] ?? ''
      if (i === 0) {
        if (line) { tr = tr.insertText(line, pos); pos += line.length }
      } else {
        const para = line
          ? paragraphType.createAndFill(null, schema.text(line))
          : paragraphType.createAndFill()
        if (para) { tr = tr.insert(pos, para); pos += para.nodeSize }
      }
    }
    dispatch(tr.scrollIntoView())
    return true
  }
}
