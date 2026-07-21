import { nextTick, type Ref } from 'vue'
import { getLinkPickerState, parseWikiQuery } from '../../../editor-core'
import type { EditorCore } from './useEditorCore'
import type { NoteDocument } from '../../../types/note'
import type { WorkspaceBlockNavigationTarget } from '../../../types/search'
import type { TemplateDocument, TemplateFieldValues } from '../../../types/template'
import { resolveTemplateContent } from '../../../utils/templates'
import { sanitizeSvg } from '../../../utils/sanitizeSvg'
import { focusBlockSearchTarget } from '../../components/editor/blockNavigation'

export interface DrawBlockUpdate {
  drawId: string
  svgPreview: string
  src: string
  title?: string
}

interface EditorDocumentActionsOptions {
  core: EditorCore
  editorRoot: Ref<HTMLDivElement | null>
  getNote: () => NoteDocument | null
  getWorkspaceName: () => string
  getPendingBlockTarget: () => WorkspaceBlockNavigationTarget | null | undefined
  getPendingDrawUpdate: () => DrawBlockUpdate | null | undefined
  createNote: (folderId: string | null, title: string) => Promise<NoteDocument | null>
  insertContentAtSelection: (content: NoteDocument['content']) => boolean
  flushPendingContentUpdate: () => void
  closeTemplatePicker: () => void
  emitConsumedPendingTarget: () => void
  emitConsumedDrawUpdate: () => void
}

function pendingBlockTargetKey(target: WorkspaceBlockNavigationTarget): string {
  return [target.noteId, target.blockIndex, target.query, target.snippet].join(':')
}

export function useEditorDocumentActions(options: EditorDocumentActionsOptions) {
  let lastAppliedPendingBlockTargetKey: string | null = null
  let pendingBlockTargetApplicationKey: string | null = null

  function flushPendingContent() {
    options.flushPendingContentUpdate()
  }

  function selectLinkNote(note: { id: string; title: string }) {
    const view = options.core.editorView
    if (!view) return

    const pickerState = getLinkPickerState(view.state)
    if (!pickerState.open || !pickerState.range) return
    const markType = view.state.schema.marks.internal_link
    if (!markType) return

    const { from, to } = pickerState.range
    const parsed = parseWikiQuery(pickerState.query)
    const mark = markType.create({
      noteId: note.id,
      title: note.title,
      anchor: parsed.anchor,
      alias: parsed.alias,
    })
    const displayText = parsed.alias || note.title
    const tr = view.state.tr
      .delete(from, to)
      .insertText(displayText, from)
      .addMark(from, from + displayText.length, mark)
      .removeStoredMark(markType)
    view.dispatch(tr.scrollIntoView())
    view.focus()
  }

  async function selectLinkCreateNote(payload: {
    noteTitle: string
    anchor: string | null
    alias: string | null
  }) {
    const view = options.core.editorView
    if (!view) return

    const pickerState = getLinkPickerState(view.state)
    if (!pickerState.open || !pickerState.range) return
    const markType = view.state.schema.marks.internal_link
    if (!markType) return

    const note = await options.createNote(options.getNote()?.folderId ?? null, payload.noteTitle)
    if (!note) return

    const { from, to } = pickerState.range
    const mark = markType.create({
      noteId: note.id,
      title: payload.noteTitle,
      anchor: payload.anchor,
      alias: payload.alias,
    })
    const displayText = payload.alias || payload.noteTitle
    const tr = view.state.tr
      .delete(from, to)
      .insertText(displayText, from)
      .addMark(from, from + displayText.length, mark)
      .removeStoredMark(markType)
    view.dispatch(tr.scrollIntoView())
    view.focus()
  }

  function insertResolvedTemplate(payload: {
    template: TemplateDocument
    fieldValues: TemplateFieldValues
  }) {
    const resolved = resolveTemplateContent(payload.template.content, {
      note: options.getNote() ?? undefined,
      workspaceName: options.getWorkspaceName(),
      fields: payload.fieldValues,
    })
    options.insertContentAtSelection(resolved.content)
    options.closeTemplatePicker()
  }

  async function applyPendingBlockTargetIfReady() {
    const target = options.getPendingBlockTarget()
    const note = options.getNote()
    if (!target || !note || target.noteId !== note.id) return

    const targetKey = pendingBlockTargetKey(target)
    if (targetKey === lastAppliedPendingBlockTargetKey
      || targetKey === pendingBlockTargetApplicationKey) return
    pendingBlockTargetApplicationKey = targetKey

    await nextTick()
    try {
      const currentTarget = options.getPendingBlockTarget()
      const currentNote = options.getNote()
      if (!currentTarget || !currentNote || currentTarget.noteId !== currentNote.id) return
      if (pendingBlockTargetKey(currentTarget) !== targetKey) return
      if (!focusBlockSearchTarget(options.editorRoot.value, currentTarget)) return

      lastAppliedPendingBlockTargetKey = targetKey
      options.emitConsumedPendingTarget()
    } finally {
      if (pendingBlockTargetApplicationKey === targetKey) {
        pendingBlockTargetApplicationKey = null
      }
    }
  }

  function resetPendingBlockTarget() {
    lastAppliedPendingBlockTargetKey = null
  }

  function updateDrawBlock(payload: DrawBlockUpdate): boolean {
    const view = options.core.editorView
    if (!view) return false
    const nodeType = view.state.schema.nodes.draw_block
    if (!nodeType) return false

    let targetPos = -1
    view.state.doc.descendants((node, pos) => {
      if (targetPos === -1 && node.type === nodeType && node.attrs.drawId === payload.drawId) {
        targetPos = pos
        return false
      }
      return false
    })
    if (targetPos === -1) return false

    const node = view.state.doc.nodeAt(targetPos)
    if (!node) return false
    const attrs: Record<string, unknown> = {
      ...node.attrs,
      svgPreview: sanitizeSvg(payload.svgPreview),
      src: payload.src,
    }
    if (typeof payload.title === 'string') attrs.title = payload.title
    view.dispatch(view.state.tr.setNodeMarkup(targetPos, undefined, attrs))
    return true
  }

  function applyPendingDrawUpdateIfReady() {
    const pending = options.getPendingDrawUpdate()
    if (pending && options.core.editorView && updateDrawBlock(pending)) {
      options.emitConsumedDrawUpdate()
    }
  }

  return {
    flushPendingContent,
    selectLinkNote,
    selectLinkCreateNote,
    insertResolvedTemplate,
    applyPendingBlockTargetIfReady,
    resetPendingBlockTarget,
    updateDrawBlock,
    applyPendingDrawUpdateIfReady,
  }
}
