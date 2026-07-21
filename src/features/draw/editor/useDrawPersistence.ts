import {
  serializeDrawData,
  renderDrawToSvgString,
  type DrawStroke,
  type DrawCanvasSize,
  type DrawCamera,
  type DrawData,
} from '../../../utils/draw/drawEngine'
import type { Ref } from 'vue'
import type { UseDrawEditorOptions } from '../useDrawEditor'
import { sanitizeSvg } from '../../../utils/sanitizeSvg'

export interface DrawPersistence {
  save(): Promise<void>
  scheduleSave(delay?: number): void
  flushSave(): Promise<void>
}

export function createDrawPersistence(opts: {
  options: UseDrawEditorOptions
  strokes: Ref<DrawStroke[]>
  bgColor: Ref<string>
  gridType: Ref<string>
  autoDetectShapes: Ref<boolean>
  canvasSize: Ref<DrawCanvasSize>
  camera: Ref<DrawCamera>
}): DrawPersistence {
  const { options, strokes, bgColor, gridType, autoDetectShapes, canvasSize, camera } = opts

  let saveTimer: ReturnType<typeof setTimeout> | null = null
  let dirtySinceSave = false
  let saveChain: Promise<void> = Promise.resolve()

  async function doSave() {
    if (!dirtySinceSave) return
    dirtySinceSave = false
    const data: DrawData = {
      version: 1,
      strokes: strokes.value,
      bgColor: bgColor.value,
      gridType: gridType.value,
      autoDetectShapes: autoDetectShapes.value,
      canvas: { ...canvasSize.value },
      camera: { ...camera.value },
    }
    const json = serializeDrawData(data)
    const bytes = Array.from(new TextEncoder().encode(json))
    try {
      const src = await options.onSave(bytes)
      const svgPreview = sanitizeSvg(await renderDrawToSvgString(data, 24, { resolveImageHref: options.resolveImageHref }))
      options.onPersisted({ drawId: options.drawId, svgPreview, src })
    } catch (error) {
      dirtySinceSave = true
      options.onSaveError?.(error)
      throw error
    }
  }

  function save(): Promise<void> {
    saveChain = saveChain.then(doSave, doSave)
    return saveChain
  }

  function scheduleSave(delay = 600) {
    dirtySinceSave = true
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(() => { saveTimer = null; void save() }, delay)
  }

  function flushSave(): Promise<void> {
    if (saveTimer) { clearTimeout(saveTimer); saveTimer = null }
    return save().catch(() => {})
  }

  return { save, scheduleSave, flushSave }
}
