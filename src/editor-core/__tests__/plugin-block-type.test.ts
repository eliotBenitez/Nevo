import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildPluginContext } from '../plugin-host/context'
import { setActivePluginSerialization } from '../plugin-host/active-serialization'
import { serializeNoteToMarkdown } from '../../utils/noteExport/markdownSerializer'
import { parseMarkdownToBlockNode } from '../../utils/noteImport/markdownParser'
import type {
  NevoBlockTypeConfig,
  NevoEditorCapability,
  NevoEditorRegistries,
} from '../../types/editor-plugin'
import type { NoteDocument } from '../../types/note'

function makeRegistries(): NevoEditorRegistries {
  return {
    commands: new Map(),
    keymaps: [],
    slashItems: new Map(),
    toolbarActions: new Map(),
    nodeViews: new Map(),
    decorationProviders: new Map(),
    nodes: new Map(),
    marks: new Map(),
    nodeSerializers: new Map(),
    nodeImporters: new Map(),
    nodePopovers: new Map(),
    extraPlugins: [],
  }
}

function makeContext(registries: NevoEditorRegistries, capabilities: NevoEditorCapability[] = ['editor.read', 'editor.write']) {
  return buildPluginContext(
    {
      id: 'test-plugin',
      name: 'Test Plugin',
      version: '1.0.0',
      enabled: true,
      entryPoint: 'index.js',
      apiVersion: '1.0.0',
      editorCapabilities: capabilities,
    },
    new Map(),
    registries,
    vi.fn(),
    vi.fn(() => () => {}),
    vi.fn(),
  )
}

const cardBlock: NevoBlockTypeConfig = {
  name: 'card_block',
  schema: { group: 'block', atom: true, attrs: { text: { default: '' } } },
  render: () => document.createElement('div'),
  popover: { title: 'Card', fields: [{ key: 'text', type: 'textarea' }] },
  serialize: {
    markdown: (node) => `::card ${String(node.attrs?.text ?? '')}`,
    html: (node) => `<div class="card">${String(node.attrs?.text ?? '')}</div>`,
    typst: (node) => `#card[${String(node.attrs?.text ?? '')}]`,
  },
  importer: {
    fencedLang: 'card',
    fromFenced: (code) => ({ type: 'card_block', attrs: { text: code } }),
  },
  slashItem: { id: 'card.insert', title: 'Card', defaultAttrs: { text: 'hi' } },
}

afterEach(() => {
  setActivePluginSerialization(null)
})

describe('registerBlockType', () => {
  it('populates every registry in a single call', () => {
    const registries = makeRegistries()
    makeContext(registries).registerBlockType(cardBlock)

    expect(registries.nodes.has('card_block')).toBe(true)
    expect(registries.nodeViews.has('card_block')).toBe(true)
    expect(registries.nodePopovers.has('card_block')).toBe(true)
    expect(registries.nodeSerializers.has('card_block')).toBe(true)
    expect(registries.nodeImporters.has('card')).toBe(true)
    expect(registries.slashItems.has('card.insert')).toBe(true)
  })

  it('throws on duplicate node registration', () => {
    const registries = makeRegistries()
    const ctx = makeContext(registries)
    ctx.registerBlockType(cardBlock)
    expect(() => ctx.registerBlockType(cardBlock)).toThrow(/already registered/)
  })

  it('refuses registration without editor.write capability', () => {
    const registries = makeRegistries()
    const ctx = makeContext(registries, ['editor.read'])
    expect(() => ctx.registerBlockType(cardBlock)).toThrow(/editor.write/)
  })
})

describe('plugin node serialization', () => {
  const note: NoteDocument = {
    id: 'n1',
    title: 'Doc',
    content: {
      type: 'doc',
      content: [{ type: 'card_block', attrs: { text: 'hello' } }],
    },
  } as unknown as NoteDocument

  it('uses the plugin markdown serializer when active', () => {
    const registries = makeRegistries()
    makeContext(registries).registerBlockType(cardBlock)
    setActivePluginSerialization(registries)

    const { markdown } = serializeNoteToMarkdown(note, 'assets')
    expect(markdown).toContain('::card hello')
  })

  it('drops to default behaviour without an active serializer', () => {
    const { markdown } = serializeNoteToMarkdown(note, 'assets')
    expect(markdown).not.toContain('::card')
  })

  it('imports a fenced block back into the plugin node', () => {
    const registries = makeRegistries()
    makeContext(registries).registerBlockType(cardBlock)
    setActivePluginSerialization(registries)

    const parsed = parseMarkdownToBlockNode('# Doc\n\n```card\nhello\n```\n', 'Doc')
    const block = parsed.content.content?.find((n) => n.type === 'card_block')
    expect(block).toBeTruthy()
    expect(block?.attrs?.text).toBe('hello')
  })
})
