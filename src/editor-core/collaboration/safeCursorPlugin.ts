import * as Y from 'yjs'
import { DecorationSet } from 'prosemirror-view'
import { Plugin } from 'prosemirror-state'
import type { Awareness } from 'y-protocols/awareness'
import {
  absolutePositionToRelativePosition,
  relativePositionToAbsolutePosition,
  setMeta,
  createDecorations,
  defaultAwarenessStateFilter,
  defaultCursorBuilder,
  defaultSelectionBuilder,
} from 'y-prosemirror'
import { yCursorPluginKey, ySyncPluginKey } from 'y-prosemirror'

function tryUpdateCursorInfo(
  view: import('prosemirror-view').EditorView,
  awareness: Awareness,
  getSelection: (state: import('prosemirror-state').EditorState) => import('prosemirror-state').Selection,
  cursorStateField: string,
): void {
  try {
    const ystate = ySyncPluginKey.getState(view.state)
    if (!ystate?.binding?.mapping) return
    const current = awareness.getLocalState() || {}
    if (view.hasFocus()) {
      const selection = getSelection(view.state)
      const anchor = absolutePositionToRelativePosition(
        selection.anchor,
        ystate.type,
        ystate.binding.mapping,
      )
      const head = absolutePositionToRelativePosition(
        selection.head,
        ystate.type,
        ystate.binding.mapping,
      )
      if (
        current.cursor == null
        || !Y.compareRelativePositions(Y.createRelativePositionFromJSON(current.cursor.anchor), anchor)
        || !Y.compareRelativePositions(Y.createRelativePositionFromJSON(current.cursor.head), head)
      ) {
        awareness.setLocalStateField(cursorStateField, { anchor, head })
      }
    } else if (current.cursor != null) {
      const pos = relativePositionToAbsolutePosition(
        ystate.doc,
        ystate.type,
        Y.createRelativePositionFromJSON(current.cursor.anchor),
        ystate.binding.mapping,
      )
      if (pos !== null) {
        awareness.setLocalStateField(cursorStateField, null)
      }
    }
  } catch { /* mapping stale during remote Yjs updates */ }
}

function safeCreateDecorations(
  state: import('prosemirror-state').EditorState,
  awareness: Awareness,
  awarenessStateFilter: typeof defaultAwarenessStateFilter,
  cursorBuilder: typeof defaultCursorBuilder,
  selectionBuilder: typeof defaultSelectionBuilder,
): DecorationSet {
  try {
    return createDecorations(state, awareness, awarenessStateFilter, cursorBuilder, selectionBuilder)
  } catch {
    return DecorationSet.create(state.doc, [])
  }
}

export function safeYCursorPlugin(
  awareness: Awareness,
  opts: {
    awarenessStateFilter?: typeof defaultAwarenessStateFilter
    cursorBuilder?: typeof defaultCursorBuilder
    selectionBuilder?: typeof defaultSelectionBuilder
    getSelection?: (state: import('prosemirror-state').EditorState) => import('prosemirror-state').Selection
  } = {},
  cursorStateField = 'cursor',
): Plugin {
  const awarenessStateFilter = opts.awarenessStateFilter ?? defaultAwarenessStateFilter
  const cursorBuilder = opts.cursorBuilder ?? defaultCursorBuilder
  const selectionBuilder = opts.selectionBuilder ?? defaultSelectionBuilder
  const getSelection = opts.getSelection ?? ((state: import('prosemirror-state').EditorState) => state.selection)

  return new Plugin({
    key: yCursorPluginKey,
    state: {
      init(_, state) {
        return safeCreateDecorations(state, awareness, awarenessStateFilter, cursorBuilder, selectionBuilder)
      },
      apply(tr, prevState, _oldState, newState) {
        const ystate = ySyncPluginKey.getState(newState)
        const yCursorState = tr.getMeta(yCursorPluginKey)
        if (
          (ystate && ystate.isChangeOrigin)
          || (yCursorState && yCursorState.awarenessUpdated)
        ) {
          return safeCreateDecorations(newState, awareness, awarenessStateFilter, cursorBuilder, selectionBuilder)
        }
        return prevState.map(tr.mapping, tr.doc)
      },
    },
    props: {
      decorations(state) {
        return yCursorPluginKey.getState(state)
      },
    },
    view(view) {
      const awarenessListener = () => {
        if ((view as any).docView) {
          setMeta(view, yCursorPluginKey, { awarenessUpdated: true })
        }
      }
      const updateCursorInfo = () => {
        tryUpdateCursorInfo(view, awareness, getSelection, cursorStateField)
      }
      awareness.on('change', awarenessListener)
      view.dom.addEventListener('focusin', updateCursorInfo)
      view.dom.addEventListener('focusout', updateCursorInfo)
      return {
        update: updateCursorInfo,
        destroy() {
          view.dom.removeEventListener('focusin', updateCursorInfo)
          view.dom.removeEventListener('focusout', updateCursorInfo)
          awareness.off('change', awarenessListener)
          awareness.setLocalStateField(cursorStateField, null)
        },
      }
    },
  })
}
