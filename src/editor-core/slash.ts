import { Plugin, PluginKey } from 'prosemirror-state'
import type { EditorState, Transaction } from 'prosemirror-state'
import type { EditorView } from 'prosemirror-view'
import type { NevoSlashItem, NevoSlashMenuState } from '../types/editor-plugin'

interface SlashMetaMove {
  type: 'move'
  delta: number
}

interface SlashMetaDismiss {
  type: 'dismiss'
}

interface SlashMetaClose {
  type: 'close'
}

type SlashMeta = SlashMetaMove | SlashMetaDismiss | SlashMetaClose

interface SlashRange {
  from: number
  to: number
  query: string
}

interface InternalSlashState extends NevoSlashMenuState {
  signature: string | null
  dismissedSignature: string | null
}

export const nevoSlashPluginKey = new PluginKey<InternalSlashState>('nevo-slash-commands')

function createClosedState(): InternalSlashState {
  return {
    open: false,
    query: '',
    range: null,
    activeIndex: 0,
    itemIds: [],
    signature: null,
    dismissedSignature: null,
  }
}

function resolveSlashRange(state: EditorState): SlashRange | null {
  const { selection } = state
  if (!selection.empty) return null

  const { $from } = selection
  if (!$from.parent.isTextblock) return null

  const textBefore = $from.parent.textBetween(0, $from.parentOffset, '\0', '\0')
  const slashIndex = textBefore.lastIndexOf('/')
  if (slashIndex < 0) return null

  if (slashIndex > 0 && /\S/.test(textBefore[slashIndex - 1] ?? '')) {
    return null
  }

  const rawQuery = textBefore.slice(slashIndex + 1)
  if (/\s/.test(rawQuery)) {
    return null
  }

  const from = $from.start() + slashIndex
  const to = $from.start() + $from.parentOffset

  return {
    from,
    to,
    query: rawQuery,
  }
}

function getSlashSignature(range: SlashRange): string {
  return `${range.from}:${range.to}:${range.query}`
}

function compareSlashItems(a: NevoSlashItem, b: NevoSlashItem): number {
  if (a.category === 'text' && b.category === 'text') {
    if (a.id === 'emoji') return 1
    if (b.id === 'emoji') return -1
  }

  return a.title.localeCompare(b.title)
}

function sortSlashItems(items: NevoSlashItem[], query: string): NevoSlashItem[] {
  const normalizedQuery = query.trim().toLowerCase()
  if (!normalizedQuery) {
    return items.slice().sort(compareSlashItems)
  }

  const scored = items
    .map((item) => {
      const id = item.id.toLowerCase()
      const title = item.title.toLowerCase()
      const keywords = item.keywords?.map((keyword) => keyword.toLowerCase()) ?? []

      if (id === normalizedQuery || title === normalizedQuery || keywords.includes(normalizedQuery)) {
        return { item, score: 0 }
      }

      if (
        id.startsWith(normalizedQuery) ||
        title.startsWith(normalizedQuery) ||
        keywords.some((keyword) => keyword.startsWith(normalizedQuery))
      ) {
        return { item, score: 1 }
      }

      if (
        id.includes(normalizedQuery) ||
        title.includes(normalizedQuery) ||
        keywords.some((keyword) => keyword.includes(normalizedQuery))
      ) {
        return { item, score: 2 }
      }

      return null
    })
    .filter((entry): entry is { item: NevoSlashItem; score: number } => entry !== null)

  scored.sort((a, b) => {
    if (a.score !== b.score) return a.score - b.score
    return compareSlashItems(a.item, b.item)
  })

  return scored.map((entry) => entry.item)
}

function groupAndFlatSlashItems(items: NevoSlashItem[]): NevoSlashItem[] {
  const CATEGORY_ORDER = ['text', 'lists', 'code', 'media', 'layout']
  const map = new Map<string, NevoSlashItem[]>()
  const uncategorized: NevoSlashItem[] = []

  for (const item of items) {
    const cat = item.category ?? ''
    if (!cat) {
      uncategorized.push(item)
    } else {
      let group = map.get(cat)
      if (!group) {
        group = []
        map.set(cat, group)
      }
      group.push(item)
    }
  }

  const result: NevoSlashItem[] = []

  for (const key of CATEGORY_ORDER) {
    const groupItems = map.get(key)
    if (groupItems && groupItems.length > 0) {
      result.push(...groupItems)
      map.delete(key)
    }
  }

  for (const groupItems of map.values()) {
    if (groupItems.length > 0) {
      result.push(...groupItems)
    }
  }

  if (uncategorized.length > 0) {
    result.push(...uncategorized)
  }

  return result
}

function normalizeActiveIndex(index: number, itemCount: number): number {
  if (itemCount <= 0) return 0
  const mod = index % itemCount
  return mod < 0 ? mod + itemCount : mod
}

function buildSlashState(
  state: EditorState,
  previousState: InternalSlashState,
  getSlashItems: () => NevoSlashItem[],
  meta: SlashMeta | undefined,
): InternalSlashState {
  const resolvedRange = resolveSlashRange(state)
  if (!resolvedRange) {
    return createClosedState()
  }

  const sortedItems = groupAndFlatSlashItems(sortSlashItems(getSlashItems(), resolvedRange.query))
  const signature = getSlashSignature(resolvedRange)
  const range = { from: resolvedRange.from, to: resolvedRange.to }

  let activeIndex = previousState.signature === signature ? previousState.activeIndex : 0
  if (sortedItems.length > 0) {
    activeIndex = normalizeActiveIndex(activeIndex, sortedItems.length)
  } else {
    activeIndex = 0
  }

  let dismissedSignature = previousState.dismissedSignature
  if (dismissedSignature && dismissedSignature !== signature) {
    dismissedSignature = null
  }

  let open = sortedItems.length > 0
  if (dismissedSignature === signature) {
    open = false
  }

  if (meta?.type === 'move' && sortedItems.length > 0) {
    activeIndex = normalizeActiveIndex(activeIndex + meta.delta, sortedItems.length)
  }

  if (meta?.type === 'dismiss') {
    open = false
    dismissedSignature = signature
  }

  if (meta?.type === 'close') {
    open = false
    dismissedSignature = null
  }

  return {
    open,
    query: resolvedRange.query,
    range,
    activeIndex,
    itemIds: sortedItems.map((item) => item.id),
    signature,
    dismissedSignature,
  }
}

function getActiveSlashItem(state: InternalSlashState, items: NevoSlashItem[]): NevoSlashItem | null {
  if (!state.open || !state.itemIds.length) return null
  const itemId = state.itemIds[state.activeIndex]
  if (!itemId) return null
  return items.find((item) => item.id === itemId) ?? null
}

export function getSlashMenuState(state: EditorState): NevoSlashMenuState {
  const pluginState = nevoSlashPluginKey.getState(state)
  if (!pluginState) {
    return {
      open: false,
      query: '',
      range: null,
      activeIndex: 0,
      itemIds: [],
    }
  }

  return {
    open: pluginState.open,
    query: pluginState.query,
    range: pluginState.range,
    activeIndex: pluginState.activeIndex,
    itemIds: pluginState.itemIds,
  }
}

export function executeSlashItem(view: EditorView, item: NevoSlashItem, slashState: NevoSlashMenuState): boolean {
  if (!slashState.range) return false

  const tr = view.state.tr.delete(slashState.range.from, slashState.range.to).setMeta(nevoSlashPluginKey, {
    type: 'close',
  } satisfies SlashMeta)
  view.dispatch(tr)

  item.run({
    view,
    state: view.state,
    dispatch: view.dispatch.bind(view),
  })

  return true
}

export function dismissSlashMenu(state: EditorState): Transaction {
  return state.tr.setMeta(nevoSlashPluginKey, { type: 'dismiss' } satisfies SlashMeta)
}

export function createSlashCommandPlugin(getSlashItems: () => NevoSlashItem[]): Plugin {
  return new Plugin<InternalSlashState>({
    key: nevoSlashPluginKey,
    state: {
      init: (_, state) => buildSlashState(state, createClosedState(), getSlashItems, undefined),
      apply(transaction, previousState, _oldState, nextState) {
        const meta = transaction.getMeta(nevoSlashPluginKey) as SlashMeta | undefined
        return buildSlashState(nextState, previousState, getSlashItems, meta)
      },
    },
    props: {
      handleKeyDown(view, event) {
        const slashState = nevoSlashPluginKey.getState(view.state) ?? createClosedState()
        if (!slashState.open) return false

        if (event.key === 'ArrowDown') {
          view.dispatch(view.state.tr.setMeta(nevoSlashPluginKey, { type: 'move', delta: 1 } satisfies SlashMeta))
          event.preventDefault()
          return true
        }

        if (event.key === 'ArrowUp') {
          view.dispatch(view.state.tr.setMeta(nevoSlashPluginKey, { type: 'move', delta: -1 } satisfies SlashMeta))
          event.preventDefault()
          return true
        }

        if (event.key === 'Escape') {
          view.dispatch(view.state.tr.setMeta(nevoSlashPluginKey, { type: 'dismiss' } satisfies SlashMeta))
          event.preventDefault()
          return true
        }

        if (event.key !== 'Enter') return false

        const item = getActiveSlashItem(slashState, getSlashItems())
        if (!item) return false

        event.preventDefault()
        return executeSlashItem(view, item, slashState)
      },
    },
  })
}
