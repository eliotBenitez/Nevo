import { afterEach } from 'vitest'
import { EditorView } from 'prosemirror-view'

// Undestroyed views leave DOMObserver timers that fire after jsdom teardown and surface as
// unhandled errors in CI. Importing this module registers the teardown for the test file.
const views: EditorView[] = []
afterEach(() => { views.splice(0).forEach(view => view.destroy()) })

export function createTestView(...args: ConstructorParameters<typeof EditorView>): EditorView {
  const view = new EditorView(...args)
  views.push(view)
  return view
}
