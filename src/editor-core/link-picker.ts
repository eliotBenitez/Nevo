import { Plugin, PluginKey } from 'prosemirror-state'
import type { EditorState, Transaction } from 'prosemirror-state'
import type { EditorView } from 'prosemirror-view'

export interface LinkPickerRange {
  from: number
  to: number
  query: string
}

export interface LinkPickerState {
  open: boolean
  query: string
  range: LinkPickerRange | null
  activeIndex: number
}

type LinkPickerMeta =
  | { type: 'move'; delta: number }
  | { type: 'dismiss' }
  | { type: 'close' }

export const nevoLinkPickerKey = new PluginKey<LinkPickerState>('nevo-link-picker')

function createClosedState(): LinkPickerState {
  return { open: false, query: '', range: null, activeIndex: 0 }
}

function resolveLinkRange(state: EditorState): LinkPickerRange | null {
  const { selection } = state
  if (!selection.empty) return null

  const { $from } = selection
  if (!$from.parent.isTextblock) return null

  const textBefore = $from.parent.textBetween(0, $from.parentOffset, '\0', '\0')
  const triggerIndex = textBefore.lastIndexOf('[[')
  if (triggerIndex < 0) return null

  const rawQuery = textBefore.slice(triggerIndex + 2)
  if (/\n/.test(rawQuery)) return null

  return {
    from: $from.start() + triggerIndex,
    to: $from.start() + $from.parentOffset,
    query: rawQuery,
  }
}

function normalizeIndex(index: number, count: number): number {
  if (count <= 0) return 0
  const mod = index % count
  return mod < 0 ? mod + count : mod
}

function buildState(
  state: EditorState,
  prev: LinkPickerState,
  meta: LinkPickerMeta | undefined,
): LinkPickerState {
  if (meta?.type === 'close') return createClosedState()

  const range = resolveLinkRange(state)
  if (!range) return createClosedState()

  let { activeIndex } = prev
  const open = meta?.type !== 'dismiss'

  if (meta?.type === 'move') {
    activeIndex = normalizeIndex(activeIndex + meta.delta, Infinity)
  } else if (prev.query !== range.query) {
    activeIndex = 0
  }

  return {
    open,
    query: range.query,
    range,
    activeIndex,
  }
}

export function getLinkPickerState(state: EditorState): LinkPickerState {
  return nevoLinkPickerKey.getState(state) ?? createClosedState()
}

export function dismissLinkPicker(state: EditorState): Transaction {
  return state.tr.setMeta(nevoLinkPickerKey, { type: 'dismiss' } satisfies LinkPickerMeta)
}

export function createLinkPickerPlugin(): Plugin<LinkPickerState> {
  return new Plugin<LinkPickerState>({
    key: nevoLinkPickerKey,

    state: {
      init: () => createClosedState(),
      apply(transaction, prev, _oldState, newState) {
        const meta = transaction.getMeta(nevoLinkPickerKey) as LinkPickerMeta | undefined
        return buildState(newState, prev, meta)
      },
    },

    props: {
      handleKeyDown(view: EditorView, event: KeyboardEvent): boolean {
        const pickerState = nevoLinkPickerKey.getState(view.state)
        if (!pickerState?.open) return false

        if (event.key === 'ArrowDown') {
          view.dispatch(view.state.tr.setMeta(nevoLinkPickerKey, { type: 'move', delta: 1 } satisfies LinkPickerMeta))
          return true
        }
        if (event.key === 'ArrowUp') {
          view.dispatch(view.state.tr.setMeta(nevoLinkPickerKey, { type: 'move', delta: -1 } satisfies LinkPickerMeta))
          return true
        }
        if (event.key === 'Escape') {
          view.dispatch(view.state.tr.setMeta(nevoLinkPickerKey, { type: 'dismiss' } satisfies LinkPickerMeta))
          return true
        }
        return false
      },
    },
  })
}
