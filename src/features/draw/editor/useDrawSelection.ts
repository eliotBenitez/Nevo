import { ref, computed } from 'vue'
import type { Ref, ComputedRef } from 'vue'
import {
  computeBounds,
  strokeBBox,
  generateStrokeId,
  translateStroke,
  reflectStroke,
  reflowBoundArrows,
  rectsIntersect,
  DEFAULT_ROUGHNESS,
  TEXT_FONT_SCALE,
  type DrawStroke,
  type DrawRect,
  type DrawFillStyle,
  type DrawStrokeStyle,
  type DrawArrowShape,
  type DrawArrowCap,
} from '../../../utils/draw/drawEngine'
import { hitTestStrokeIndex, cloneStrokes } from './drawGeometry'
import type { DrawHistory } from './useDrawHistory'

/** Маркеры ресайза вокруг bbox выделения. */
export type ResizeHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'

export interface StyleRefs {
  color: Ref<string>
  size: Ref<number>
  fillColor: Ref<string>
  fillStyle: Ref<DrawFillStyle>
  strokeStyle: Ref<DrawStrokeStyle>
  opacity: Ref<number>
  roughness: Ref<number>
  arrowShape: Ref<DrawArrowShape>
  startCap: Ref<DrawArrowCap>
  endCap: Ref<DrawArrowCap>
  fontFamily: Ref<string>
  fontSize: Ref<number>
}

export interface DrawSelection {
  selection: Ref<Set<string>>
  isSelected(id: string): boolean
  selectOnly(id: string): void
  toggleSelection(id: string): void
  clearSelection(): void
  selectInRect(rect: DrawRect, additive: boolean): void
  selectAll(): void
  groupIdOf(id: string): string | undefined
  expandByGroup(ids: Set<string>): Set<string>
  selectionBox: ComputedRef<DrawRect | null>
  selectedStrokes(): DrawStroke[]
  reflowArrows(): void
  hitTestStrokeId(point: import('./drawGeometry').DrawPoint): string | null
  deleteSelection(): void
  duplicateSelection(offset?: number): void
  copySelection(): void
  cutSelection(): void
  paste(offset?: number): void
  group(): void
  ungroup(): void
  canGroup: ComputedRef<boolean>
  canUngroup: ComputedRef<boolean>
  lockSelection(): void
  unlockSelection(): void
  hasLockedSelection: ComputedRef<boolean>
  hasUnlockedSelection: ComputedRef<boolean>
  alignSelection(mode: 'left' | 'centerH' | 'right' | 'top' | 'centerV' | 'bottom'): void
  distributeSelection(axis: 'h' | 'v'): void
  flipSelection(axis: 'h' | 'v'): void
  canAlign: ComputedRef<boolean>
  canDistribute: ComputedRef<boolean>
  applyOrder(next: DrawStroke[]): void
  bringToFront(): void
  bringForward(): void
  sendBackward(): void
  sendToBack(): void
  setStrokeColor(v: string): void
  setStrokeSize(v: number): void
  setFillColor(v: string): void
  setFillStyle(v: DrawFillStyle): void
  setStrokeStyle(v: DrawStrokeStyle): void
  setOpacity(v: number): void
  setRoughness(v: number): void
  setArrowShape(v: DrawArrowShape): void
  setStartCap(v: DrawArrowCap): void
  setEndCap(v: DrawArrowCap): void
  setFontFamily(v: string): void
  setFontSize(v: number): void
  applyStyleToSelection(patch: Partial<DrawStroke>): void
  activeStyle: ComputedRef<{
    color: string
    size: number
    fillColor: string
    fillStyle: DrawFillStyle
    strokeStyle: DrawStrokeStyle
    opacity: number
    roughness: number
    arrowShape: DrawArrowShape
    startCap: DrawArrowCap
    endCap: DrawArrowCap
    fontFamily: string
    fontSize: number
  }>
}

export function createDrawSelection(opts: {
  strokes: Ref<DrawStroke[]>
  history: DrawHistory
  style: StyleRefs
}): DrawSelection {
  const { strokes, history, style } = opts
  const { color, size, fillColor, fillStyle, strokeStyle, opacity, roughness, arrowShape, startCap, endCap, fontFamily, fontSize } = style

  const selection = ref<Set<string>>(new Set())

  const isSelected = (id: string) => selection.value.has(id)

  // --- Группировка -----------------------------------------------------------

  /** groupId штриха по его id. undefined, если штрих без группы. */
  function groupIdOf(id: string): string | undefined {
    return strokes.value.find((s) => s.id === id)?.groupId
  }

  /** Расширить набор id так, чтобы для каждого штриха с groupId добавить
   *  все остальные штрихи той же группы. Возвращает новый Set. */
  function expandByGroup(ids: Set<string>): Set<string> {
    const result = new Set(ids)
    // Собираем groupId всех id в наборе.
    const groups = new Set<string>()
    for (const id of ids) {
      const gid = groupIdOf(id)
      if (gid) groups.add(gid)
    }
    if (!groups.size) return result
    // Добавляем все штрихи с теми же groupId.
    for (const s of strokes.value) {
      if (s.id && s.groupId && groups.has(s.groupId)) {
        result.add(s.id)
      }
    }
    return result
  }

  function clearSelection() {
    if (selection.value.size) selection.value = new Set()
  }
  function selectOnly(id: string) {
    selection.value = expandByGroup(new Set([id]))
  }
  function toggleSelection(id: string) {
    const next = new Set(selection.value)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    selection.value = expandByGroup(next)
  }
  /** Выбрать штрихи, чьи bbox пересекают прямоугольник (marquee).
   *  Заблокированные штрихи исключаются из набора. Затем набор расширяется по группам. */
  function selectInRect(rect: DrawRect, additive: boolean) {
    const ids = strokes.value
      .filter((s) => s.id && !s.locked && rectsIntersect(strokeBBox(s), rect))
      .map((s) => s.id!)
    const base = additive ? new Set([...selection.value, ...ids]) : new Set(ids)
    selection.value = expandByGroup(base)
  }

  /** id верхнего штриха под точкой (или null). */
  function hitTestStrokeId(point: import('./drawGeometry').DrawPoint): string | null {
    const i = hitTestStrokeIndex(strokes.value, point)
    return i >= 0 ? strokes.value[i].id ?? null : null
  }

  function selectedStrokes(): DrawStroke[] {
    return strokes.value.filter((s) => s.id && selection.value.has(s.id))
  }

  /** Пересчитать концы привязанных стрелок после любой мутации фигур. */
  function reflowArrows() { strokes.value = reflowBoundArrows(strokes.value) }

  /** bbox выделения в world-координатах (null, если выбор пуст). */
  const selectionBox = computed<DrawRect | null>(() => {
    if (!selection.value.size) return null
    const sel = selectedStrokes()
    if (!sel.length) return null
    return computeBounds(sel)
  })

  /** Удалить выбранные незаблокированные штрихи. */
  function deleteSelection() {
    if (!selection.value.size) return
    history.pushHistory()
    // Удаляем только незаблокированные из выделения; locked остаются нетронутыми.
    strokes.value = strokes.value.filter((s) => !(s.id && selection.value.has(s.id) && !s.locked))
    selection.value = new Set()
    reflowArrows()
  }

  /** Дублировать выбранные штрихи со смещением; выделение переходит на копии. */
  function duplicateSelection(offset = 16) {
    if (!selection.value.size) return
    const sel = selectedStrokes()
    if (!sel.length) return
    history.pushHistory()
    // Сначала генерируем все новые id и строим map старый→новый.
    const idMap = new Map<string, string>()
    for (const s of sel) {
      if (s.id) idMap.set(s.id, generateStrokeId())
    }
    const ids: string[] = []
    const copies = sel.map((s) => {
      const newId = s.id ? idMap.get(s.id)! : generateStrokeId()
      ids.push(newId)
      const copy: DrawStroke = {
        ...s,
        id: newId,
        points: s.points.map((p) => ({ ...p, x: p.x + offset, y: p.y + offset })),
        seed: Math.floor(Math.random() * 0x80000000),
      }
      // Ремап привязок для стрелок: если якорь тоже в копируемом наборе — обновить id,
      // иначе убрать привязку (чтобы не указывала на оригинал).
      if (copy.type === 'arrow') {
        const { startBinding, endBinding, ...rest } = copy
        const remappedStart = startBinding
          ? (idMap.has(startBinding.strokeId) ? { ...startBinding, strokeId: idMap.get(startBinding.strokeId)! } : undefined)
          : undefined
        const remappedEnd = endBinding
          ? (idMap.has(endBinding.strokeId) ? { ...endBinding, strokeId: idMap.get(endBinding.strokeId)! } : undefined)
          : undefined
        return {
          ...rest,
          ...(remappedStart ? { startBinding: remappedStart } : {}),
          ...(remappedEnd ? { endBinding: remappedEnd } : {}),
        } as DrawStroke
      }
      return copy
    })
    strokes.value = [...strokes.value, ...copies]
    selection.value = new Set(ids)
  }

  /** Скопировать выделенные штрихи в модульный буфер обмена. */
  function copySelection() {
    history.setClipboard(cloneStrokes(selectedStrokes()))
  }

  /** Вырезать выделенные штрихи: копировать + удалить. */
  function cutSelection() {
    copySelection()
    deleteSelection()
  }

  /** Вставить из буфера обмена со смещением. Новые штрихи получают новые id/seed;
   *  выделение переходит на вставленные копии. */
  function paste(offset = 16) {
    const clipboard = history.getClipboard()
    if (!clipboard.length) return
    history.pushHistory()
    const ids: string[] = []
    const copies = clipboard.map((s) => {
      const id = generateStrokeId()
      ids.push(id)
      return {
        ...s,
        id,
        seed: Math.floor(Math.random() * 0x80000000),
        points: s.points.map((p) => ({ ...p, x: p.x + offset, y: p.y + offset })),
      }
    })
    strokes.value = [...strokes.value, ...copies]
    selection.value = new Set(ids)
  }

  /** Выделить все штрихи. */
  function selectAll() {
    selection.value = new Set(strokes.value.map((s) => s.id).filter(Boolean) as string[])
  }

  // --- Группировка ----------------------------------------------------------

  /** Сгруппировать выделенные штрихи (≥2). Присваивает им единый groupId. */
  function group() {
    const sel = selectedStrokes()
    if (sel.length < 2) return
    history.pushHistory()
    const gid = generateStrokeId()
    const ids = new Set(sel.map((s) => s.id))
    strokes.value = strokes.value.map((s) =>
      s.id && ids.has(s.id) ? { ...s, groupId: gid } : s,
    )
  }

  /** Разгруппировать выделенные штрихи (снять groupId). */
  function ungroup() {
    const sel = selectedStrokes()
    if (!sel.some((s) => s.groupId)) return
    history.pushHistory()
    const ids = new Set(sel.map((s) => s.id))
    strokes.value = strokes.value.map((s) => {
      if (!(s.id && ids.has(s.id))) return s
      const { groupId: _g, ...rest } = s
      return rest as DrawStroke
    })
  }

  /** Можно группировать, если выделено ≥2 штриха. */
  const canGroup = computed(() => selectedStrokes().length >= 2)

  /** Можно разгруппировать, если хотя бы один выделенный имеет groupId. */
  const canUngroup = computed(() => selectedStrokes().some((s) => !!s.groupId))

  // --- Блокировка -----------------------------------------------------------

  /** Заблокировать выделенные штрихи (locked=true). */
  function lockSelection() {
    if (!selection.value.size) return
    const before = cloneStrokes(strokes.value)
    let changed = false
    strokes.value = strokes.value.map((s) => {
      if (!(s.id && selection.value.has(s.id))) return s
      changed = true
      return { ...s, locked: true }
    })
    if (changed) history.commitHistory(before)
  }

  /** Разблокировать выделенные штрихи. */
  function unlockSelection() {
    if (!selection.value.size) return
    const before = cloneStrokes(strokes.value)
    let changed = false
    strokes.value = strokes.value.map((s) => {
      if (!(s.id && selection.value.has(s.id))) return s
      changed = true
      const { locked: _l, ...rest } = s
      return rest as DrawStroke
    })
    if (changed) history.commitHistory(before)
  }

  /** Есть ли в выделении хотя бы один заблокированный штрих. */
  const hasLockedSelection = computed(() => selectedStrokes().some((s) => s.locked === true))

  /** Есть ли в выделении хотя бы один незаблокированный штрих. */
  const hasUnlockedSelection = computed(() => selectedStrokes().some((s) => !s.locked))

  // --- Выравнивание / распределение / отражение ----------------------------

  /** Выровнять незаблокированные выделенные штрихи по заданной оси/стороне. */
  function alignSelection(mode: 'left' | 'centerH' | 'right' | 'top' | 'centerV' | 'bottom') {
    const targets = selectedStrokes().filter((s) => !s.locked)
    if (targets.length < 2) return
    const snapshot = cloneStrokes(strokes.value)
    const g = computeBounds(targets)
    const idMap = new Map(targets.map((s) => [s.id!, s]))
    let changed = false
    strokes.value = strokes.value.map((s) => {
      if (!s.id || !idMap.has(s.id)) return s
      const b = strokeBBox(s)
      let dx = 0
      let dy = 0
      switch (mode) {
        case 'left': dx = g.minX - b.minX; break
        case 'right': dx = g.maxX - b.maxX; break
        case 'centerH': dx = (g.minX + g.maxX) / 2 - (b.minX + b.maxX) / 2; break
        case 'top': dy = g.minY - b.minY; break
        case 'bottom': dy = g.maxY - b.maxY; break
        case 'centerV': dy = (g.minY + g.maxY) / 2 - (b.minY + b.maxY) / 2; break
      }
      if (dx === 0 && dy === 0) return s
      changed = true
      return translateStroke(s, dx, dy)
    })
    if (changed) history.commitHistory(snapshot)
    reflowArrows()
  }

  /** Равномерно распределить незаблокированные выделенные штрихи (≥3) по оси. */
  function distributeSelection(axis: 'h' | 'v') {
    const targets = selectedStrokes().filter((s) => !s.locked)
    if (targets.length < 3) return
    const snapshot = cloneStrokes(strokes.value)
    // Сортируем по центру вдоль оси.
    const sorted = targets.slice().sort((a, b) => {
      const ba = strokeBBox(a)
      const bb = strokeBBox(b)
      const ca = axis === 'h' ? (ba.minX + ba.maxX) / 2 : (ba.minY + ba.maxY) / 2
      const cb = axis === 'h' ? (bb.minX + bb.maxX) / 2 : (bb.minY + bb.maxY) / 2
      return ca - cb
    })
    const n = sorted.length
    const getCenter = (s: DrawStroke) => {
      const b = strokeBBox(s)
      return axis === 'h' ? (b.minX + b.maxX) / 2 : (b.minY + b.maxY) / 2
    }
    const firstCenter = getCenter(sorted[0])
    const lastCenter = getCenter(sorted[n - 1])
    // Словарь: id → целевой сдвиг.
    const shifts = new Map<string, { dx: number; dy: number }>()
    for (let i = 1; i < n - 1; i++) {
      const targetCenter = firstCenter + (lastCenter - firstCenter) * i / (n - 1)
      const curCenter = getCenter(sorted[i])
      const delta = targetCenter - curCenter
      shifts.set(sorted[i].id!, axis === 'h' ? { dx: delta, dy: 0 } : { dx: 0, dy: delta })
    }
    if (!shifts.size) return
    let changed = false
    strokes.value = strokes.value.map((s) => {
      if (!s.id) return s
      const d = shifts.get(s.id)
      if (!d) return s
      changed = true
      return translateStroke(s, d.dx, d.dy)
    })
    if (changed) history.commitHistory(snapshot)
    reflowArrows()
  }

  /** Отразить незаблокированные выделенные штрихи по оси. */
  function flipSelection(axis: 'h' | 'v') {
    const targets = selectedStrokes().filter((s) => !s.locked)
    if (!targets.length) return
    const snapshot = cloneStrokes(strokes.value)
    const g = computeBounds(targets)
    // Центр оси отражения.
    const center = axis === 'h' ? (g.minX + g.maxX) / 2 : (g.minY + g.maxY) / 2
    const ids = new Set(targets.map((s) => s.id))
    strokes.value = strokes.value.map((s) =>
      s.id && ids.has(s.id) ? reflectStroke(s, axis, center) : s,
    )
    history.commitHistory(snapshot)
    reflowArrows()
  }

  /** Можно выравнивать, если ≥2 незаблокированных выделенных. */
  const canAlign = computed(() => selectedStrokes().filter((s) => !s.locked).length >= 2)

  /** Можно распределить, если ≥3 незаблокированных выделенных. */
  const canDistribute = computed(() => selectedStrokes().filter((s) => !s.locked).length >= 3)

  // --- Z-order (порядок наложения) выделения --------------------------------
  const isSel = (s: DrawStroke) => !!(s.id && selection.value.has(s.id))

  /** Применить новый порядок, если он реально изменился (с записью в историю). */
  function applyOrder(next: DrawStroke[]) {
    if (next.length === strokes.value.length && next.every((s, i) => s === strokes.value[i])) return
    history.pushHistory()
    strokes.value = next
  }
  function bringToFront() {
    if (!selection.value.size) return
    applyOrder([...strokes.value.filter((s) => !isSel(s)), ...strokes.value.filter(isSel)])
  }
  function sendToBack() {
    if (!selection.value.size) return
    applyOrder([...strokes.value.filter(isSel), ...strokes.value.filter((s) => !isSel(s))])
  }
  function bringForward() {
    if (!selection.value.size) return
    const arr = strokes.value.slice()
    for (let i = arr.length - 2; i >= 0; i--) {
      if (isSel(arr[i]) && !isSel(arr[i + 1])) { [arr[i], arr[i + 1]] = [arr[i + 1], arr[i]] }
    }
    applyOrder(arr)
  }
  function sendBackward() {
    if (!selection.value.size) return
    const arr = strokes.value.slice()
    for (let i = 1; i < arr.length; i++) {
      if (isSel(arr[i]) && !isSel(arr[i - 1])) { [arr[i], arr[i - 1]] = [arr[i - 1], arr[i]] }
    }
    applyOrder(arr)
  }

  // --- Стиль выделения и сеттеры -------------------------------------------

  /**
   * Применить патч стиля к выбранным штрихам. Снимок ДО берётся перед
   * изменением, чтобы undo корректно откатывал. Ничего не делает при пустом выделении.
   */
  function applyStyleToSelection(patch: Partial<DrawStroke>) {
    if (!selection.value.size) return
    const before = cloneStrokes(strokes.value)
    let changed = false
    strokes.value = strokes.value.map((s) => {
      if (!(s.id && selection.value.has(s.id))) return s
      changed = true
      return { ...s, ...patch }
    })
    if (changed) history.commitHistory(before)
  }

  // Единые сеттеры: обновляют реф текущего стиля И применяют к выделению.
  function setStrokeColor(v: string) { color.value = v; applyStyleToSelection({ color: v }) }
  function setStrokeSize(v: number) { size.value = v; applyStyleToSelection({ size: v }) }
  function setFillColor(v: string) { fillColor.value = v; applyStyleToSelection({ fillColor: v }) }
  function setFillStyle(v: DrawFillStyle) { fillStyle.value = v; applyStyleToSelection({ fillStyle: v }) }
  function setStrokeStyle(v: DrawStrokeStyle) { strokeStyle.value = v; applyStyleToSelection({ strokeStyle: v }) }
  function setOpacity(v: number) { opacity.value = v; applyStyleToSelection({ opacity: v }) }
  function setRoughness(v: number) { roughness.value = v; applyStyleToSelection({ roughness: v }) }

  function setArrowShape(v: DrawArrowShape) {
    arrowShape.value = v
    if (!selection.value.size) return
    const before = cloneStrokes(strokes.value)
    let changed = false
    strokes.value = strokes.value.map((s) => {
      if (!(s.id && selection.value.has(s.id) && s.type === 'arrow')) return s
      changed = true
      const next: DrawStroke = { ...s, arrowShape: v }
      // При переходе в bezier у стрелки без bend — задать видимый дефолтный изгиб.
      if (v === 'bezier' && typeof next.bend !== 'number') {
        const a = next.points[0]; const b = next.points[1]
        const len = a && b ? Math.hypot(b.x - a.x, b.y - a.y) : 0
        next.bend = 0.2 * len
      }
      return next
    })
    if (changed) history.commitHistory(before)
  }

  function setStartCap(v: DrawArrowCap) { startCap.value = v; applyArrowField('startCap', v) }
  function setEndCap(v: DrawArrowCap) { endCap.value = v; applyArrowField('endCap', v) }
  function setFontFamily(v: string) { fontFamily.value = v; applyStyleToSelection({ fontFamily: v }) }
  function setFontSize(v: number) { fontSize.value = v; applyStyleToSelection({ fontSize: v }) }

  /** Применить значение поля к выделенным штрихам-стрелкам (с записью истории). */
  function applyArrowField(field: 'startCap' | 'endCap', v: DrawArrowCap) {
    if (!selection.value.size) return
    const before = cloneStrokes(strokes.value)
    let changed = false
    strokes.value = strokes.value.map((s) => {
      if (!(s.id && selection.value.has(s.id) && s.type === 'arrow')) return s
      changed = true
      return { ...s, [field]: v }
    })
    if (changed) history.commitHistory(before)
  }

  /**
   * Активный стиль для подсветки панели инструментов.
   * Если выделение непусто — берём значения из первого выделенного штриха,
   * иначе из текущих рефов.
   */
  const activeStyle = computed(() => {
    const sel = selectedStrokes()
    const base = sel[0]
    return {
      color: base?.color ?? color.value,
      size: base?.size ?? size.value,
      fillColor: base?.fillColor ?? (sel.length ? 'transparent' : fillColor.value),
      fillStyle: base?.fillStyle ?? (sel.length ? 'hachure' as DrawFillStyle : fillStyle.value),
      strokeStyle: base?.strokeStyle ?? (sel.length ? 'solid' as DrawStrokeStyle : strokeStyle.value),
      opacity: base?.opacity ?? (sel.length ? 1 : opacity.value),
      roughness: base?.roughness ?? (sel.length ? DEFAULT_ROUGHNESS : roughness.value),
      arrowShape: base?.arrowShape ?? (sel.length ? 'straight' as DrawArrowShape : arrowShape.value),
      startCap: base?.startCap ?? (base?.type === 'arrow' ? 'none' as DrawArrowCap : startCap.value),
      endCap: base?.endCap ?? (base?.type === 'arrow' ? 'arrow' as DrawArrowCap : endCap.value),
      fontFamily: base?.fontFamily ?? (sel.length ? 'sans-serif' : fontFamily.value),
      fontSize: base?.fontSize ?? (sel.length ? (base?.size ?? size.value) * TEXT_FONT_SCALE : fontSize.value),
    }
  })

  return {
    selection,
    isSelected,
    selectOnly,
    toggleSelection,
    clearSelection,
    selectInRect,
    selectAll,
    groupIdOf,
    expandByGroup,
    selectionBox,
    selectedStrokes,
    reflowArrows,
    hitTestStrokeId,
    deleteSelection,
    duplicateSelection,
    copySelection,
    cutSelection,
    paste,
    group,
    ungroup,
    canGroup,
    canUngroup,
    lockSelection,
    unlockSelection,
    hasLockedSelection,
    hasUnlockedSelection,
    alignSelection,
    distributeSelection,
    flipSelection,
    canAlign,
    canDistribute,
    applyOrder,
    bringToFront,
    bringForward,
    sendBackward,
    sendToBack,
    setStrokeColor,
    setStrokeSize,
    setFillColor,
    setFillStyle,
    setStrokeStyle,
    setOpacity,
    setRoughness,
    setArrowShape,
    setStartCap,
    setEndCap,
    setFontFamily,
    setFontSize,
    applyStyleToSelection,
    activeStyle,
  }
}

