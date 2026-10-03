import { describe, expect, it, vi } from 'vitest'
import { EditorState } from 'prosemirror-state'
import { EditorView } from 'prosemirror-view'
import { history, undo } from 'prosemirror-history'
import { nevoBaseSchema } from '../schema'
import { parseNoteContentToDoc } from '../serialization'
import type { BlockNode } from '../../types/note'
import { buildFindRegExp, computeReplacementText, findMatchesInDoc, type FindQuery } from '../search/findMatches'
import { createFindInNotePlugin, findInNotePluginKey } from '../plugins/find-in-note'
import { moveFindActive, replaceActiveMatch, replaceAllMatches, setFindQuery } from '../commands/findReplace'
import { FindMatchesClient } from '../search/findMatchesClient'
import type { FindMatchesWorkerRequest, FindMatchesWorkerResponse } from '../search/findMatchesWorker'

/** A fake `Worker` used to drive the plugin's regex path deterministically:
 *  a request only resolves once the test calls `respond`, so tests can
 *  assert on the `pending` window and on stale-result discarding without
 *  racing a real (or jsdom-fallback) worker. */
class FakeWorker {
  onmessage: ((event: MessageEvent<FindMatchesWorkerResponse>) => void) | null = null
  onerror: (() => void) | null = null
  onmessageerror: (() => void) | null = null
  posted: FindMatchesWorkerRequest[] = []
  terminate = vi.fn()

  postMessage(message: FindMatchesWorkerRequest) {
    this.posted.push(message)
  }

  respond(response: FindMatchesWorkerResponse) {
    this.onmessage?.(new MessageEvent('message', { data: response }))
  }
}

function query(text: string, overrides: Partial<FindQuery> = {}): FindQuery {
  return { text, caseSensitive: false, wholeWord: false, regex: false, ...overrides }
}

function paragraphDoc(text: string): BlockNode {
  return { type: 'doc', content: [{ type: 'paragraph', content: text ? [{ type: 'text', text }] : [] }] }
}

describe('buildFindRegExp', () => {
  it('returns a null regexp for empty text', () => {
    expect(buildFindRegExp(query('')).regexp).toBeNull()
    expect(buildFindRegExp(query('')).error).toBe(false)
  })

  it('escapes special characters in literal mode', () => {
    const { regexp } = buildFindRegExp(query('a.b*c'))
    expect(regexp!.test('a.b*c')).toBe(true)
    expect(regexp!.test('axbyc')).toBe(false)
  })

  it('flags an invalid regex source as an error', () => {
    const result = buildFindRegExp(query('(unclosed', { regex: true }))
    expect(result.error).toBe(true)
    expect(result.regexp).toBeNull()
  })

  it('wraps whole-word matches with unicode-aware boundaries', () => {
    const { regexp } = buildFindRegExp(query('cat', { wholeWord: true }))
    expect(regexp!.test('a cat sat')).toBe(true)
    regexp!.lastIndex = 0
    expect(regexp!.test('concatenate')).toBe(false)
  })
})

describe('findMatchesInDoc', () => {
  it('finds literal matches (case-insensitive by default)', () => {
    const doc = parseNoteContentToDoc(nevoBaseSchema, paragraphDoc('Cat cat CAT'))
    const { matches, error, truncated } = findMatchesInDoc(doc, query('cat'))
    expect(error).toBe(false)
    expect(truncated).toBe(false)
    expect(matches).toHaveLength(3)
  })

  it('respects case sensitivity', () => {
    const doc = parseNoteContentToDoc(nevoBaseSchema, paragraphDoc('Cat cat CAT'))
    const { matches } = findMatchesInDoc(doc, query('cat', { caseSensitive: true }))
    expect(matches).toHaveLength(1)
  })

  it('respects whole-word matching, including Cyrillic text', () => {
    const doc = parseNoteContentToDoc(nevoBaseSchema, paragraphDoc('кот и котёнок'))
    const { matches } = findMatchesInDoc(doc, query('кот', { wholeWord: true }))
    expect(matches).toHaveLength(1)
    expect(doc.textBetween(matches[0].from, matches[0].to)).toBe('кот')
  })

  it('matches a regex pattern with capture groups', () => {
    const doc = parseNoteContentToDoc(nevoBaseSchema, paragraphDoc('foo123 bar456'))
    const { matches } = findMatchesInDoc(doc, query('[a-z]+(\\d+)', { regex: true }))
    expect(matches).toHaveLength(2)
  })

  it('reports an error and no matches for an invalid regex', () => {
    const doc = parseNoteContentToDoc(nevoBaseSchema, paragraphDoc('foo'))
    const { matches, error } = findMatchesInDoc(doc, query('foo(', { regex: true }))
    expect(error).toBe(true)
    expect(matches).toHaveLength(0)
  })

  it('never matches across an inline atom (math_inline)', () => {
    const doc = nevoBaseSchema.nodes.doc.create(null, [
      nevoBaseSchema.nodes.paragraph.create(null, [
        nevoBaseSchema.text('foo'),
        nevoBaseSchema.nodes.math_inline.create({ latex: 'x^2' }),
        nevoBaseSchema.text('bar'),
      ]),
    ])
    // "foobar" never appears as contiguous text — the atom breaks the run —
    // so a search for it must find nothing even though the visible text
    // reads "foo<math>bar".
    const { matches } = findMatchesInDoc(doc, query('foobar'))
    expect(matches).toHaveLength(0)
    expect(findMatchesInDoc(doc, query('foo')).matches).toHaveLength(1)
    expect(findMatchesInDoc(doc, query('bar')).matches).toHaveLength(1)
  })

  it('computes correct positions across multiple textblocks', () => {
    const doc = parseNoteContentToDoc(nevoBaseSchema, {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'alpha needle' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'needle beta' }] },
      ],
    })
    const { matches } = findMatchesInDoc(doc, query('needle'))
    expect(matches).toHaveLength(2)
    for (const match of matches) {
      expect(doc.textBetween(match.from, match.to)).toBe('needle')
    }
  })

  it('stops at the match limit and reports truncated', () => {
    const doc = parseNoteContentToDoc(nevoBaseSchema, paragraphDoc('a'.repeat(20)))
    const { matches, truncated } = findMatchesInDoc(doc, query('a', { regex: true }), 5)
    expect(matches).toHaveLength(5)
    expect(truncated).toBe(true)
  })
})

describe('computeReplacementText', () => {
  it('returns the replacement verbatim in literal mode', () => {
    expect(computeReplacementText('Cat', query('cat'), 'Dog')).toBe('Dog')
  })

  it('resolves $1 backreferences in regex mode', () => {
    const q = query('foo(\\d+)', { regex: true })
    expect(computeReplacementText('foo123', q, 'num-$1')).toBe('num-123')
  })

  it('resolves backreferences even when wholeWord wraps the pattern', () => {
    const q = query('(\\w+)', { regex: true, wholeWord: true })
    expect(computeReplacementText('hello', q, '[$1]')).toBe('[hello]')
  })
})

function mountDoc(content: BlockNode, client?: FindMatchesClient) {
  const doc = parseNoteContentToDoc(nevoBaseSchema, content)
  const state = EditorState.create({
    schema: nevoBaseSchema,
    doc,
    plugins: [history(), createFindInNotePlugin({ client })],
  })
  const mount = document.createElement('div')
  document.body.appendChild(mount)
  const view = new EditorView(mount, {
    state,
    dispatchTransaction(tr) { view.updateState(view.state.apply(tr)) },
  })
  return { view, destroy() { view.destroy(); mount.remove() } }
}

/** Builds a plugin-testing setup backed by a `FakeWorker` so a regex
 *  request's resolution is fully under the test's control via `respond`. */
function mountDocWithFakeWorker(content: BlockNode) {
  const fakeWorkers: FakeWorker[] = []
  const client = new FindMatchesClient(() => {
    const worker = new FakeWorker()
    fakeWorkers.push(worker)
    return worker as unknown as Worker
  })
  const { view, destroy } = mountDoc(content, client)
  return {
    view,
    destroy,
    /** The most recently created fake worker (a new one only appears after
     *  a timeout tears down the previous one). */
    latestWorker: () => fakeWorkers[fakeWorkers.length - 1],
  }
}

describe('find-in-note plugin + commands', () => {
  it('decorates every match and marks the active one', () => {
    const { view, destroy } = mountDoc(paragraphDoc('cat cat cat'))
    try {
      setFindQuery(query('cat'))(view.state, view.dispatch)
      const findState = findInNotePluginKey.getState(view.state)!
      expect(findState.matches).toHaveLength(3)
      const decos = findState.decorations.find()
      expect(decos).toHaveLength(3)
      const activeDecos = decos.filter((d) => (d as unknown as { type: { attrs: { class?: string } } }).type.attrs.class?.includes('nv-find-match--active'))
      expect(activeDecos).toHaveLength(1)
    } finally {
      destroy()
    }
  })

  it('moves the active match forward and wraps around', () => {
    const { view, destroy } = mountDoc(paragraphDoc('cat cat cat'))
    try {
      setFindQuery(query('cat'))(view.state, view.dispatch)
      expect(findInNotePluginKey.getState(view.state)!.activeIndex).toBe(0)
      moveFindActive(1)(view.state, view.dispatch)
      expect(findInNotePluginKey.getState(view.state)!.activeIndex).toBe(1)
      moveFindActive(1)(view.state, view.dispatch)
      expect(findInNotePluginKey.getState(view.state)!.activeIndex).toBe(2)
      moveFindActive(1)(view.state, view.dispatch)
      expect(findInNotePluginKey.getState(view.state)!.activeIndex).toBe(0)
      moveFindActive(-1)(view.state, view.dispatch)
      expect(findInNotePluginKey.getState(view.state)!.activeIndex).toBe(2)
    } finally {
      destroy()
    }
  })

  it('recomputes matches after an unrelated document edit', () => {
    const { view, destroy } = mountDoc(paragraphDoc('cat cat'))
    try {
      setFindQuery(query('cat'))(view.state, view.dispatch)
      expect(findInNotePluginKey.getState(view.state)!.matches).toHaveLength(2)
      view.dispatch(view.state.tr.insertText('more cat ', 1))
      expect(findInNotePluginKey.getState(view.state)!.matches).toHaveLength(3)
    } finally {
      destroy()
    }
  })

  it('replaces the active match and preserves marks (bold)', () => {
    const doc: BlockNode = {
      type: 'doc',
      content: [{
        type: 'paragraph',
        content: [{ type: 'text', text: 'cat', marks: [{ type: 'strong' }] }],
      }],
    }
    const { view, destroy } = mountDoc(doc)
    try {
      setFindQuery(query('cat'))(view.state, view.dispatch)
      replaceActiveMatch('dog')(view.state, view.dispatch)
      const textNode = view.state.doc.textContent
      expect(textNode).toBe('dog')
      let hasBold = false
      view.state.doc.descendants((node) => {
        if (node.isText && node.text === 'dog') hasBold = Boolean(nevoBaseSchema.marks.strong.isInSet(node.marks))
      })
      expect(hasBold).toBe(true)
    } finally {
      destroy()
    }
  })

  it('replaces every match in a single transaction, and undo restores the original text', () => {
    const { view, destroy } = mountDoc(paragraphDoc('cat cat cat'))
    try {
      setFindQuery(query('cat'))(view.state, view.dispatch)
      const applied = replaceAllMatches('dog')(view.state, view.dispatch)
      expect(applied).toBe(true)
      expect(view.state.doc.textContent).toBe('dog dog dog')

      undo(view.state, view.dispatch)
      expect(view.state.doc.textContent).toBe('cat cat cat')
    } finally {
      destroy()
    }
  })

  it('applies $1 backreferences when replacing in regex mode, once the async match arrives', async () => {
    const { view, destroy, latestWorker } = mountDocWithFakeWorker(paragraphDoc('foo123'))
    try {
      setFindQuery(query('foo(\\d+)', { regex: true }))(view.state, view.dispatch)
      // Regex matching is async: nothing to replace yet, and no matches on
      // screen until the worker responds.
      expect(findInNotePluginKey.getState(view.state)!.pending).toBe(true)
      expect(replaceActiveMatch('num-$1')(view.state, view.dispatch)).toBe(false)

      const worker = latestWorker()
      worker.respond({ id: worker.posted[0].id, matches: [{ from: 1, to: 7 }], truncated: false, error: false })
      await Promise.resolve()
      await Promise.resolve()

      expect(findInNotePluginKey.getState(view.state)!.pending).toBe(false)
      replaceActiveMatch('num-$1')(view.state, view.dispatch)
      expect(view.state.doc.textContent).toBe('num-123')
    } finally {
      destroy()
    }
  })

  it('does not replace while the query is an invalid regex', () => {
    const { view, destroy } = mountDoc(paragraphDoc('foo'))
    try {
      setFindQuery(query('foo(', { regex: true }))(view.state, view.dispatch)
      expect(findInNotePluginKey.getState(view.state)!.error).toBe(true)
      const applied = replaceActiveMatch('bar')(view.state, view.dispatch)
      expect(applied).toBe(false)
      expect(view.state.doc.textContent).toBe('foo')
    } finally {
      destroy()
    }
  })
})

describe('find-in-note plugin: async regex path', () => {
  it('literal search stays fully synchronous (never sets pending)', () => {
    const { view, destroy } = mountDocWithFakeWorker(paragraphDoc('cat cat cat'))
    try {
      setFindQuery(query('cat'))(view.state, view.dispatch)
      const state = findInNotePluginKey.getState(view.state)!
      expect(state.pending).toBe(false)
      expect(state.matches).toHaveLength(3)
    } finally {
      destroy()
    }
  })

  it('keeps previous matches and sets pending while a regex request is in flight', async () => {
    const { view, destroy, latestWorker } = mountDocWithFakeWorker(paragraphDoc('cat cat cat'))
    try {
      // Seed with a resolved result by going through a safe regex query
      // first, so there is something to "keep" once a second query is issued.
      setFindQuery(query('cat', { regex: true }))(view.state, view.dispatch)
      const firstWorker = latestWorker()
      firstWorker.respond({ id: firstWorker.posted[0].id, matches: [{ from: 1, to: 4 }, { from: 5, to: 8 }, { from: 9, to: 12 }], truncated: false, error: false })
      await Promise.resolve()
      await Promise.resolve()
      expect(findInNotePluginKey.getState(view.state)!.matches).toHaveLength(3)

      // Changing the query fires a new request; until it resolves, the
      // previous matches (and pending: true) are what the UI sees.
      setFindQuery(query('c[a]t', { regex: true }))(view.state, view.dispatch)
      const state = findInNotePluginKey.getState(view.state)!
      expect(state.pending).toBe(true)
      expect(state.matches).toHaveLength(3)
    } finally {
      destroy()
    }
  })

  it('discards a result computed for a doc version that is no longer current', async () => {
    const { view, destroy, latestWorker } = mountDocWithFakeWorker(paragraphDoc('cat cat cat'))
    try {
      setFindQuery(query('cat', { regex: true }))(view.state, view.dispatch)
      const staleWorker = latestWorker()
      const staleRequestId = staleWorker.posted[0].id

      // The doc changes before the first request resolves: this supersedes
      // it with a new request (a new fake worker, since the client is
      // reused but requestMatches always posts against the current worker).
      view.dispatch(view.state.tr.insertText('more cat ', 1))
      expect(findInNotePluginKey.getState(view.state)!.pending).toBe(true)

      // The stale response arrives late and must be ignored.
      staleWorker.respond({ id: staleRequestId, matches: [{ from: 999, to: 1002 }], truncated: false, error: false })
      await Promise.resolve()
      await Promise.resolve()

      expect(findInNotePluginKey.getState(view.state)!.matches).not.toContainEqual({ from: 999, to: 1002 })
    } finally {
      destroy()
    }
  })

  it('surfaces a timeout as an error with reason "timeout" instead of hanging', async () => {
    vi.useFakeTimers()
    try {
      const { view, destroy, latestWorker } = mountDocWithFakeWorker(paragraphDoc('cat'))
      try {
        // A syntactically safe pattern whose fake worker simply never
        // responds — standing in for a worker whose thread is genuinely
        // stuck (the client can't tell the difference, which is the point).
        setFindQuery(query('cat', { regex: true }))(view.state, view.dispatch)
        expect(latestWorker().posted).toHaveLength(1)

        await vi.advanceTimersByTimeAsync(250)

        const state = findInNotePluginKey.getState(view.state)!
        expect(state.pending).toBe(false)
        expect(state.error).toBe(true)
        expect(state.reason).toBe('timeout')
      } finally {
        destroy()
      }
    } finally {
      vi.useRealTimers()
    }
  })
})
