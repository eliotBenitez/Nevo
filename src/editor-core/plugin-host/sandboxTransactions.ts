import { Fragment, Slice } from 'prosemirror-model'
import { TextSelection, type EditorState, type Transaction } from 'prosemirror-state'
import { findWrapping } from 'prosemirror-transform'
import type {
  NevoSandboxEditorSnapshot,
  NevoTransactionIntent,
  NevoTransactionOperation,
  NevoTransactionPosition,
} from '../../types/editor-plugin'

const MAX_OPERATIONS = 100
const MAX_INSERT_TEXT = 256 * 1024

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function position(
  value: NevoTransactionPosition | undefined,
  state: EditorState,
  fallback: 'from' | 'to',
): number {
  if (value === undefined) return state.selection[fallback]
  if (value === 'selection.from') return state.selection.from
  if (value === 'selection.to') return state.selection.to
  if (!Number.isSafeInteger(value) || value < 0 || value > state.doc.content.size) {
    throw new Error(`Transaction position ${String(value)} is outside the document`)
  }
  return value
}

function hasAbsolutePosition(operation: NevoTransactionOperation): boolean {
  const values: unknown[] = []
  if ('from' in operation) values.push(operation.from)
  if ('to' in operation) values.push(operation.to)
  if ('at' in operation) values.push(operation.at)
  if ('position' in operation) values.push(operation.position)
  return values.some(value => typeof value === 'number')
}

export function createEditorSnapshot(
  state: EditorState,
  revision: number,
  canRead: boolean,
  locale = globalThis.navigator?.language ?? 'en',
  timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
  now = new Date(),
): NevoSandboxEditorSnapshot {
  const { selection } = state
  return {
    revision,
    selection: {
      from: selection.from,
      to: selection.to,
      empty: selection.empty,
      anchor: selection.anchor,
      head: selection.head,
    },
    schema: {
      nodes: Object.keys(state.schema.nodes),
      marks: Object.keys(state.schema.marks),
    },
    ...(canRead ? { doc: state.doc.toJSON() as Record<string, unknown> } : {}),
    now: now.toISOString(),
    locale,
    timeZone,
  }
}

export function validateTransactionIntent(
  value: unknown,
  expectedRevision: number,
): NevoTransactionIntent {
  if (!isObject(value) || value.type !== 'transaction') {
    throw new Error('Plugin handler must return a transaction intent')
  }
  if (!Number.isSafeInteger(value.revision) || (value.revision as number) < 0) {
    throw new Error('Transaction revision is invalid')
  }
  if (!Array.isArray(value.operations) || value.operations.length > MAX_OPERATIONS) {
    throw new Error(`Transaction intent must contain at most ${MAX_OPERATIONS} operations`)
  }
  const operations = value.operations as NevoTransactionOperation[]
  for (const operation of operations) {
    if (!isObject(operation) || typeof operation.type !== 'string') {
      throw new Error('Transaction operation is invalid')
    }
    if (operation.type === 'insertText') {
      if (typeof operation.text !== 'string' || operation.text.length > MAX_INSERT_TEXT) {
        throw new Error('insertText payload is invalid')
      }
    } else if (![
      'insertNode',
      'replaceSelection',
      'setNodeAttrs',
      'addMark',
      'removeMark',
      'wrap',
      'setSelection',
    ].includes(operation.type)) {
      throw new Error(`Unsupported transaction operation ${operation.type}`)
    }
  }
  if (value.revision !== expectedRevision && operations.some(hasAbsolutePosition)) {
    const error = new Error('Absolute transaction operation targets stale editor state')
    error.name = 'STALE_EDITOR_STATE'
    throw error
  }
  return {
    type: 'transaction',
    revision: value.revision as number,
    operations,
    scrollIntoView: value.scrollIntoView === true,
  }
}

export function applyTransactionIntent(
  state: EditorState,
  intent: NevoTransactionIntent,
): Transaction {
  const tr = state.tr
  for (const operation of intent.operations) {
    const current = state.apply(tr)
    if (operation.type === 'insertText') {
      const from = position(operation.from, current, 'from')
      const to = position(operation.to, current, 'to')
      tr.insertText(operation.text, from, to)
      continue
    }
    if (operation.type === 'insertNode') {
      const nodeType = current.schema.nodes[operation.nodeType]
      if (!nodeType) throw new Error(`Unknown node type ${operation.nodeType}`)
      const node = nodeType.createAndFill(operation.attrs ?? null)
      if (!node) throw new Error(`Cannot create node ${operation.nodeType}`)
      const at = position(operation.at, current, 'from')
      tr.insert(at, node)
      continue
    }
    if (operation.type === 'replaceSelection') {
      const items = Array.isArray(operation.content) ? operation.content : [operation.content]
      const nodes = items.map(item => current.schema.nodeFromJSON(item))
      tr.replaceSelection(new Slice(Fragment.from(nodes), 0, 0))
      continue
    }
    if (operation.type === 'setNodeAttrs') {
      const at = position(operation.position, current, 'from')
      const node = current.doc.nodeAt(at)
      if (!node) throw new Error(`No node at ${at}`)
      tr.setNodeMarkup(at, undefined, { ...node.attrs, ...operation.attrs }, node.marks)
      continue
    }
    if (operation.type === 'addMark' || operation.type === 'removeMark') {
      const from = position(operation.from, current, 'from')
      const to = position(operation.to, current, 'to')
      const mark = current.schema.marks[operation.markType]
      if (!mark) throw new Error(`Unknown mark type ${operation.markType}`)
      if (operation.type === 'addMark') tr.addMark(from, to, mark.create(operation.attrs ?? null))
      else tr.removeMark(from, to, mark)
      continue
    }
    if (operation.type === 'wrap') {
      const from = position(operation.from, current, 'from')
      const to = position(operation.to, current, 'to')
      const nodeType = current.schema.nodes[operation.nodeType]
      if (!nodeType) throw new Error(`Unknown node type ${operation.nodeType}`)
      const range = current.doc.resolve(from).blockRange(current.doc.resolve(to))
      const wrapping = range ? findWrapping(range, nodeType, operation.attrs ?? null) : null
      if (!range || !wrapping) throw new Error(`Cannot wrap selection in ${operation.nodeType}`)
      tr.wrap(range, wrapping)
      continue
    }
    const from = position(operation.from, current, 'from')
    const to = operation.to === undefined ? from : position(operation.to, current, 'to')
    tr.setSelection(TextSelection.create(tr.doc, from, to))
  }
  if (intent.scrollIntoView) tr.scrollIntoView()
  return tr
}
