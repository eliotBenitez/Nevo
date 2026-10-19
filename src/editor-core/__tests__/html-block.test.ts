import { describe, expect, it, vi } from 'vitest'
import { EditorState, NodeSelection } from 'prosemirror-state'
import type { Command } from 'prosemirror-state'
import { DOMParser as PMDOMParser, DOMSerializer } from 'prosemirror-model'
import type { EditorView } from 'prosemirror-view'
import { nevoBaseSchema } from '../schema'
import { createCoreCommands } from '../commands'
import { createUpdateHtmlCommand } from '../commands/html'
import { createHtmlNodeView } from '../node-views/html'
import { MAX_EMBED_SOURCE_CHARS } from '../node-views/embedLimits'
import { clampHtmlBlockHeight, HTML_BLOCK_DEFAULT_CODE } from '../schema/htmlBlock'

function runCommand(state: EditorState, command: Command): { applied: boolean; state: EditorState } {
  let nextState = state
  const applied = command(state, (tr) => { nextState = state.apply(tr) })
  return { applied, state: nextState }
}

const fakeView = { dom: document.createElement('div') } as unknown as EditorView

describe('clampHtmlBlockHeight', () => {
  it.each([
    [NaN, 240], [Infinity, 240], ['500', 240], [undefined, 240], [null, 240],
    [10, 60], [-5, 60], [5000, 2000], [300.6, 301], [60, 60], [2000, 2000],
  ])('clamps %s to %s', (input, expected) => {
    expect(clampHtmlBlockHeight(input)).toBe(expected)
  })
})

describe('html_block schema and commands', () => {
  const schema = nevoBaseSchema
  const emptyState = () => EditorState.create({ schema, doc: schema.node('doc', null, [schema.node('paragraph')]) })

  it('insert creates a selected node with defaults, replacing the empty paragraph', () => {
    const core = createCoreCommands(schema)
    const { applied, state } = runCommand(emptyState(), core.commands.get('core.html.insert')!)
    expect(applied).toBe(true)
    const sel = state.selection as NodeSelection
    expect(sel).toBeInstanceOf(NodeSelection)
    expect(sel.node.type.name).toBe('html_block')
    expect(sel.node.attrs.code).toBe(HTML_BLOCK_DEFAULT_CODE)
    expect(sel.node.attrs.height).toBe(240)
    expect(state.doc.childCount).toBe(1)
  })

  it('update changes code and clamps height', () => {
    const core = createCoreCommands(schema)
    const inserted = runCommand(emptyState(), core.commands.get('core.html.insert')!).state
    const updated = runCommand(inserted, createUpdateHtmlCommand(schema.nodes.html_block, '<b>x</b>', 99999)).state
    const node = (updated.selection as NodeSelection).node
    expect(node.attrs.code).toBe('<b>x</b>')
    expect(node.attrs.height).toBe(2000)
  })

  it('round-trips through JSON and tolerates legacy JSON without height', () => {
    const doc = schema.node('doc', null, [schema.node('html_block', { code: '<p>a</p>', height: 120 })])
    const restored = schema.nodeFromJSON(JSON.parse(JSON.stringify(doc.toJSON())))
    expect(restored.firstChild?.attrs).toMatchObject({ code: '<p>a</p>', height: 120 })

    const legacy = schema.nodeFromJSON({ type: 'doc', content: [{ type: 'html_block', attrs: { code: '<i>y</i>' } }] })
    expect(legacy.firstChild?.attrs.height).toBe(240)
  })

  it('round-trips through toDOM/parseDOM without emitting live markup', () => {
    const node = schema.nodes.html_block.create({ code: '<img src=x onerror=alert(1)>', height: 100 })
    const dom = DOMSerializer.fromSchema(schema).serializeNode(node) as HTMLElement
    expect(dom.querySelector('img')).toBeNull()
    const holder = document.createElement('div')
    holder.append(dom)
    const parsed = PMDOMParser.fromSchema(schema).parse(holder)
    expect(parsed.firstChild?.type.name).toBe('html_block')
    expect(parsed.firstChild?.attrs).toMatchObject({ code: '<img src=x onerror=alert(1)>', height: 100 })
  })
})

describe('html_block node view', () => {
  const make = (code: string, height = 200) => {
    const node = nevoBaseSchema.nodes.html_block.create({ code, height })
    return { node, view: createHtmlNodeView(node, fakeView, () => 0) }
  }

  it('renders a fully sandboxed iframe with the code only in srcdoc', () => {
    const { view } = make('<img src=x onerror=alert(1)>')
    const iframe = view.dom.querySelector('iframe')!
    expect(iframe.getAttribute('sandbox')).toBe('')
    expect(iframe.getAttribute('sandbox')).not.toContain('allow-scripts')
    expect(iframe.getAttribute('referrerpolicy')).toBe('no-referrer')
    expect(iframe.srcdoc).toContain('<img src=x onerror=alert(1)>')
    expect(iframe.style.height).toBe('200px')
    expect(view.dom.querySelector('img')).toBeNull()
  })

  it('only reloads srcdoc when the code changes and follows height', () => {
    const { node, view } = make('<p>a</p>')
    const iframe = view.dom.querySelector('iframe')!
    let writes = 0
    let value = iframe.srcdoc
    Object.defineProperty(iframe, 'srcdoc', { get: () => value, set: (v: string) => { writes++; value = v } })
    const styleReads = vi.spyOn(window, 'getComputedStyle')

    const taller = nevoBaseSchema.nodes.html_block.create({ code: '<p>a</p>', height: 400 })
    expect(view.update!(taller, [], null as never)).toBe(true)
    expect(writes).toBe(0)
    // Updates that keep the code must not force a style recalculation.
    expect(styleReads).not.toHaveBeenCalled()
    styleReads.mockRestore()
    expect(iframe.style.height).toBe('400px')

    const changed = nevoBaseSchema.nodes.html_block.create({ code: '<p>b</p>', height: 400 })
    view.update!(changed, [], null as never)
    expect(writes).toBe(1)
    expect(view.update!(nevoBaseSchema.nodes.paragraph.create(), [], null as never)).toBe(false)
    expect(node).toBeDefined()
  })

  it('re-renders srcdoc with the new text colour when the theme class changes', async () => {
    const themedView = { dom: document.createElement('div') } as unknown as EditorView
    themedView.dom.style.color = 'rgb(1, 2, 3)'
    const node = nevoBaseSchema.nodes.html_block.create({ code: '<p>x</p>' })
    const nodeView = createHtmlNodeView(node, themedView, () => 0)
    const iframe = nodeView.dom.querySelector('iframe')!
    expect(iframe.srcdoc).toContain('rgb(1, 2, 3)')
    themedView.dom.style.color = 'rgb(4, 5, 6)'
    document.documentElement.classList.add('theme-dark')
    await Promise.resolve()
    expect(iframe.srcdoc).toContain('rgb(4, 5, 6)')
    document.documentElement.classList.remove('theme-dark')
    nodeView.destroy?.()
  })

  it('shows a placeholder and no iframe for oversize code', () => {
    const { view } = make('x'.repeat(MAX_EMBED_SOURCE_CHARS + 1))
    expect(view.dom.querySelector('iframe')).toBeNull()
    expect(view.dom.querySelector('.nv-html-block-placeholder')).not.toBeNull()
  })
})
