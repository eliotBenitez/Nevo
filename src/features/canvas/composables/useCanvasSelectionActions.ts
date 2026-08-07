import { computed, type Ref } from 'vue'
import type {
  CanvasAlignment,
  CanvasConnector,
  CanvasDistribution,
  CanvasElement,
  CanvasElementStyle,
  CanvasSnapshotV1,
} from '../../../core/canvas'

interface CanvasSelectionActions {
  patchStyle: (ids: readonly string[], patch: CanvasElementStyle) => void
  updateElement: (id: string, patch: Partial<CanvasElement>) => boolean
  updateConnector: (id: string, patch: Partial<Omit<CanvasConnector, 'id'>>) => void
  setLocked: (ids: readonly string[], locked: boolean) => void
  setRotation: (ids: readonly string[], rotation: number) => void
  setGroup: (ids: readonly string[], grouped: boolean) => string
  arrange: (ids: readonly string[], direction: 'front' | 'back' | 'forward' | 'backward') => void
  align: (ids: readonly string[], alignment: CanvasAlignment) => void
  distribute: (ids: readonly string[], direction: CanvasDistribution) => void
}

export function useCanvasSelectionActions(
  snapshot: Ref<CanvasSnapshotV1>,
  selectedIds: Ref<string[]>,
  actions: CanvasSelectionActions,
) {
  const selectedElements = computed(() => selectedIds.value.flatMap((id) => {
    const element = snapshot.value.elements[id]
    return element ? [element] : []
  }))
  const selectedElement = computed(() => selectedElements.value.length === 1 ? selectedElements.value[0] : null)
  const allSelectedElementsLocked = computed(() => selectedElements.value.length > 0
    && selectedElements.value.every(element => element.locked))
  const selectedConnector = computed(() => selectedIds.value.length === 1
    ? snapshot.value.connectors[selectedIds.value[0]] ?? null
    : null)

  function patchStyle(patch: CanvasElementStyle) {
    actions.patchStyle(selectedElements.value.map(element => element.id), patch)
  }

  function setImageAlt(alt: string) {
    const element = selectedElement.value
    if (element?.kind === 'image') actions.updateElement(element.id, { alt })
  }

  return {
    selectedElements,
    selectedElement,
    allSelectedElementsLocked,
    selectedConnector,
    patchStyle,
    setImageAlt,
    setRotation: (rotation: number) => actions.setRotation(selectedElements.value.map(element => element.id), rotation),
    setLocked: (locked: boolean) => actions.setLocked(selectedElements.value.map(element => element.id), locked),
    setGroup: (grouped: boolean) => actions.setGroup(selectedElements.value.map(element => element.id), grouped),
    arrange: (direction: 'front' | 'back' | 'forward' | 'backward') => actions.arrange(selectedIds.value, direction),
    align: (alignment: CanvasAlignment) => actions.align(selectedIds.value, alignment),
    distribute: (direction: CanvasDistribution) => actions.distribute(selectedIds.value, direction),
    updateConnector: (patch: Partial<CanvasConnector>) => {
      if (selectedConnector.value) actions.updateConnector(selectedConnector.value.id, patch)
    },
  }
}
