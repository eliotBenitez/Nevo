import { ref } from 'vue'
import type { Ref } from 'vue'
import {
  generateStrokeId,
  DEFAULT_STROKE_COLOR,
  DEFAULT_STROKE_SIZE,
  type DrawStroke,
} from '../../../utils/draw/drawEngine'
import { cloneStrokes } from './drawGeometry'
import type { DrawPoint } from './drawGeometry'
import type { DrawHistory } from './useDrawHistory'
import type { DrawColor } from '../useDrawEditor'

export interface TextEditorState {
  active: boolean
  world: DrawPoint
  value: string
  color: DrawColor
  size: number
  fontFamily: string
  fontSize: number
  editId: number
  editingId: string | null
}

export interface StyleForText {
  color: Ref<DrawColor>
  size: Ref<number>
  opacity: Ref<number>
  fontFamily: Ref<string>
  fontSize: Ref<number>
}

export interface DrawTextEditor {
  textEditor: Ref<TextEditorState>
  beginText(point: DrawPoint): void
  beginEditText(id: string): void
  setTextValue(value: string): void
  commitText(): void
  cancelText(): void
}

export function createDrawTextEditor(opts: {
  strokes: Ref<DrawStroke[]>
  history: DrawHistory
  style: StyleForText
}): DrawTextEditor {
  const { strokes, history, style } = opts

  // Состояние ввода текста. Активируется кликом инструментом `text`; пока
  // активно — DrawView показывает редактируемый оверлей в (world) точке `world`.
  // Коммит превращает введённый текст в обычный текстовый штрих. `editId`
  // инкрементируется при каждом открытии — DrawView по его смене заново
  // очищает и фокусирует оверлей (в т.ч. при повторном открытии без false→true).
  // `editingId` — id редактируемого существующего штриха (null для нового).
  const textEditor = ref<TextEditorState>({
    active: false,
    world: { x: 0, y: 0 },
    value: '',
    color: DEFAULT_STROKE_COLOR,
    size: DEFAULT_STROKE_SIZE,
    fontFamily: 'sans-serif',
    fontSize: 18,
    editId: 0,
    editingId: null,
  })
  let textEditSeq = 0
  // Копия оригинального штриха при редактировании существующего текста.
  // Нужна для cancelText (Esc без изменений не должен потерять текст).
  let editingOriginal: DrawStroke | null = null
  // Снимок strokes ДО начала редактирования (включает оригинальный штрих).
  // Используется в commitText для корректного undo (pushHistory не годится —
  // к тому моменту штрих уже убран из strokes).
  let editingSnapshot: DrawStroke[] | null = null

  /** Открыть оверлей ввода текста в (world) точке. Если редактор уже открыт —
   *  сначала коммитим текущий текст, затем открываем новый. */
  function beginText(point: DrawPoint) {
    if (textEditor.value.active) commitText()
    textEditSeq += 1
    editingOriginal = null
    editingSnapshot = null
    textEditor.value = {
      active: true,
      world: { x: point.x, y: point.y },
      value: '',
      color: style.color.value,
      size: style.size.value,
      fontFamily: style.fontFamily.value,
      fontSize: style.fontSize.value,
      editId: textEditSeq,
      editingId: null,
    }
  }

  /** Открыть редактор поверх существующего текстового штриха (двойной клик).
   *  Сохраняет оригинал для возможного cancelText. Убирает штрих из strokes
   *  (чтобы не было дубля под оверлеем), вернёт обратно при коммите/отмене.
   *  Снимок состояния ДО удаления штриха сохраняется для корректного undo. */
  function beginEditText(id: string) {
    const s = strokes.value.find((st) => st.id === id && st.type === 'text')
    if (!s) return
    if (textEditor.value.active) commitText()
    textEditSeq += 1
    editingOriginal = { ...s, points: s.points.map((p) => ({ ...p })) }
    // Снимок ДО удаления штриха — для корректного undo после commitText.
    editingSnapshot = cloneStrokes(strokes.value)
    // Убираем штрих из массива — оверлей его отображает вместо него.
    strokes.value = strokes.value.filter((st) => st.id !== id)
    textEditor.value = {
      active: true,
      world: { x: s.points[0].x, y: s.points[0].y },
      value: s.text ?? '',
      color: s.color,
      size: s.size,
      fontFamily: s.fontFamily ?? 'sans-serif',
      fontSize: s.fontSize ?? (s.size * 6), // 6 corresponds to TEXT_FONT_SCALE
      editId: textEditSeq,
      editingId: id,
    }
  }

  /** Синхронизация значения из оверлея (contenteditable) в стейт. */
  function setTextValue(value: string) {
    textEditor.value = { ...textEditor.value, value }
  }

  /** Зафиксировать введённый текст как штрих (если он непустой) и закрыть оверлей.
   *
   *  При редактировании существующего (editingId задан):
   *  - непустой value → обновляет существующий штрих (сохраняет id, groupId, rotation);
   *  - пустой value → удаляет штрих (приравнивается к «очистить текст»).
   *
   *  При создании нового (editingId = null): прежнее поведение (append нового штриха). */
  function commitText() {
    const t = textEditor.value
    if (!t.active) return
    const value = t.value.replace(/\s+$/, '')
    textEditor.value = { ...t, active: false, value: '', editingId: null }

    if (t.editingId !== null) {
      // Редактирование существующего текста.
      const orig = editingOriginal
      const snapshot = editingSnapshot
      editingOriginal = null
      editingSnapshot = null
      // Используем снимок ДО начала редактирования (он содержит оригинальный штрих).
      if (snapshot) history.commitHistory(snapshot)
      if (value) {
        // Обновляем штрих — сохраняем id, groupId, rotation из оригинала.
        const updated: DrawStroke = {
          ...(orig ?? {}),
          type: 'text',
          points: [{ x: t.world.x, y: t.world.y }],
          color: t.color,
          size: t.size,
          fontFamily: t.fontFamily,
          fontSize: t.fontSize,
          text: value,
          id: t.editingId,
          seed: Math.floor(Math.random() * 0x80000000),
          ...(orig?.groupId ? { groupId: orig.groupId } : {}),
          ...(orig?.rotation !== undefined ? { rotation: orig.rotation } : {}),
          ...(typeof orig?.opacity === 'number' && orig.opacity < 1 ? { opacity: orig.opacity } : {}),
        }
        strokes.value = [...strokes.value, updated]
      }
      // Пустой value при редактировании = удаление штриха (не добавляем обратно).
    } else {
      // Создание нового текстового штриха.
      if (!value) return
      history.pushHistory()
      strokes.value = [
        ...strokes.value,
        {
          type: 'text',
          points: [{ x: t.world.x, y: t.world.y }],
          color: t.color,
          size: t.size,
          fontFamily: t.fontFamily,
          fontSize: t.fontSize,
          text: value,
          seed: Math.floor(Math.random() * 0x80000000),
          id: generateStrokeId(),
          ...(style.opacity.value < 1 ? { opacity: style.opacity.value } : {}),
        },
      ]
    }
  }

  /** Закрыть оверлей без сохранения.
   *  При редактировании существующего текста — вернуть оригинальный штрих обратно. */
  function cancelText() {
    const t = textEditor.value
    if (t.editingId !== null && editingOriginal) {
      // Возвращаем оригинал без записи в историю (мы его и убирали без истории).
      strokes.value = [...strokes.value, editingOriginal]
      editingOriginal = null
      editingSnapshot = null
    }
    textEditor.value = { ...t, active: false, value: '', editingId: null }
  }

  return {
    textEditor,
    beginText,
    beginEditText,
    setTextValue,
    commitText,
    cancelText,
  }
}
