import type { Ref } from 'vue'
import type { CanvasBounds, CanvasElement, CanvasSnapshotV1 } from '../../../core/canvas'
import type { CanvasTool } from './useCanvasToolState'

interface UseCanvasSessionActionsOptions {
  snapshot: Ref<CanvasSnapshotV1>
  effectiveFrame: Ref<CanvasBounds>
  fit: (items: readonly CanvasBounds[], viewport: CanvasBounds) => void
  viewportSize: { width: number; height: number }
  viewport: Ref<HTMLDivElement | null>
  activate: (tool: CanvasTool) => void
  cancelInlineEdit: () => void
  cancelRichEdit: () => void
  selectedElement: Ref<CanvasElement | null>
  selectedIds: Ref<string[]>
  presentationStart: (frameId?: string) => void
}

/** Whole-canvas actions: fitting the viewport to content, switching tools, and entering presentation mode. */
export function useCanvasSessionActions(options: UseCanvasSessionActionsOptions) {
  function fitAll() {
    const connectorBounds = Object.values(options.snapshot.value.connectors).map(connector => ({
      x: Math.min(connector.from.x, connector.to.x),
      y: Math.min(connector.from.y, connector.to.y),
      width: Math.max(1, Math.abs(connector.to.x - connector.from.x)),
      height: Math.max(1, Math.abs(connector.to.y - connector.from.y)),
    }))
    options.fit(
      [options.effectiveFrame.value, ...Object.values(options.snapshot.value.elements), ...connectorBounds],
      { x: 0, y: 0, width: options.viewportSize.width, height: options.viewportSize.height },
    )
  }

  function activateTool(tool: CanvasTool) {
    options.cancelInlineEdit()
    options.cancelRichEdit()
    options.activate(tool)
    // Only pull focus back when it left the canvas entirely (e.g. a shortcut
    // fired while the editor had it). Clicking a toolbar button already focuses
    // a node inside the viewport, and re-focusing the viewport there makes the
    // canvas-wide `:focus-visible` ring flash on every tool switch.
    if (!options.viewport.value?.contains(document.activeElement)) options.viewport.value?.focus()
  }

  function startPresentation() {
    options.cancelInlineEdit()
    options.cancelRichEdit()
    const selectedFrameId = options.selectedElement.value?.kind === 'frame'
      ? options.selectedElement.value.id
      : undefined
    options.selectedIds.value = []
    options.presentationStart(selectedFrameId)
  }

  return { fitAll, activateTool, startPresentation }
}
