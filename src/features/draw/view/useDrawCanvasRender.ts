import { ref, watch, type Ref, type ShallowRef } from 'vue'
import { renderStrokesToSvgInner, type DrawStroke } from '../../../utils/draw/drawEngine'

export interface DrawCanvasRenderOptions {
  canvasEl: ShallowRef<SVGSVGElement | null>
  strokes: Ref<DrawStroke[]>
  activeStroke: Ref<DrawStroke | null> | ShallowRef<DrawStroke | null>
  scheduleSave: () => void
  resolveFullHref: (stroke: DrawStroke) => string | undefined
}

export function useDrawCanvasRender(options: DrawCanvasRenderOptions) {
  const overlaySvgInner = ref<string>('')
  // Превью маркера рисуется под committed-слоем во избежание «прыжков» по z-index при коммите.
  const highlighterPreviewInner = ref<string>('')

  // Коалесинг для предотвращения наложения параллельных асинхронных roughjs-рендеров.
  let committedRendering = false
  let committedDirty = false

  async function refreshCommittedSvg() {
    if (!options.canvasEl.value) return
    if (committedRendering) { committedDirty = true; return }
    committedRendering = true
    try {
      const inner = await renderStrokesToSvgInner(options.strokes.value, { resolveImageHref: options.resolveFullHref })
      if (options.canvasEl.value) options.canvasEl.value.innerHTML = inner
    } finally {
      committedRendering = false
      if (committedDirty) { committedDirty = false; void refreshCommittedSvg() }
    }
  }

  async function refreshActiveStrokeSvg() {
    const stroke = options.activeStroke.value
    if (!stroke) {
      overlaySvgInner.value = ''
      highlighterPreviewInner.value = ''
      return
    }
    const inner = await renderStrokesToSvgInner([stroke], { resolveImageHref: options.resolveFullHref })
    if (stroke.type === 'highlighter') {
      highlighterPreviewInner.value = inner
      overlaySvgInner.value = ''
    } else {
      overlaySvgInner.value = inner
      highlighterPreviewInner.value = ''
    }
  }

  watch(options.strokes, () => { void refreshCommittedSvg(); options.scheduleSave() })
  watch(options.activeStroke, () => { void refreshActiveStrokeSvg() })

  return {
    overlaySvgInner,
    highlighterPreviewInner,
    refreshCommittedSvg,
    refreshActiveStrokeSvg,
  }
}
