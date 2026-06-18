import { Plugin, PluginKey } from 'prosemirror-state'
import { Decoration, DecorationSet } from 'prosemirror-view'
import type { EditorView } from 'prosemirror-view'
import type { Node as PMNode } from 'prosemirror-model'
import { computeTableValues, isHyperformulaLoaded, loadHyperformula } from '../tableFormula'

export const tableFormulaKey = new PluginKey('tableFormula')

export interface TableFormulaPluginOptions {
  onRequestFormulaEdit?: (ctx: {
    view: EditorView
    cellPos: number
    formula: string
    anchorRect: DOMRect
  }) => void
}

/** Cheap early-exit scan: does the document contain any table cell with a formula? */
function docHasFormulaTables(doc: PMNode): boolean {
  let found = false
  doc.descendants((node) => {
    if (found) return false
    if (node.type.name === 'table') {
      node.descendants((cell) => {
        if (found) return false
        if ((cell.type.name === 'table_cell' || cell.type.name === 'table_header')
          && typeof cell.attrs.formula === 'string' && cell.attrs.formula.trim()) {
          found = true
          return false
        }
        return true
      })
      return false
    }
    return true
  })
  return found
}

function createWidget(
  view: EditorView,
  cellPos: number,
  value: string,
  formula: string,
  options: TableFormulaPluginOptions,
): HTMLElement {
  const span = document.createElement('span')
  span.className = 'nv-formula-value'
  span.textContent = value
  span.setAttribute('contenteditable', 'false')
  span.addEventListener('mousedown', (event) => {
    event.preventDefault()
    event.stopPropagation()
    const cellDom = view.nodeDOM(cellPos)
    const anchorRect = cellDom instanceof HTMLElement
      ? cellDom.getBoundingClientRect()
      : span.getBoundingClientRect()
    options.onRequestFormulaEdit?.({ view, cellPos, formula, anchorRect })
  })
  return span
}

function buildDecorations(doc: PMNode, view: EditorView | null, options: TableFormulaPluginOptions): DecorationSet {
  if (!isHyperformulaLoaded()) return DecorationSet.empty

  const decorations: Decoration[] = []
  doc.descendants((node, pos) => {
    if (node.type.name !== 'table') return true
    const tableStart = pos + 1
    const results = computeTableValues(node, tableStart)
    for (const res of results) {
      const cell = doc.nodeAt(res.cellPos)
      if (!cell) continue
      const formula = typeof cell.attrs.formula === 'string' ? cell.attrs.formula : ''
      decorations.push(
        Decoration.node(res.cellPos, res.cellPos + cell.nodeSize, {
          class: 'nv-formula-cell',
          'data-error': res.error ? 'true' : 'false',
        }),
      )
      decorations.push(
        Decoration.widget(
          res.cellPos + 1,
          (widgetView) => createWidget(widgetView ?? (view as EditorView), res.cellPos, res.value, formula, options),
          { side: -1, ignoreSelection: true, key: `formula-${res.cellPos}-${res.value}-${res.error}` },
        ),
      )
    }
    return false
  })

  return DecorationSet.create(doc, decorations)
}

/**
 * Recomputes Excel-style table formulas and renders their results as decorations
 * over the owning cells. Only the formula text is persisted (in the cell's
 * `formula` attr); values are derived here on every relevant change. hyperformula
 * is loaded lazily the first time a formula cell appears, then a meta transaction
 * triggers a rebuild.
 */
export function createTableFormulaPlugin(options: TableFormulaPluginOptions = {}): Plugin {
  let loadTriggered = false

  return new Plugin({
    key: tableFormulaKey,
    state: {
      init(_, state) {
        return buildDecorations(state.doc, null, options)
      },
      apply(tr, old, _oldState, newState) {
        if (tr.getMeta(tableFormulaKey)) {
          return buildDecorations(newState.doc, null, options)
        }
        if (!tr.docChanged) return old.map(tr.mapping, tr.doc)
        if (!isHyperformulaLoaded()) return DecorationSet.empty
        if (!docHasFormulaTables(newState.doc)) return DecorationSet.empty
        return buildDecorations(newState.doc, null, options)
      },
    },
    view(editorView) {
      const maybeLoad = (view: EditorView) => {
        if (isHyperformulaLoaded() || loadTriggered) return
        if (!docHasFormulaTables(view.state.doc)) return
        loadTriggered = true
        void loadHyperformula().then(() => {
          if ((view as EditorView & { isDestroyed?: boolean }).isDestroyed) return
          view.dispatch(view.state.tr.setMeta(tableFormulaKey, { rebuild: true }))
        })
      }
      maybeLoad(editorView)
      return {
        update(view) {
          maybeLoad(view)
        },
      }
    },
    props: {
      decorations(state) {
        return this.getState(state)
      },
    },
  })
}
