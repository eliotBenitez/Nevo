import { computed, type Ref } from 'vue'
import {
  FONT_MAP,
  DRAW_TEXT_FONT,
  TEXT_LINE_HEIGHT,
} from '../../../utils/draw/drawEngine'

export interface DrawTextOverlayOptions {
  textEditor: Ref<{
    active: boolean
    editId: number
    value: string
    world: { x: number; y: number }
    size: number
    fontFamily: string
    fontSize: number
    color: string
  }>
  cameraScale: () => number
  cameraX: () => number
  cameraY: () => number
  setTextValue: (value: string) => void
  commitText: () => void
}

export function useDrawTextOverlay(options: DrawTextOverlayOptions) {
  const textEditorStyle = computed(() => {
    const t = options.textEditor.value
    const scale = options.cameraScale()
    const fontSizeScreen = t.fontSize * (scale || 1)
    // Полу-leading: приподнимаем бокс, чтобы верх глифа совпал с hanging-baseline
    const halfLeading = ((TEXT_LINE_HEIGHT - 1) / 2) * fontSizeScreen
    const fontFamilyValue = t.fontFamily && FONT_MAP[t.fontFamily]
      ? FONT_MAP[t.fontFamily]
      : DRAW_TEXT_FONT
    return {
      left: `${t.world.x * scale + options.cameraX()}px`,
      top: `${t.world.y * scale + options.cameraY() - halfLeading}px`,
      fontSize: `${fontSizeScreen}px`,
      lineHeight: String(TEXT_LINE_HEIGHT),
      color: t.color,
      fontFamily: fontFamilyValue,
    }
  })

  function onTextInput(text: string) {
    options.setTextValue(text)
  }

  function onTextBlur() {
    options.commitText()
  }

  function onTextKeydown(event: KeyboardEvent) {
    event.stopPropagation()
    if (event.key === 'Escape') {
      event.preventDefault()
      options.commitText()
    }
  }

  return {
    textEditorStyle,
    onTextInput,
    onTextBlur,
    onTextKeydown,
  }
}
