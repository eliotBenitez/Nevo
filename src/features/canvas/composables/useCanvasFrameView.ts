import { computed, type Ref, type ShallowRef } from 'vue'
import {
  CANVAS_DOCUMENT_FRAME_ID,
  effectiveFrameBounds,
  type CanvasBounds,
  type CanvasSnapshotV1,
} from '../../../core/canvas'

interface UseCanvasFrameViewOptions {
  snapshot: Ref<CanvasSnapshotV1>
  framePreview: ShallowRef<Partial<CanvasBounds> | null>
  contentHeight: ShallowRef<number>
  selectedIds: Ref<string[]>
  getTitle: () => string | undefined
  t: (key: string) => string
}

/**
 * The document frame's derived view state. Deliberately free of any gesture
 * dependency: `effectiveFrame` feeds hit-testing, export and the minimap, so it
 * has to exist before the composables that consume it. The handlers that act on
 * the frame live in `useCanvasFrameEditing`, which is built afterwards.
 */
export function useCanvasFrameView(options: UseCanvasFrameViewOptions) {
  const effectiveFrame = computed(() => {
    const base = effectiveFrameBounds(options.snapshot.value.frame, options.contentHeight.value)
    return options.framePreview.value ? { ...base, ...options.framePreview.value } : base
  })
  const frameCollapsed = computed(() => options.snapshot.value.frame.collapsed === true)
  const frameTitle = computed(() => options.getTitle()?.trim() || options.t('workspace.canvas.document'))
  const frameSelected = computed(() => options.selectedIds.value.includes(CANVAS_DOCUMENT_FRAME_ID))

  return { effectiveFrame, frameCollapsed, frameTitle, frameSelected }
}
