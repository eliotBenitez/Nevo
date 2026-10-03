import { computed, markRaw, reactive } from 'vue'
import type { EditorView } from 'prosemirror-view'
import { TextSelection } from 'prosemirror-state'
import { useI18n } from 'vue-i18n'
import { Copy, Scissors, Clipboard, Trash2, Pilcrow, Heading1, Heading2, Heading3, Heading4, Heading5, Heading6, SquareCode, MessageSquareQuote, CheckSquare, Link, List, ListOrdered } from 'lucide-vue-next'
import type { NvMenuItemDef } from '../../../ui/primitives/menu-types'
import type { EditorCore } from './useEditorCore'
import { runGuardedCommand } from './prosemirrorErrors'
import { ensureBlockId } from '../../../editor-core/commands/blockId'
import { encodeBlockRef } from '../../../core/blockRef/resolveBlockRef'
import { resolveTurnIntoSelectionPos, createDeleteBlockTransaction } from './blockHandlePosition'

export interface EditorContextMenuState {
  open: boolean
  pos: { top: number; left: number }
  blockPos: number | null
  blockNodeType: string | null
}

const TURN_INTO_CAPABLE = new Set(['paragraph', 'heading', 'code_block', 'callout', 'checklist_item', 'bullet_list', 'ordered_list'])

export function useEditorContextMenu(core: EditorCore, getCurrentNoteId: () => string | null) {
  const { t } = useI18n()

  const ctxMenu = reactive<EditorContextMenuState>({
    open: false,
    pos: { top: 0, left: 0 },
    blockPos: null,
    blockNodeType: null,
  })

  let activeView: EditorView | null = null

  function openContextMenu(view: EditorView, event: MouseEvent) {
    activeView = view
    ctxMenu.pos = { top: event.clientY, left: event.clientX }
    ctxMenu.blockPos = null
    ctxMenu.blockNodeType = null
    
    const coords = { left: event.clientX, top: event.clientY }
    const posAtCoords = view.posAtCoords(coords)
    
    if (posAtCoords) {
      const selection = view.state.selection
      const isInside = !selection.empty && posAtCoords.pos >= selection.from && posAtCoords.pos <= selection.to
      
      const doc = view.state.doc
      const $pos = doc.resolve(posAtCoords.pos)
      
      if (!isInside) {
         if ($pos.parent.isTextblock) {
             const tr = view.state.tr.setSelection(TextSelection.near($pos))
             view.dispatch(tr)
         }
      }
      
      // Determine block for block actions
      if ($pos.depth > 0) {
         ctxMenu.blockPos = $pos.before()
         const node = doc.nodeAt(ctxMenu.blockPos)
         if (node) {
             ctxMenu.blockNodeType = node.type.name
         }
      }
    }

    event.preventDefault()
    ctxMenu.open = true
    console.log('openContextMenu executed! ctxMenu.open is now', ctxMenu.open, 'pos:', ctxMenu.pos, 'items length:', menuItems.value.length)
    return true
  }

  function copyAction() {
    document.execCommand('copy')
    ctxMenu.open = false
    activeView?.focus()
  }

  function cutAction() {
    document.execCommand('cut')
    ctxMenu.open = false
    activeView?.focus()
  }

  async function pasteAction() {
    try {
      const text = await navigator.clipboard.readText()
      const view = activeView
      if (text && view) {
         view.dispatch(view.state.tr.insertText(text).scrollIntoView())
      }
    } catch (e) {
      console.error('Failed to read clipboard', e)
    }
    ctxMenu.open = false
    activeView?.focus()
  }

  function turnInto(commandId: string) {
    const view = activeView
    const pos = ctxMenu.blockPos
    if (!view || pos === null) return
    const selectionPos = resolveTurnIntoSelectionPos(view.state.doc, pos, view.state.selection.from)
    if (selectionPos !== null) {
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, selectionPos)))
    }
    const cmd = core.commandRegistry.get(commandId)
    runGuardedCommand(() => {
      cmd?.(view.state, view.dispatch.bind(view))
    }, {
      event: 'context_menu_turn_into_error',
      message: 'Block transform command failed',
      workspacePath: core.workspacePath,
      payload: { commandId, pos },
    })
    ctxMenu.open = false
    view.focus()
  }

  function duplicateBlock() {
    const view = activeView
    const pos = ctxMenu.blockPos
    if (!view || pos === null) return
    const node = view.state.doc.nodeAt(pos)
    if (!node) return
    const copy = node.copy(node.content)
    view.dispatch(view.state.tr.insert(pos + node.nodeSize, copy).scrollIntoView())
    ctxMenu.open = false
    view.focus()
  }

  function copyBlockRef() {
    const view = activeView
    const pos = ctxMenu.blockPos
    if (!view || pos === null) return
    const noteId = getCurrentNoteId()
    if (!noteId) return
    const blockId = ensureBlockId(view, pos)
    if (!blockId) return
    navigator.clipboard.writeText(encodeBlockRef({ noteId, blockId })).catch(() => {})
    ctxMenu.open = false
    view.focus()
  }

  function deleteNode() {
     const view = activeView
     if (!view) return
     const { state, dispatch } = view
     
     if (!state.selection.empty) {
        dispatch(state.tr.deleteSelection().scrollIntoView())
     } else if (ctxMenu.blockPos !== null) {
        const tr = createDeleteBlockTransaction(state, ctxMenu.blockPos)
        if (tr) dispatch(tr)
     }
     ctxMenu.open = false
     view.focus()
  }

  const turnIntoItems = [
    { labelKey: 'workspace.blockMenu.paragraph', commandId: 'core.paragraph', icon: markRaw(Pilcrow) },
    { labelKey: 'workspace.blockMenu.heading1',  commandId: 'core.heading.1', icon: markRaw(Heading1) },
    { labelKey: 'workspace.blockMenu.heading2',  commandId: 'core.heading.2', icon: markRaw(Heading2) },
    { labelKey: 'workspace.blockMenu.heading3',  commandId: 'core.heading.3', icon: markRaw(Heading3) },
    { labelKey: 'workspace.blockMenu.heading4',  commandId: 'core.heading.4', icon: markRaw(Heading4) },
    { labelKey: 'workspace.blockMenu.heading5',  commandId: 'core.heading.5', icon: markRaw(Heading5) },
    { labelKey: 'workspace.blockMenu.heading6',  commandId: 'core.heading.6', icon: markRaw(Heading6) },
    { labelKey: 'workspace.blockMenu.bulletList', commandId: 'core.bulletList', icon: markRaw(List) },
    { labelKey: 'workspace.blockMenu.numberedList', commandId: 'core.orderedList', icon: markRaw(ListOrdered) },
    { labelKey: 'workspace.blockMenu.codeBlock', commandId: 'core.codeBlock', icon: markRaw(SquareCode) },
    { labelKey: 'workspace.blockMenu.callout',   commandId: 'core.callout',   icon: markRaw(MessageSquareQuote) },
    { labelKey: 'workspace.blockMenu.checklist', commandId: 'core.checklistItem', icon: markRaw(CheckSquare) },
  ]

  const menuItems = computed<NvMenuItemDef[]>(() => {
    const items: NvMenuItemDef[] = [
      { label: t('editor.menu.copy'), icon: markRaw(Copy), action: copyAction },
      { label: t('editor.menu.cut'), icon: markRaw(Scissors), action: cutAction },
      { label: t('editor.menu.paste'), icon: markRaw(Clipboard), action: pasteAction },
      { type: 'separator' }
    ]
    
    if (ctxMenu.blockPos !== null) {
      if (ctxMenu.blockNodeType && TURN_INTO_CAPABLE.has(ctxMenu.blockNodeType)) {
        items.push({
          label: t('workspace.blockMenu.turnInto'),
          icon: markRaw(Pilcrow),
          items: turnIntoItems.map(item => ({
            label: t(item.labelKey),
            icon: item.icon,
            action: () => turnInto(item.commandId)
          }))
        })
        items.push({ type: 'separator' })
      }
      
      items.push({ label: t('workspace.blockMenu.duplicate'), icon: markRaw(Copy), action: duplicateBlock })
      items.push({ label: t('workspace.blockMenu.copyRef'), icon: markRaw(Link), action: copyBlockRef })
      items.push({ type: 'separator' })
    }
    
    items.push({ label: t('editor.menu.delete'), icon: markRaw(Trash2), danger: true, action: deleteNode })
    
    return items
  })

  return { ctxMenu, menuItems, openContextMenu }
}
