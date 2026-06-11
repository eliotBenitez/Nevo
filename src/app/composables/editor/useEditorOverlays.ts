import { reactive, nextTick, ref } from 'vue'
import type { EditorView } from 'prosemirror-view'
import { NodeSelection } from 'prosemirror-state'
import { CellSelection } from 'prosemirror-tables'
import { getSlashMenuState, getTableMenuContext, getLinkPickerState } from '../../../editor-core'
import type { NevoNodePopoverField, NevoSlashItem, NevoTableContext } from '../../../types/editor-plugin'
import type { EditorCore } from './useEditorCore'

export interface OverlayPosition {
  top: number
  left: number
}

export interface SlashOverlayState {
  open: boolean
  query: string
  activeIndex: number
  items: NevoSlashItem[]
  position: OverlayPosition
}

export interface ToolbarOverlayState {
  visible: boolean
  position: OverlayPosition
  hiddenManually: boolean
  lastSelectionRange: { from: number; to: number } | null
}

export interface TableMenuOverlayState {
  visible: boolean
  position: OverlayPosition
  context: NevoTableContext | null
}

export interface LinkPopoverState {
  open: boolean
  href: string
  editing: boolean
  error: string
  position: OverlayPosition
}

export interface MathPopoverState {
  open: boolean
  latex: string
  isInline: boolean
  position: OverlayPosition
  nodePos: number | null
}

export interface MermaidPopoverState {
  open: boolean
  code: string
  position: OverlayPosition
  nodePos: number | null
}

export interface MarkmapPopoverState {
  open: boolean
  markdown: string
  position: OverlayPosition
  nodePos: number | null
}

export interface VegaPopoverState {
  open: boolean
  spec: string
  position: OverlayPosition
  nodePos: number | null
}

export interface PluginNodePopoverState {
  open: boolean
  nodeName: string | null
  title: string
  fields: NevoNodePopoverField[]
  values: Record<string, unknown>
  removable: boolean
  position: OverlayPosition
  nodePos: number | null
}

export interface ColorPickerState {
  open: boolean
  position: OverlayPosition
}

export interface LinkPickerOverlayState {
  open: boolean
  query: string
  activeIndex: number
  position: OverlayPosition
}

export interface OverlayElementRefs {
  getSlashMenuEl: () => HTMLElement | null
  getToolbarEl: () => HTMLElement | null
  getTableMenuEl: () => HTMLElement | null
  getLinkPickerEl: () => HTMLElement | null
}

function firstChildEl(el: HTMLElement | null): HTMLElement | null {
  if (!el) return null
  return (el.firstElementChild as HTMLElement | null) ?? el
}

export function useEditorOverlays(
  core: EditorCore,
  elRefs: OverlayElementRefs,
) {
  const slashOverlay = reactive<SlashOverlayState>({
    open: false,
    query: '',
    activeIndex: 0,
    items: [],
    position: { top: 0, left: 0 },
  })

  const toolbarOverlay = reactive<ToolbarOverlayState>({
    visible: false,
    position: { top: 0, left: 0 },
    hiddenManually: false,
    lastSelectionRange: null,
  })

  const tableMenuOverlay = reactive<TableMenuOverlayState>({
    visible: false,
    context: null,
    position: { top: 0, left: 0 },
  })

  const linkPopover = reactive<LinkPopoverState>({
    open: false,
    href: '',
    editing: false,
    error: '',
    position: { top: 0, left: 0 },
  })

  const highlightPicker = reactive<ColorPickerState>({ open: false, position: { top: 0, left: 0 } })
  const textColorPicker = reactive<ColorPickerState>({ open: false, position: { top: 0, left: 0 } })

  const mathPopover = reactive<MathPopoverState>({
    open: false,
    latex: '',
    isInline: true,
    position: { top: 0, left: 0 },
    nodePos: null,
  })

  const mermaidPopover = reactive<MermaidPopoverState>({
    open: false,
    code: '',
    position: { top: 0, left: 0 },
    nodePos: null,
  })

  const markmapPopover = reactive<MarkmapPopoverState>({
    open: false,
    markdown: '',
    position: { top: 0, left: 0 },
    nodePos: null,
  })

  const vegaPopover = reactive<VegaPopoverState>({
    open: false,
    spec: '',
    position: { top: 0, left: 0 },
    nodePos: null,
  })

  const pluginNodePopover = reactive<PluginNodePopoverState>({
    open: false,
    nodeName: null,
    title: '',
    fields: [],
    values: {},
    removable: true,
    position: { top: 0, left: 0 },
    nodePos: null,
  })

  const linkPickerOverlay = reactive<LinkPickerOverlayState>({
    open: false,
    query: '',
    activeIndex: 0,
    position: { top: 0, left: 0 },
  })

  const activeMarkNames = ref<Set<string>>(new Set())

  function clampOverlayPosition(
    position: OverlayPosition,
    el: HTMLElement,
    margin = 12,
    boundaryRect?: DOMRect,
  ): OverlayPosition {
    const bounds = boundaryRect ?? new DOMRect(0, 0, window.innerWidth, window.innerHeight)
    const minLeft = bounds.left + margin
    const maxRight = bounds.right - margin
    const minTop = bounds.top + margin
    const maxBottom = bounds.bottom - margin
    const rect = el.getBoundingClientRect()
    let nextTop = position.top
    let nextLeft = position.left

    if (rect.width > maxRight - minLeft) {
      nextLeft += minLeft - rect.left
    } else if (rect.left < minLeft) {
      nextLeft += minLeft - rect.left
    } else if (rect.right > maxRight) {
      nextLeft -= rect.right - maxRight
    }

    if (rect.height > maxBottom - minTop) {
      nextTop += minTop - rect.top
    } else if (rect.top < minTop) {
      nextTop += minTop - rect.top
    } else if (rect.bottom > maxBottom) {
      nextTop -= rect.bottom - maxBottom
    }

    return { top: nextTop, left: nextLeft }
  }

  function closeOverlays() {
    slashOverlay.open = false
    slashOverlay.items = []
    toolbarOverlay.visible = false
    toolbarOverlay.hiddenManually = false
    toolbarOverlay.lastSelectionRange = null
    tableMenuOverlay.visible = false
    tableMenuOverlay.context = null
    linkPopover.open = false
    linkPopover.error = ''
    mathPopover.open = false
    mathPopover.nodePos = null
    mermaidPopover.open = false
    mermaidPopover.nodePos = null
    markmapPopover.open = false
    markmapPopover.nodePos = null
    vegaPopover.open = false
    vegaPopover.nodePos = null
    pluginNodePopover.open = false
    pluginNodePopover.nodePos = null
    pluginNodePopover.nodeName = null
    highlightPicker.open = false
    textColorPicker.open = false
    linkPickerOverlay.open = false
    activeMarkNames.value = new Set()
  }

  function hideToolbarManually() {
    toolbarOverlay.visible = false
    toolbarOverlay.hiddenManually = true
  }

  function syncSlashActiveItemVisibility() {
    const el = firstChildEl(elRefs.getSlashMenuEl())
    if (!el) return
    const activeItem = el.querySelector<HTMLButtonElement>('.slash-menu__item.is-active')
    activeItem?.scrollIntoView({ block: 'nearest' })
  }

  function updateSlashOverlay(view: EditorView) {
    const slashState = getSlashMenuState(view.state)
    core.lastSlashPluginState = slashState

    if (!slashState.open || !slashState.range) {
      slashOverlay.open = false
      slashOverlay.items = []
      return
    }

    const items = slashState.itemIds
      .map((id) => core.slashItems.find((item) => item.id === id) ?? null)
      .filter((item): item is NevoSlashItem => item !== null)

    if (items.length === 0) {
      slashOverlay.open = false
      slashOverlay.items = []
      return
    }

    const anchor = view.coordsAtPos(slashState.range.from)
    slashOverlay.open = true
    slashOverlay.query = slashState.query
    slashOverlay.activeIndex = Math.max(0, Math.min(slashState.activeIndex, items.length - 1))
    slashOverlay.items = items
    slashOverlay.position = { top: anchor.bottom + 10, left: anchor.left }

    nextTick(() => {
      const slashEl = firstChildEl(elRefs.getSlashMenuEl())
      if (!slashOverlay.open || !slashEl) return
      const next = clampOverlayPosition(slashOverlay.position, slashEl)
      if (next.top !== slashOverlay.position.top || next.left !== slashOverlay.position.left) {
        slashOverlay.position = next
      }
      syncSlashActiveItemVisibility()
    })
  }

  function updateActiveMarks(view: EditorView) {
    const markNames = ['strong', 'em', 'strike', 'underline', 'code', 'link', 'superscript', 'subscript', 'highlight', 'text_color']
    const { selection, storedMarks } = view.state
    const next = new Set<string>()
    for (const name of markNames) {
      const markType = view.state.schema.marks[name]
      if (!markType) continue
      if (selection.empty) {
        const activeMarks = storedMarks ?? selection.$from.marks()
        if (markType.isInSet(activeMarks) !== null) next.add(name)
      } else {
        if (view.state.doc.rangeHasMark(selection.from, selection.to, markType)) next.add(name)
      }
    }
    activeMarkNames.value = next
  }

  function updateToolbarOverlay(view: EditorView) {
    const { selection } = view.state
    const { from, to } = selection

    if (selection.empty || selection instanceof NodeSelection || selection instanceof CellSelection) {
      toolbarOverlay.visible = false
      toolbarOverlay.hiddenManually = false
      toolbarOverlay.lastSelectionRange = null
      return
    }

    if (toolbarOverlay.lastSelectionRange && (toolbarOverlay.lastSelectionRange.from !== from || toolbarOverlay.lastSelectionRange.to !== to)) {
      toolbarOverlay.hiddenManually = false
    }
    toolbarOverlay.lastSelectionRange = { from, to }

    if (toolbarOverlay.hiddenManually) {
      toolbarOverlay.visible = false
      return
    }

    const start = view.coordsAtPos(selection.from)
    const end = view.coordsAtPos(selection.to)
    toolbarOverlay.visible = true
    toolbarOverlay.position = {
      top: Math.min(start.top, end.top) - 10,
      left: (start.left + end.right) / 2,
    }
    nextTick(() => {
      const toolbarEl = firstChildEl(elRefs.getToolbarEl())
      if (!toolbarOverlay.visible || !toolbarEl) return
      const next = clampOverlayPosition(toolbarOverlay.position, toolbarEl)
      if (next.top !== toolbarOverlay.position.top || next.left !== toolbarOverlay.position.left) {
        toolbarOverlay.position = next
      }
    })
  }

  function updateTableMenuOverlay(view: EditorView) {
    const context = getTableMenuContext(view.state)
    if (!context) {
      tableMenuOverlay.visible = false
      tableMenuOverlay.context = null
      return
    }
    const anchorPos = context.activeCell?.pos ?? view.state.selection.from
    const anchor = view.coordsAtPos(anchorPos)
    tableMenuOverlay.visible = true
    tableMenuOverlay.context = context
    tableMenuOverlay.position = { top: anchor.top - 10, left: anchor.left }
    nextTick(() => {
      const tableMenuEl = firstChildEl(elRefs.getTableMenuEl())
      if (!tableMenuOverlay.visible || !tableMenuEl) return
      const next = clampOverlayPosition(tableMenuOverlay.position, tableMenuEl)
      if (next.top !== tableMenuOverlay.position.top || next.left !== tableMenuOverlay.position.left) {
        tableMenuOverlay.position = next
      }
    })
  }

  function updateLinkPickerOverlay(view: EditorView) {
    const pickerState = getLinkPickerState(view.state)
    if (!pickerState.open || !pickerState.range) {
      linkPickerOverlay.open = false
      return
    }

    const anchor = view.coordsAtPos(pickerState.range.from)
    linkPickerOverlay.open = true
    linkPickerOverlay.query = pickerState.query
    linkPickerOverlay.activeIndex = pickerState.activeIndex
    linkPickerOverlay.position = { top: anchor.bottom + 10, left: anchor.left }

    nextTick(() => {
      const el = firstChildEl(elRefs.getLinkPickerEl())
      if (!linkPickerOverlay.open || !el) return
      const next = clampOverlayPosition(linkPickerOverlay.position, el)
      if (next.top !== linkPickerOverlay.position.top || next.left !== linkPickerOverlay.position.left) {
        linkPickerOverlay.position = next
      }
    })
  }

  function updateOverlays() {
    if (!core.editorView) {
      closeOverlays()
      return
    }
    updateSlashOverlay(core.editorView)
    updateToolbarOverlay(core.editorView)
    updateTableMenuOverlay(core.editorView)
    updateLinkPickerOverlay(core.editorView)
    updateActiveMarks(core.editorView)
    if (!toolbarOverlay.visible) {
      linkPopover.open = false
    }
  }

  return {
    slashOverlay,
    toolbarOverlay,
    tableMenuOverlay,
    linkPopover,
    highlightPicker,
    textColorPicker,
    mathPopover,
    mermaidPopover,
    markmapPopover,
    vegaPopover,
    pluginNodePopover,
    linkPickerOverlay,
    activeMarkNames,
    updateOverlays,
    closeOverlays,
    hideToolbarManually,
    clampOverlayPosition,
  }
}
