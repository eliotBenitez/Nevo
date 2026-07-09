import { Plugin, PluginKey } from 'prosemirror-state'
import type { Transaction } from 'prosemirror-state'
import { Decoration, DecorationSet } from 'prosemirror-view'
import type { EditorView } from 'prosemirror-view'
import type { Node as PMNode, NodeType } from 'prosemirror-model'
import { computeTableValues, isHyperformulaLoaded, loadHyperformula } from '../tableFormula'

export const tableFormulaKey = new PluginKey<TableFormulaState>('tableFormula')

export interface TableFormulaPluginOptions {
  onRequestFormulaEdit?: (ctx: {
    view: EditorView
    cellPos: number
    formula: string
    anchorRect: DOMRect
  }) => void
}

interface TableFormulaState {
  decorations: DecorationSet
  /** Cached result of `docHasFormulaTables`, refreshed only when a table was touched. */
  hasFormulaTables: boolean
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

/**
 * Which table nodes (given as their position in `tr.doc`) could this transaction have
 * affected? Mirrors the `collectRemovedAssetSrcs` pattern in `useEditorCore.ts`: instead
 * of recomputing every table's formulas on every keystroke, we look only at the ranges
 * the transaction's steps actually touched (old-doc side, to catch edits/deletions
 * inside an existing table) and, for each step, the range right after it was applied
 * (to catch insertions/pastes that create or extend a table), then forward-map that
 * position through the remaining steps into final `tr.doc` coordinates.
 *
 * A table is reported whenever the edit landed anywhere inside its subtree — including
 * plain text edits in a non-formula cell — because formula results can reference any
 * cell in the same table (`=A1+B2`), so any change inside a table can change its values.
 * Edits elsewhere in the document (the common case) never touch any table and are
 * skipped entirely.
 */
function findTouchedTableStarts(prevDoc: PMNode, tr: Transaction, tableType: NodeType): Set<number> {
  const starts = new Set<number>()
  const recordAt = (doc: PMNode, pos: number, mapFromStepIndex: number) => {
    const clamped = Math.max(0, Math.min(pos, doc.content.size))
    const $pos = doc.resolve(clamped)
    for (let d = $pos.depth; d >= 0; d--) {
      if ($pos.node(d).type === tableType) {
        const tableStart = $pos.before(d)
        starts.add(tr.mapping.slice(mapFromStepIndex).map(tableStart))
        return
      }
    }
  }

  let doc = prevDoc
  for (let i = 0; i < tr.steps.length; i++) {
    const step = tr.steps[i]
    const stepMap = step.getMap()
    stepMap.forEach((oldStart, oldEnd) => {
      recordAt(doc, oldStart, i)
      if (oldEnd > oldStart) recordAt(doc, oldEnd, i)
    })
    const result = step.apply(doc)
    if (!result.doc) continue
    const nextDoc = result.doc
    stepMap.forEach((_oldStart, _oldEnd, newStart, newEnd) => {
      recordAt(nextDoc, newStart, i + 1)
      if (newEnd > newStart) recordAt(nextDoc, newEnd, i + 1)
    })
    doc = nextDoc
  }
  return starts
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

/** Builds decorations for a single table node. `tableNodePos` is the position
 *  immediately before the table node (as handed out by `descendants`/`nodeAt`). */
function buildTableDecorations(
  node: PMNode,
  tableNodePos: number,
  doc: PMNode,
  view: EditorView | null,
  options: TableFormulaPluginOptions,
): Decoration[] {
  const tableStart = tableNodePos + 1
  const results = computeTableValues(node, tableStart)
  const decorations: Decoration[] = []
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
  return decorations
}

function buildDecorations(doc: PMNode, view: EditorView | null, options: TableFormulaPluginOptions): DecorationSet {
  if (!isHyperformulaLoaded()) return DecorationSet.empty

  const decorations: Decoration[] = []
  doc.descendants((node, pos) => {
    if (node.type.name !== 'table') return true
    decorations.push(...buildTableDecorations(node, pos, doc, view, options))
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

  return new Plugin<TableFormulaState>({
    key: tableFormulaKey,
    state: {
      init(_, state) {
        return {
          decorations: buildDecorations(state.doc, null, options),
          hasFormulaTables: docHasFormulaTables(state.doc),
        }
      },
      apply(tr, old, oldState, newState) {
        if (tr.getMeta(tableFormulaKey)) {
          return {
            decorations: buildDecorations(newState.doc, null, options),
            hasFormulaTables: docHasFormulaTables(newState.doc),
          }
        }
        if (!tr.docChanged) {
          return { decorations: old.decorations.map(tr.mapping, newState.doc), hasFormulaTables: old.hasFormulaTables }
        }

        const tableType = newState.schema.nodes.table
        const touched = tableType ? findTouchedTableStarts(oldState.doc, tr, tableType) : new Set<number>()
        const mapped = old.decorations.map(tr.mapping, newState.doc)

        if (touched.size === 0) {
          // No table subtree was touched by this edit, so no formula result could have
          // changed — just carry the (position-mapped) decorations and cached flag over.
          return { decorations: mapped, hasFormulaTables: old.hasFormulaTables }
        }

        // A table's structure or content changed: the doc-wide "any formula table?"
        // flag can only change on edits like this one, so it's cheap to refresh here
        // and skip entirely otherwise.
        const hasFormulaTables = docHasFormulaTables(newState.doc)
        if (!isHyperformulaLoaded() || !hasFormulaTables) {
          return { decorations: DecorationSet.empty, hasFormulaTables }
        }

        let decorations = mapped
        for (const start of touched) {
          const node = newState.doc.nodeAt(start)
          if (!node || node.type !== tableType) continue
          decorations = decorations.remove(decorations.find(start, start + node.nodeSize))
          decorations = decorations.add(newState.doc, buildTableDecorations(node, start, newState.doc, null, options))
        }
        return { decorations, hasFormulaTables }
      },
    },
    view(editorView) {
      const maybeLoad = (view: EditorView) => {
        if (isHyperformulaLoaded() || loadTriggered) return
        const cached = tableFormulaKey.getState(view.state)
        const hasFormulaTables = cached ? cached.hasFormulaTables : docHasFormulaTables(view.state.doc)
        if (!hasFormulaTables) return
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
        return this.getState(state)?.decorations ?? DecorationSet.empty
      },
    },
  })
}
