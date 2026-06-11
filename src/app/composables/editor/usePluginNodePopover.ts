import { NodeSelection } from 'prosemirror-state'
import { nextTick, watch } from 'vue'
import type { EditorCore } from './useEditorCore'
import type { PluginNodePopoverState } from './useEditorOverlays'
import { getEditorOverlayBoundaryRect, placeEditorPopoverNearAnchor, type ClampOverlayPosition } from './editorPopoverPosition'

export function usePluginNodePopover(
  core: EditorCore,
  pluginNodePopover: PluginNodePopoverState,
  refs: {
    getPopoverEl: () => HTMLElement | null
    onFocusInput: () => void
  },
  onOverlaysUpdate: () => void,
  clampOverlayPosition: ClampOverlayPosition,
) {
  function getAnchorRect(position: number, fallbackRect?: DOMRect) {
    if (fallbackRect) return fallbackRect
    if (!core.editorView) return null

    const nodeDom = core.editorView.nodeDOM(position)
    if (nodeDom instanceof HTMLElement) return nodeDom.getBoundingClientRect()

    const fallback = core.editorView.coordsAtPos(position)
    return new DOMRect(
      fallback.left,
      fallback.top,
      Math.max(fallback.right - fallback.left, 1),
      Math.max(fallback.bottom - fallback.top, 1),
    )
  }

  function reposition(anchorRect?: DOMRect) {
    if (!pluginNodePopover.open) return
    const nodePos = pluginNodePopover.nodePos
    if (typeof nodePos !== 'number') return

    const wrapperEl = refs.getPopoverEl()
    const el = (wrapperEl?.firstElementChild as HTMLElement | null) ?? wrapperEl
    if (!el) return

    const rect = getAnchorRect(nodePos, anchorRect)
    if (!rect) return
    pluginNodePopover.position = placeEditorPopoverNearAnchor(
      el,
      rect,
      clampOverlayPosition,
      getEditorOverlayBoundaryRect(core),
    )
  }

  function openForNode(position: number, nodeName: string, anchorRect?: DOMRect) {
    if (!core.editorView) return
    const config = core.pluginHost?.registries.nodePopovers.get(nodeName)
    if (!config) return
    const node = core.editorView.state.doc.nodeAt(position)
    if (!node || node.type.name !== nodeName) return

    const attrs = { ...node.attrs }
    const values = config.read ? config.read(attrs) : attrs

    const rect = getAnchorRect(position, anchorRect)
    if (!rect) return

    pluginNodePopover.open = true
    pluginNodePopover.nodeName = nodeName
    pluginNodePopover.nodePos = position
    pluginNodePopover.title = config.title ?? nodeName
    pluginNodePopover.fields = config.fields
    pluginNodePopover.values = { ...values }
    pluginNodePopover.removable = config.removable !== false
    pluginNodePopover.position = { top: rect.bottom + 12, left: rect.left + rect.width / 2 }

    nextTick(() => {
      reposition(rect)
      refs.onFocusInput()
    })
  }

  function close() {
    pluginNodePopover.open = false
    pluginNodePopover.nodePos = null
    pluginNodePopover.nodeName = null
  }

  function setValue(key: string, value: unknown) {
    pluginNodePopover.values = { ...pluginNodePopover.values, [key]: value }
  }

  function apply() {
    if (!core.editorView) return
    const nodePos = pluginNodePopover.nodePos
    const nodeName = pluginNodePopover.nodeName
    if (typeof nodePos !== 'number' || !nodeName) return
    const node = core.editorView.state.doc.nodeAt(nodePos)
    if (!node || node.type.name !== nodeName) return

    const config = core.pluginHost?.registries.nodePopovers.get(nodeName)
    const patch = config?.apply ? config.apply(pluginNodePopover.values) : pluginNodePopover.values

    const tr = core.editorView.state.tr.setNodeMarkup(nodePos, undefined, { ...node.attrs, ...patch })
    core.editorView.dispatch(tr.setSelection(NodeSelection.create(tr.doc, nodePos)).scrollIntoView())
    close()
    core.editorView.focus()
    onOverlaysUpdate()
  }

  function remove() {
    if (!core.editorView) return
    const nodePos = pluginNodePopover.nodePos
    if (typeof nodePos !== 'number') return
    const node = core.editorView.state.doc.nodeAt(nodePos)
    if (!node) return

    core.editorView.dispatch(core.editorView.state.tr.delete(nodePos, nodePos + node.nodeSize).scrollIntoView())
    close()
    core.editorView.focus()
    onOverlaysUpdate()
  }

  function onKeyDown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.preventDefault()
      close()
      core.editorView?.focus()
      return
    }
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault()
      apply()
    }
  }

  watch(
    () => pluginNodePopover.open,
    async (open) => {
      if (!open) return
      await nextTick()
      reposition()
    },
  )

  return { openForNode, close, setValue, apply, remove, onKeyDown, reposition }
}
