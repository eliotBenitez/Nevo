import { Plugin, PluginKey, TextSelection, type EditorState } from 'prosemirror-state'
import { canSplit } from 'prosemirror-transform'
import { Decoration, DecorationSet, type EditorView } from 'prosemirror-view'
import { joinDictatedText, splitSpokenCommands } from '../../core/dictation/dictatedText'

export interface DictationState {
  active: boolean
  anchor: number
  partial: string
  level: number
}

export interface DictationPluginOptions {
  onStop: () => void
  t: (key: string) => string
}

type Meta =
  | { type: 'start' }
  | { type: 'partial'; text: string }
  | { type: 'level'; level: number }
  | { type: 'stop' }
  | { type: 'commit'; anchor: number }

export const dictationPluginKey = new PluginKey<DictationState>('dictation')

const INACTIVE: DictationState = { active: false, anchor: 0, partial: '', level: 0 }

function syncWidget(root: HTMLElement, state: DictationState): void {
  root.style.setProperty('--nv-dictation-level', String(state.level))
  const partial = root.querySelector('.nv-dictation-partial')
  if (partial && partial.textContent !== state.partial) partial.textContent = state.partial
}

function renderWidget(view: EditorView, options: DictationPluginOptions): HTMLElement {
  const root = document.createElement('span')
  root.className = 'nv-dictation'
  root.contentEditable = 'false'

  const indicator = document.createElement('span')
  indicator.className = 'nv-dictation-indicator'
  indicator.setAttribute('aria-hidden', 'true')
  indicator.title = options.t('dictation.indicator')
  // Keep editor focus and caret where they are when the indicator is clicked.
  indicator.addEventListener('mousedown', event => event.preventDefault())
  indicator.addEventListener('click', () => options.onStop())

  const partial = document.createElement('span')
  partial.className = 'nv-dictation-partial'

  root.append(indicator, partial)
  syncWidget(root, dictationPluginKey.getState(view.state) ?? INACTIVE)
  return root
}

export function createDictationPlugin(options: DictationPluginOptions): Plugin<DictationState> {
  return new Plugin<DictationState>({
    key: dictationPluginKey,

    state: {
      init: () => INACTIVE,

      apply(tr, value, _oldState, newState): DictationState {
        const meta = tr.getMeta(dictationPluginKey) as Meta | undefined
        let next = value.active ? { ...value, anchor: tr.mapping.map(value.anchor) } : value
        // The session stays pinned to its block: the caret may reposition it only within that block.
        if (!meta && tr.selectionSet && next.active) {
          const $head = newState.selection.$head
          if ($head.sameParent(newState.doc.resolve(next.anchor))) next = { ...next, anchor: $head.pos }
        }
        if (!meta) return next

        switch (meta.type) {
          case 'start': return { active: true, anchor: newState.selection.head, partial: '', level: 0 }
          case 'partial': return { ...next, partial: meta.text }
          case 'level': return { ...next, level: Math.min(1, Math.max(0, meta.level)) }
          case 'commit': return { ...next, anchor: meta.anchor, partial: '' }
          case 'stop': return INACTIVE
        }
      },
    },

    props: {
      decorations(state) {
        const dictation = dictationPluginKey.getState(state)
        if (!dictation?.active) return null
        return DecorationSet.create(state.doc, [
          // Stable key: the widget DOM survives partial/level updates (patched in `view.update`),
          // so a click on the indicator is never lost to a re-render.
          Decoration.widget(dictation.anchor, view => renderWidget(view, options), {
            side: 1,
            key: 'nv-dictation',
            ignoreSelection: true,
            stopEvent: () => true,
          }),
        ])
      },

      handleKeyDown(view, event) {
        if (event.key !== 'Escape' || !dictationPluginKey.getState(view.state)?.active) return false
        options.onStop()
        return true
      },
    },

    view: () => ({
      update(view) {
        const dictation = dictationPluginKey.getState(view.state)
        const root = view.dom.querySelector<HTMLElement>('.nv-dictation')
        if (dictation?.active && root) syncWidget(root, dictation)
      },
    }),
  })
}

export function getDictationState(state: EditorState): DictationState {
  return dictationPluginKey.getState(state) ?? INACTIVE
}

function dispatchMeta(view: EditorView, meta: Meta): void {
  view.dispatch(view.state.tr.setMeta(dictationPluginKey, meta).setMeta('addToHistory', false))
}

export function startDictationUi(view: EditorView): void {
  dispatchMeta(view, { type: 'start' })
}

export function setDictationPartial(view: EditorView, text: string): void {
  if (getDictationState(view.state).active) dispatchMeta(view, { type: 'partial', text })
}

export function setDictationLevel(view: EditorView, level: number): void {
  if (getDictationState(view.state).active) dispatchMeta(view, { type: 'level', level })
}

export function stopDictationUi(view: EditorView): void {
  dispatchMeta(view, { type: 'stop' })
}

/**
 * Inserts a finished phrase at the dictation anchor as one undo step.
 * Returns false (inserting nothing) when the anchor is not in a plain textblock.
 */
export function commitDictatedText(view: EditorView, text: string): boolean {
  const { anchor } = getDictationState(view.state)
  const tr = view.state.tr
  const $anchor = tr.doc.resolve(Math.min(anchor, tr.doc.content.size))
  if (!$anchor.parent.isTextblock || $anchor.parent.type.spec.code) {
    dispatchMeta(view, { type: 'partial', text: '' })
    return false
  }

  let pos = $anchor.pos
  for (const op of splitSpokenCommands(text)) {
    if (op.kind === 'paragraph') {
      if (!canSplit(tr.doc, pos)) continue
      tr.split(pos)
      pos = tr.mapping.maps[tr.mapping.maps.length - 1].map(pos, 1)
      continue
    }
    const $pos = tr.doc.resolve(pos)
    const chunk = joinDictatedText($pos.parent.textBetween(0, $pos.parentOffset, undefined, '￼'), op.text)
    if (!chunk) continue
    tr.insertText(chunk, pos)
    pos += chunk.length
  }

  // Follow the dictated text with the caret only when the caret is in the dictation block.
  const caretInBlock = view.state.selection.$head.sameParent($anchor)
  if (!tr.docChanged) tr.setMeta('addToHistory', false)
  else if (caretInBlock) tr.setSelection(TextSelection.create(tr.doc, pos)).scrollIntoView()
  view.dispatch(tr.setMeta(dictationPluginKey, { type: 'commit', anchor: pos } satisfies Meta))
  return true
}
