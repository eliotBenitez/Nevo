import type { Node as PMNode } from 'prosemirror-model'
import { Plugin, PluginKey, type EditorState } from 'prosemirror-state'
import { Decoration, DecorationSet, type EditorView } from 'prosemirror-view'

export type VoiceRecordingPhase = 'recording' | 'saving'

export interface VoiceRecordingPlaceholder {
  id: string
  /** Position of the slot paragraph node in the document. */
  pos: number
  /** End of the slot paragraph, mapped separately to detect slot deletion. */
  end: number
  phase: VoiceRecordingPhase
  createdSlot: boolean
}

export interface VoiceRecordingPlaceholderOptions {
  t: (key: string) => string
  onStop: (id: string) => void
  onCancel: (id: string) => void
  getElapsedMs: (id: string) => number
}

type Meta =
  | { type: 'show', id: string, pos: number, end: number, createdSlot: boolean }
  | { type: 'phase', id: string, phase: VoiceRecordingPhase }
  | { type: 'remove', id: string }

export const voiceRecordingPlaceholderKey = new PluginKey<VoiceRecordingPlaceholder | null>('voice-recording-placeholder')

function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function renderWidget(placeholder: VoiceRecordingPlaceholder, options: VoiceRecordingPlaceholderOptions): HTMLElement {
  const { id, phase } = placeholder
  const root = document.createElement('span')
  root.className = 'nv-voice-recording'
  root.dataset.voiceRecordingPlaceholder = id
  root.dataset.phase = phase
  root.contentEditable = 'false'
  root.setAttribute('role', 'group')
  root.setAttribute('aria-label', options.t(phase === 'saving' ? 'voiceRecording.saving' : 'voiceRecording.recording'))

  const dot = document.createElement('span')
  dot.className = 'nv-voice-recording-dot'
  dot.setAttribute('aria-hidden', 'true')

  const label = document.createElement('span')
  label.className = 'nv-voice-recording-label'
  label.textContent = options.t(phase === 'saving' ? 'voiceRecording.saving' : 'voiceRecording.recording')

  const timer = document.createElement('span')
  timer.className = 'nv-voice-recording-timer'
  timer.setAttribute('role', 'timer')
  timer.textContent = formatElapsed(options.getElapsedMs(id))

  const makeButton = (action: 'stop' | 'cancel') => {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = `nv-voice-recording-btn nv-voice-recording-btn--${action}`
    button.dataset.action = action
    button.textContent = options.t(`voiceRecording.${action}`)
    button.setAttribute('aria-label', options.t(`voiceRecording.${action}`))
    button.disabled = phase === 'saving'
    button.addEventListener('mousedown', event => event.preventDefault())
    button.addEventListener('click', (event) => {
      event.preventDefault()
      if (action === 'stop') options.onStop(id)
      else options.onCancel(id)
    })
    return button
  }

  root.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && phase === 'recording') {
      event.preventDefault()
      event.stopPropagation()
      options.onCancel(id)
    }
  })

  root.append(dot, label, timer, makeButton('stop'), makeButton('cancel'))

  if (phase === 'recording') {
    const interval = setInterval(() => {
      if (!root.isConnected) { clearInterval(interval); return }
      timer.textContent = formatElapsed(options.getElapsedMs(id))
    }, 500)
    ;(root as HTMLElement & { _nvStopTimer?: () => void })._nvStopTimer = () => clearInterval(interval)
  }
  return root
}

function isSlotPresent(doc: PMNode, placeholder: VoiceRecordingPlaceholder): boolean {
  const slot = doc.nodeAt(placeholder.pos)
  return slot?.type.name === 'paragraph' && placeholder.end === placeholder.pos + slot.nodeSize
}

export function createVoiceRecordingPlaceholderPlugin(options: VoiceRecordingPlaceholderOptions): Plugin {
  return new Plugin<VoiceRecordingPlaceholder | null>({
    key: voiceRecordingPlaceholderKey,
    state: {
      init: () => null,
      apply(tr, value) {
        let next = value
          ? { ...value, pos: tr.mapping.map(value.pos, -1), end: tr.mapping.map(value.end, 1) }
          : null
        const meta = tr.getMeta(voiceRecordingPlaceholderKey) as Meta | undefined
        if (!meta) return next
        if (meta.type === 'show') return { id: meta.id, pos: meta.pos, end: meta.end, phase: 'recording', createdSlot: meta.createdSlot }
        if (!next || next.id !== meta.id) return next
        if (meta.type === 'phase') next = { ...next, phase: meta.phase }
        if (meta.type === 'remove') next = null
        return next
      },
    },
    props: {
      decorations(state) {
        const placeholder = voiceRecordingPlaceholderKey.getState(state)
        if (!placeholder || !isSlotPresent(state.doc, placeholder)) return null
        const widget = Decoration.widget(placeholder.pos + 1, () => renderWidget(placeholder, options), {
          side: -1,
          key: `voice-recording-${placeholder.id}-${placeholder.phase}`,
          ignoreSelection: true,
          stopEvent: () => true,
          destroy: node => (node as HTMLElement & { _nvStopTimer?: () => void })._nvStopTimer?.(),
        })
        return DecorationSet.create(state.doc, [widget])
      },
      handleKeyDown(view, event) {
        const placeholder = voiceRecordingPlaceholderKey.getState(view.state)
        const { selection } = view.state
        if (!placeholder || !selection.empty || !['Backspace', 'Delete'].includes(event.key)) return false
        const $cursor = selection.$from
        if ($cursor.depth !== 1) return false
        if (!isSlotPresent(view.state.doc, placeholder)) return false
        const slot = view.state.doc.nodeAt(placeholder.pos)
        if (slot?.type.name !== 'paragraph') return false
        const nextBlockStart = placeholder.pos + slot.nodeSize
        const withinSlotAtStart = $cursor.before(1) === placeholder.pos && $cursor.parentOffset === 0
        const withinSlotAtEnd = $cursor.before(1) === placeholder.pos
          && $cursor.parentOffset === $cursor.parent.content.size
        const atNextBlockStart = event.key === 'Backspace'
          && $cursor.parentOffset === 0
          && $cursor.before(1) === nextBlockStart
        const atPreviousBlockEnd = event.key === 'Delete'
          && $cursor.parentOffset === $cursor.parent.content.size
          && $cursor.after(1) === placeholder.pos
        return (event.key === 'Backspace' && withinSlotAtStart)
          || (event.key === 'Delete' && withinSlotAtEnd)
          || atNextBlockStart
          || atPreviousBlockEnd
      },
    },
  })
}

export function getVoiceRecordingPlaceholder(state: EditorState): VoiceRecordingPlaceholder | null {
  return voiceRecordingPlaceholderKey.getState(state) ?? null
}

/** Anchors the placeholder at the start of the block containing the cursor. */
export function showVoiceRecordingPlaceholder(view: EditorView, id: string): void {
  const { $from } = view.state.selection
  const { state } = view
  const paragraph = state.schema.nodes.paragraph
  const topLevelPos = $from.depth > 0 ? $from.before(1) : 0
  const topLevel = state.doc.nodeAt(topLevelPos)
  let slotPos: number
  let createdSlot = false
  let tr = state.tr

  if (topLevel?.type === paragraph && topLevel.content.size === 0) {
    slotPos = topLevelPos
  } else if (topLevel) {
    const index = state.doc.resolve(topLevelPos).index(0)
    const insideTopLevelParagraph = topLevel.type === paragraph && $from.depth >= 1 && $from.parent.type === paragraph
    slotPos = insideTopLevelParagraph ? topLevelPos : topLevelPos + topLevel.nodeSize
    const insertIndex = insideTopLevelParagraph ? index : index + 1
    if (!state.doc.canReplaceWith(insertIndex, insertIndex, paragraph)) {
      slotPos = topLevelPos
    }
    tr = tr.insert(slotPos, paragraph.create())
    createdSlot = true
  } else {
    slotPos = state.doc.content.size
    tr = tr.insert(slotPos, paragraph.create())
    createdSlot = true
  }

  view.dispatch(tr
    .setMeta(voiceRecordingPlaceholderKey, { type: 'show', id, pos: slotPos, end: slotPos + 2, createdSlot } satisfies Meta)
    .setMeta('addToHistory', false))
  const raf = globalThis.requestAnimationFrame ?? ((cb: () => void) => setTimeout(cb, 0))
  raf(() => {
    const stop = view.dom.querySelector<HTMLButtonElement>(`[data-voice-recording-placeholder="${id}"] [data-action="stop"]`)
    stop?.focus()
  })
}

export function setVoiceRecordingPlaceholderPhase(view: EditorView, id: string, phase: VoiceRecordingPhase): void {
  view.dispatch(view.state.tr.setMeta(voiceRecordingPlaceholderKey, { type: 'phase', id, phase } satisfies Meta))
}

export function removeVoiceRecordingPlaceholder(view: EditorView, id: string): void {
  const placeholder = getVoiceRecordingPlaceholder(view.state)
  if (!placeholder || placeholder.id !== id) return
  let tr = view.state.tr
  const slot = view.state.doc.nodeAt(placeholder.pos)
  if (placeholder.createdSlot && isSlotPresent(view.state.doc, placeholder) && slot?.content.size === 0) {
    tr = tr.delete(placeholder.pos, placeholder.pos + slot.nodeSize)
  }
  view.dispatch(tr
    .setMeta(voiceRecordingPlaceholderKey, { type: 'remove', id } satisfies Meta)
    .setMeta('addToHistory', false))
}

/** Replaces the recording slot with `node`, preserving any edits made there. */
export function replaceVoiceRecordingPlaceholder(view: EditorView, id: string, node: PMNode): boolean {
  const placeholder = getVoiceRecordingPlaceholder(view.state)
  if (!placeholder || placeholder.id !== id) return false
  const { state } = view
  const pos = Math.min(placeholder.pos, state.doc.content.size)
  const slot = state.doc.nodeAt(pos)
  const slotIsPresent = isSlotPresent(state.doc, placeholder)
  let tr = state.tr
  if (slotIsPresent && slot?.type.name === 'paragraph') {
    const index = state.doc.resolve(pos).index(0)
    if (slot.content.size === 0 && state.doc.canReplaceWith(index, index + 1, node.type)) {
      tr = tr.replaceWith(pos, pos + slot.nodeSize, node)
    } else if (state.doc.canReplaceWith(index, index, node.type)) {
      tr = tr.insert(pos, node)
    } else {
      tr = tr.insert(state.doc.content.size, node)
    }
  } else {
    const $pos = state.doc.resolve(pos)
    const topPos = $pos.depth ? $pos.before(1) : pos
    const index = state.doc.resolve(topPos).index(0)
    const insertPos = state.doc.canReplaceWith(index, index, node.type) ? topPos : state.doc.content.size
    tr = tr.insert(insertPos, node)
  }
  tr = tr.setMeta(voiceRecordingPlaceholderKey, { type: 'remove', id } satisfies Meta)
  view.dispatch(tr.scrollIntoView())
  return true
}
