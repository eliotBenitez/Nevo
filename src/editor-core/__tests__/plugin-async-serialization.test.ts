import { afterEach, describe, expect, it } from 'vitest'
import { setActivePluginSerialization } from '../plugin-host/active-serialization'
import type { NevoEditorRegistries } from '../../types/editor-plugin'
import type { NoteDocument } from '../../types/note'
import { serializeNoteToMarkdownAsync } from '../../utils/noteExport/markdownSerializer'
import { serializeNoteToHtml } from '../../utils/noteExport/htmlSerializer'
import { serializeNoteToTypstAsync } from '../../utils/noteExport/typstSerializer'
import { parseMarkdownToBlockNodeAsync } from '../../utils/noteImport/markdownParser'

function registries(): NevoEditorRegistries {
  return {
    commands: new Map(),
    keymaps: [],
    slashItems: new Map(),
    workspaceViews: new Map(),
    sidebarItems: new Map(),
    modals: new Map(),
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

const note: NoteDocument = {
  id: 'note',
  title: 'Plugin',
  icon: '',
  folderId: null,
  createdAt: '',
  updatedAt: '',
  content: {
    type: 'doc',
    content: [{
      type: 'callout_block',
      attrs: { variant: 'warning' },
      content: [{
        type: 'paragraph',
        content: [{ type: 'text', text: 'Rich child' }],
      }],
    }],
  },
}

afterEach(() => setActivePluginSerialization(null))

describe('async plugin serialization pipeline', () => {
  it('awaits Worker-style serializers in Markdown, HTML and Typst', async () => {
    const active = registries()
    active.nodeSerializers.set('callout_block', {
      markdown: async (_node, helpers) => `> async ${helpers.serializeChildren()}`,
      html: async (_node, helpers) => `<aside>${helpers.serializeChildren()}</aside>`,
      typst: async (_node, helpers) => `#block[${helpers.serializeChildren()}]`,
    })
    setActivePluginSerialization(active)

    await expect(serializeNoteToMarkdownAsync(note, 'assets'))
      .resolves.toMatchObject({ markdown: expect.stringContaining('> async Rich child') })
    await expect(serializeNoteToHtml(note, 'assets'))
      .resolves.toMatchObject({ html: expect.stringContaining('<aside><p>Rich child</p></aside>') })
    await expect(serializeNoteToTypstAsync(note))
      .resolves.toMatchObject({ source: expect.stringContaining('#block[Rich child]') })
  })

  it('awaits Worker-style Markdown importers', async () => {
    const active = registries()
    active.nodeImporters.set('callout', {
      fencedLang: 'callout',
      fromFenced: async code => ({
        type: 'callout_block',
        attrs: { variant: 'info' },
        content: [{ type: 'paragraph', content: [{ type: 'text', text: code }] }],
      }),
    })
    setActivePluginSerialization(active)

    const parsed = await parseMarkdownToBlockNodeAsync('```callout\nNested\n```', 'Plugin')
    expect(parsed.content.content?.[0]).toMatchObject({
      type: 'callout_block',
      attrs: { variant: 'info' },
    })
  })

  it('preserves a JSON marker and rich children when a plugin is unavailable', async () => {
    const markdown = await serializeNoteToMarkdownAsync(note, 'assets')
    const html = await serializeNoteToHtml(note, 'assets')
    const typst = await serializeNoteToTypstAsync(note)

    expect(markdown.markdown).toContain('nevo-plugin-node:')
    expect(markdown.markdown).toContain('Rich child')
    expect(html.html).toContain('data-nevo-plugin-fallback=')
    expect(html.html).toContain('Rich child')
    expect(typst.source).toContain('// nevo-plugin-node:')
    expect(typst.source).toContain('Rich child')
  })

  it('falls back without data loss when an HTML Worker serializer fails', async () => {
    const active = registries()
    active.nodeSerializers.set('callout_block', {
      html: async () => { throw new Error('Worker unavailable') },
    })
    setActivePluginSerialization(active)

    const html = await serializeNoteToHtml(note, 'assets')
    expect(html.html).toContain('data-nevo-plugin-fallback=')
    expect(html.html).toContain('Rich child')
  })
})
