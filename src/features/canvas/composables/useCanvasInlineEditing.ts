import { computed, shallowRef, type CSSProperties, type Ref } from 'vue'
import { canvasFontStack, connectorMidpoint, type CanvasCamera, type CanvasSnapshotV1 } from '../../../core/canvas'

interface UseCanvasInlineEditingOptions {
  snapshot: Ref<CanvasSnapshotV1>
  camera: CanvasCamera
  setText: (id: string, text: string) => void
}

export function useCanvasInlineEditing(options: UseCanvasInlineEditingOptions) {
  const editingId = shallowRef('')
  const editingValue = computed(() => {
    const element = options.snapshot.value.elements[editingId.value]
    if (element?.kind === 'text' || element?.kind === 'shape') return element.text ?? ''
    return options.snapshot.value.connectors[editingId.value]?.label ?? ''
  })
  const editingStyle = computed<CSSProperties>(() => {
    const element = options.snapshot.value.elements[editingId.value]
    const connector = options.snapshot.value.connectors[editingId.value]
    const bounds = element ?? (connector
      ? { ...connectorMidpoint(connector.from, connector.to), width: 220, height: 48 }
      : null)
    if (!bounds) return { display: 'none' }
    const x = connector ? bounds.x - bounds.width / 2 : bounds.x
    const y = connector ? bounds.y - bounds.height / 2 : bounds.y
    return {
      left: `${(x - options.camera.x) * options.camera.zoom}px`,
      top: `${(y - options.camera.y) * options.camera.zoom}px`,
      width: `${bounds.width * options.camera.zoom}px`,
      height: `${bounds.height * options.camera.zoom}px`,
      fontSize: `${(element?.style?.fontSize ?? 16) * options.camera.zoom}px`,
      fontFamily: canvasFontStack(element?.style?.fontFamily),
      color: element?.style?.textColor ?? undefined,
      textAlign: element?.style?.textAlign ?? 'center',
      padding: `${Math.max(6, 8 * options.camera.zoom)}px`,
    }
  })

  function start(id: string) {
    const element = options.snapshot.value.elements[id]
    if (element && element.kind !== 'text' && element.kind !== 'shape') return
    editingId.value = id
  }

  function commit(value: string) {
    if (editingId.value) options.setText(editingId.value, value)
    editingId.value = ''
  }

  function cancel() {
    editingId.value = ''
  }

  return { editingId, editingValue, editingStyle, start, commit, cancel }
}
