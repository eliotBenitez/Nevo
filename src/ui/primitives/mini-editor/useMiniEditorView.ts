import { reactive, ref, shallowRef, type Ref } from 'vue'
import { EditorView } from 'prosemirror-view'
import { NodeSelection, TextSelection, type Command } from 'prosemirror-state'
import { createMiniEditorState } from '../../../editor-core/mini'
import { nevoMiniSchema } from '../../../editor-core/schema/mini'
import type { NevoCoreCommands } from '../../../editor-core/commands'

/** Legacy mini-editor marks → current schema marks (older cards stored these). */
const LEGACY_MARK_RENAMES: Record<string, string> = { bold: 'strong', italic: 'em' }

interface JsonNode {
  type?: string
  marks?: Array<{ type?: string } | string>
  content?: JsonNode[]
  [key: string]: unknown
}

function migrateLegacyMarks(node: JsonNode): JsonNode {
  const next: JsonNode = { ...node }
  if (Array.isArray(node.marks)) {
    next.marks = node.marks.map((mark) => {
      if (typeof mark === 'string') return { type: LEGACY_MARK_RENAMES[mark] ?? mark }
      const type = mark.type
      return type && LEGACY_MARK_RENAMES[type] ? { ...mark, type: LEGACY_MARK_RENAMES[type] } : mark
    })
  }
  if (Array.isArray(node.content)) {
    next.content = node.content.map(migrateLegacyMarks)
  }
  return next
}

function jsonToDoc(value: unknown) {
  if (value && typeof value === 'object' && (value as JsonNode).type === 'doc') {
    try {
      return nevoMiniSchema.nodeFromJSON(migrateLegacyMarks(value as JsonNode))
    } catch { /* fall through to empty doc */ }
  }
  return nevoMiniSchema.node('doc', null, [nevoMiniSchema.node('paragraph')])
}

export interface ToolbarState {
  visible: boolean
  top: number
  left: number
}

export interface MathPopoverState {
  open: boolean
  latex: string
  top: number
  left: number
}

export interface UseMiniEditorViewOptions {
  getModelValue: () => unknown
  emitUpdate: (value: unknown) => void
}

export function useMiniEditorView(mountEl: Ref<HTMLElement | null>, options: UseMiniEditorViewOptions) {
  const view = shallowRef<EditorView | null>(null)
  let coreCommands: NevoCoreCommands | null = null
  let commands: Map<string, Command> | null = null
  let isSyncing = false

  const activeMarks = ref<Set<string>>(new Set())
  const isEmpty = ref(true)
  const toolbar = reactive<ToolbarState>({ visible: false, top: 0, left: 0 })
  const mathPopover = reactive<MathPopoverState>({ open: false, latex: '', top: 0, left: 0 })

  function computeIsEmpty() {
    const current = view.value
    if (!current) return true
    const doc = current.state.doc
    return doc.childCount === 1 && doc.firstChild?.type.name === 'paragraph' && doc.firstChild.content.size === 0
  }

  function computeActiveMarks() {
    const current = view.value
    if (!current) return new Set<string>()
    const { from, $from, to, empty } = current.state.selection
    const result = new Set<string>()
    for (const name of Object.keys(nevoMiniSchema.marks)) {
      const type = nevoMiniSchema.marks[name]
      const active = empty
        ? !!type.isInSet(current.state.storedMarks ?? $from.marks())
        : current.state.doc.rangeHasMark(from, to, type)
      if (active) result.add(name)
    }
    return result
  }

  function updateToolbar() {
    const current = view.value
    if (!current || !current.hasFocus()) { toolbar.visible = false; return }
    const { from, to, empty } = current.state.selection
    if (empty || !(current.state.selection instanceof TextSelection)) { toolbar.visible = false; return }

    // Viewport coordinates — the toolbar is teleported to <body> with fixed positioning.
    const start = current.coordsAtPos(from)
    const end = current.coordsAtPos(to)
    const top = Math.min(start.top, end.top)
    const left = Math.min(start.left, end.left)
    const right = Math.max(start.right, end.right)
    toolbar.top = Math.max(top - 44, 8)
    toolbar.left = (left + right) / 2
    toolbar.visible = true
  }

  function refreshOverlays() {
    activeMarks.value = computeActiveMarks()
    isEmpty.value = computeIsEmpty()
    updateToolbar()
  }

  function openMathPopover(latex: string, anchorRect: { bottom: number; left: number }) {
    mathPopover.latex = latex
    mathPopover.top = anchorRect.bottom + 6
    mathPopover.left = anchorRect.left
    mathPopover.open = true
  }

  function closeMathPopover() {
    mathPopover.open = false
  }

  function mount() {
    const el = mountEl.value
    if (!el) return
    const setup = createMiniEditorState({
      doc: jsonToDoc(options.getModelValue()),
      nodeViewOptions: {
        onRequestMathEdit: ({ node, anchorRect }) => {
          openMathPopover(typeof node.attrs.latex === 'string' ? node.attrs.latex : '', anchorRect)
        },
      },
    })
    coreCommands = setup.coreCommands
    commands = setup.commands

    view.value = new EditorView(el, {
      state: setup.state,
      nodeViews: setup.nodeViews,
      attributes: { class: 'nv-prosemirror' },
      dispatchTransaction(tr) {
        const current = view.value
        if (!current) return
        current.updateState(current.state.apply(tr))
        refreshOverlays()
        if (tr.docChanged && !isSyncing) options.emitUpdate(current.state.doc.toJSON())
        if (mathPopover.open && !tr.docChanged) closeMathPopover()
      },
    })
    refreshOverlays()
  }

  function destroy() {
    view.value?.destroy()
    view.value = null
    coreCommands = null
    commands = null
  }

  function syncModelValue(value: unknown) {
    const current = view.value
    if (!current) return
    const nextDoc = jsonToDoc(value)
    if (JSON.stringify(nextDoc.toJSON()) === JSON.stringify(current.state.doc.toJSON())) return
    const tr = current.state.tr.replaceWith(0, current.state.doc.content.size, nextDoc.content)
    tr.setMeta('addToHistory', false)
    isSyncing = true
    try {
      current.dispatch(tr)
    } finally {
      isSyncing = false
    }
  }

  function dispatch(command: Command, opts: { focus?: boolean } = {}) {
    const current = view.value
    if (!current) return
    command(current.state, current.dispatch, current)
    if (opts.focus !== false) current.focus()
    refreshOverlays()
  }

  function executeCommandById(id: string) {
    if (!commands) return
    dispatch(commands.get(id) ?? (() => false))
  }

  /** Open the math editor popover for the math node currently under a node selection. */
  function editSelectedMath() {
    const current = view.value
    if (!current) return
    const selection = current.state.selection
    if (!(selection instanceof NodeSelection)) return
    const node = selection.node
    if (node.type !== nevoMiniSchema.nodes.math_inline && node.type !== nevoMiniSchema.nodes.math_block) return
    const dom = current.nodeDOM(selection.from)
    const rect = dom instanceof HTMLElement ? dom.getBoundingClientRect() : current.coordsAtPos(selection.from) as unknown as DOMRect
    openMathPopover(typeof node.attrs.latex === 'string' ? node.attrs.latex : '', rect as DOMRect)
  }

  return {
    view,
    activeMarks,
    isEmpty,
    toolbar,
    mathPopover,
    getCoreCommands: () => coreCommands,
    mount,
    destroy,
    syncModelValue,
    dispatch,
    executeCommandById,
    editSelectedMath,
    closeMathPopover,
    refreshOverlays,
  }
}
