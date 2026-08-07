import { ref } from 'vue'
import type { CanvasConnector, CanvasElementStyle, CanvasShapeElement } from '../../../core/canvas'

export type CanvasTool =
  | 'select'
  | 'hand'
  | 'text'
  | 'note'
  | 'note-link'
  | 'frame'
  | 'mindmap'
  | 'rectangle'
  | 'ellipse'
  | 'diamond'
  | 'connector'
  | 'pen'
  | 'highlighter'
  | 'eraser'
  | 'image'

export interface CanvasToolStyle {
  element: CanvasElementStyle
  connector: Pick<CanvasConnector, 'color' | 'width' | 'routing' | 'startCap' | 'endCap'>
}

export function canvasToolShape(tool: CanvasTool): CanvasShapeElement['shape'] | null {
  if (tool === 'rectangle' || tool === 'ellipse' || tool === 'diamond') return tool
  return null
}

function themeTextColor(): string {
  if (typeof document === 'undefined') return '#171717'
  return getComputedStyle(document.documentElement).getPropertyValue('--text-1').trim() || '#171717'
}

export function useCanvasToolState() {
  const activeTool = ref<CanvasTool>('select')
  const style = ref<CanvasToolStyle>({
    element: {
      fill: '#8b5cf622',
      stroke: '#8b5cf6',
      strokeWidth: 2,
      opacity: 1,
      fontSize: 16,
      textColor: themeTextColor(),
      textAlign: 'center',
    },
    connector: {
      color: '#737373',
      width: 2,
      routing: 'straight',
      startCap: 'none',
      endCap: 'arrow',
    },
  })

  function activate(tool: CanvasTool) {
    activeTool.value = tool
  }

  function returnToSelect() {
    activeTool.value = 'select'
  }

  return { activeTool, style, activate, returnToSelect }
}
