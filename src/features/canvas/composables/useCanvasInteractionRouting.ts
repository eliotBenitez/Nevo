import { computed, type Ref } from 'vue'
import type { CanvasConnector } from '../../../core/canvas'
import type { CanvasTool } from './useCanvasToolState'

interface UseCanvasInteractionRoutingOptions {
  presentationActive: Ref<boolean>
  activeTool: Ref<CanvasTool>
  onCreationPointerDown: (event: PointerEvent) => boolean
  onBackgroundPointerDown: (event: PointerEvent) => void
  onElementPointerDown: (id: string, event: PointerEvent) => void
  editItem: (id: string) => boolean
  startInlineEdit: (id: string) => void
  selectedConnector: Ref<CanvasConnector | null>
  connectorDrafts: Record<string, Partial<CanvasConnector>>
  onEndpointPointerDown: (id: string, endpoint: 'from' | 'to', event: PointerEvent) => void
}

/** Routes raw pointer/dblclick events on the canvas viewport to the active gesture composable. */
export function useCanvasInteractionRouting(options: UseCanvasInteractionRoutingOptions) {
  function handleViewportPointerDown(event: PointerEvent) {
    if (options.presentationActive.value) return
    if (options.onCreationPointerDown(event)) return
    options.onBackgroundPointerDown(event)
  }

  function handleObjectInteraction(id: string, event: PointerEvent) {
    if (options.presentationActive.value) return
    if (options.activeTool.value !== 'select') {
      options.onCreationPointerDown(event)
      return
    }
    options.onElementPointerDown(id, event)
  }

  function editCanvasItem(id: string) {
    if (options.activeTool.value !== 'select') return
    if (!options.editItem(id)) options.startInlineEdit(id)
  }

  const selectedConnectorDisplay = computed(() => {
    const connector = options.selectedConnector.value
    return connector ? { ...connector, ...options.connectorDrafts[connector.id] } : null
  })

  function moveSelectedConnectorEndpoint(endpoint: 'from' | 'to', event: PointerEvent) {
    const connector = selectedConnectorDisplay.value
    if (connector) options.onEndpointPointerDown(connector.id, endpoint, event)
  }

  return {
    handleViewportPointerDown,
    handleObjectInteraction,
    editCanvasItem,
    moveSelectedConnectorEndpoint,
    selectedConnectorDisplay,
  }
}
