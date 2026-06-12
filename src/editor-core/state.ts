import { EditorState, Plugin, Selection, TextSelection } from 'prosemirror-state'
import { keymap } from 'prosemirror-keymap'
import { baseKeymap } from 'prosemirror-commands'
import type { Command } from 'prosemirror-state'
import { history } from 'prosemirror-history'
import { Schema, type Node as PMNode } from 'prosemirror-model'
import type { NodeViewConstructor } from 'prosemirror-view'
import { columnResizing, tableEditing } from 'prosemirror-tables'
import type { XmlFragment } from 'yjs'
import type { Awareness } from 'y-protocols/awareness'
import { ySyncPlugin, yUndoPlugin, undoCommand as yUndoCommand, redoCommand as yRedoCommand } from 'y-prosemirror'
import { safeYCursorPlugin } from './collaboration/safeCursorPlugin'
import type { BlockNode } from '../types/note'
import type { NevoSlashItem } from '../types/editor-plugin'
import { createCoreCommands, type NevoCoreCommands } from './commands'
import { createCoreKeymap } from './keymap'
import { createCoreNodeViews, type CoreNodeViewOptions } from './node-views'
import { parseNoteContentToDoc } from './serialization'
import { createSlashCommandPlugin } from './slash'
import { createLinkPickerPlugin } from './link-picker'
import { createMarkdownInputRules } from './input-rules'
import { EditorPluginHost } from './plugin-host'
import { createColumnDropPlugin } from './plugins/column-drop'
import { createBlockSelectionPlugin } from './plugins/block-selection'
import { createActiveBlockEmphasisPlugin } from './plugins/active-block-emphasis'
import { createListMarkerPlugin } from './plugins/list-markers'
import { headingFoldingPlugin } from './plugins/heading-folding'
import { createToggleFoldingPlugin } from './plugins/toggle-folding'
import { createAiStreamingPlugin } from './plugins/ai-streaming'

export interface CreateNevoEditorStateOptions {
  schema: Schema
  content: BlockNode
  pluginHost?: EditorPluginHost
  nodeViewOptions?: CoreNodeViewOptions
  enableSlashCommands?: boolean
  enableMarkdownShortcuts?: boolean
  tabBehavior?: 'indent' | 'focus'
  onTemplateInsertRequest?: () => void
  enableVega?: boolean
  enableMarkmap?: boolean
  yFragment?: XmlFragment
  awareness?: Awareness
  aiSlashItems?: NevoSlashItem[]
}

export interface NevoEditorStateSetup {
  state: EditorState
  commands: Map<string, Command>
  coreCommands: NevoCoreCommands
  slashItems: NevoSlashItem[]
  nodeViews: Record<string, NodeViewConstructor>
}

const passiveInitialBlockNames = new Set(['table', 'column_list'])

function shouldSkipInitialSelectionBlock(node: PMNode): boolean {
  return node.isAtom || node.isLeaf || passiveInitialBlockNames.has(node.type.name)
}

function findTextSelectionAtOrAfter(doc: PMNode, from: number): TextSelection | null {
  let selection: TextSelection | null = null

  doc.descendants((node, pos) => {
    if (selection) return false
    if (pos < from) return true
    if (!node.isTextblock) return true

    selection = TextSelection.create(doc, pos + 1)
    return false
  })

  return selection
}

function createInitialSelection(doc: PMNode): Selection | undefined {
  if (doc.childCount === 0) return undefined

  const firstChild = doc.child(0)
  if (!shouldSkipInitialSelectionBlock(firstChild)) return undefined

  return findTextSelectionAtOrAfter(doc, firstChild.nodeSize) ?? undefined
}

export function createCoreSlashItems(commands: Map<string, Command>): NevoSlashItem[] {
  const command = (id: string): NevoSlashItem['run'] => ({ state, dispatch }) => {
    commands.get(id)?.(state, dispatch)
  }

  return [
    { id: 'paragraph', title: 'Paragraph', category: 'text', keywords: ['text', 'p'], run: command('core.paragraph') },
    { id: 'h1', title: 'Heading 1', category: 'text', keywords: ['heading1', 'title'], run: command('core.heading.1') },
    { id: 'h2', title: 'Heading 2', category: 'text', keywords: ['heading2'], run: command('core.heading.2') },
    { id: 'h3', title: 'Heading 3', category: 'text', keywords: ['heading3'], run: command('core.heading.3') },
    { id: 'h4', title: 'Heading 4', category: 'text', keywords: ['heading4'], run: command('core.heading.4') },
    { id: 'h5', title: 'Heading 5', category: 'text', keywords: ['heading5'], run: command('core.heading.5') },
    { id: 'h6', title: 'Heading 6', category: 'text', keywords: ['heading6'], run: command('core.heading.6') },
    { id: 'emoji', title: 'Emoji', category: 'text', keywords: ['smile', 'icon', 'symbol'], run: () => {} },
    { id: 'ul', title: 'Bullet List', category: 'lists', keywords: ['list', 'unordered'], run: command('core.bulletList') },
    { id: 'ol', title: 'Ordered List', category: 'lists', keywords: ['numbered'], run: command('core.orderedList') },
    { id: 'checklist', title: 'Checklist Item', category: 'lists', keywords: ['todo', 'task', 'checkbox'], run: command('core.checklistItem') },
    { id: 'code', title: 'Code Block', category: 'code', keywords: ['codeblock', 'snippet'], run: command('core.codeBlock') },
    { id: 'math', title: 'Math Block', category: 'code', keywords: ['latex', 'formula', 'equation'], run: command('core.math.block.insert') },
    { id: 'math-inline', title: 'Inline Math', category: 'code', keywords: ['latex', 'formula'], run: command('core.math.inline.insert') },
    { id: 'image', title: 'Image', category: 'media', keywords: ['photo', 'asset', 'picture'], run: command('core.image.insert') },
    { id: 'file', title: 'File Attachment', category: 'media', keywords: ['attach', 'upload', 'pdf', 'zip', 'document'], run: command('core.file.insert') },
    { id: 'table', title: 'Table', category: 'media', keywords: ['grid', 'cells'], run: command('core.table.insert') },
    { id: 'mermaid', title: 'Mermaid Diagram', category: 'media', keywords: ['diagram', 'flowchart', 'chart', 'graph', 'sequence'], run: command('core.mermaid.insert') },
    { id: 'markmap', title: 'Mind Map', category: 'media', keywords: ['mindmap', 'markmap', 'map', 'outline', 'tree', 'brainstorm'], run: command('core.markmap.insert') },
    { id: 'chart', title: 'Chart', category: 'media', keywords: ['vega', 'vega-lite', 'chart', 'graph', 'visualization', 'plot', 'bar', 'line', 'pie'], run: command('core.vega.insert') },
    { id: 'note-embed', title: 'Note Embed', category: 'media', keywords: ['embed', 'reference', 'card', 'page'], run: command('core.noteEmbed.insert') },
    { id: 'embed', title: 'Embed', category: 'media', keywords: ['embed', 'youtube', 'video', 'figma', 'iframe', 'website', 'link'], run: command('core.embed.insert') },
    { id: 'audio', title: 'Audio', category: 'media', keywords: ['sound', 'music', 'mp3', 'ogg'], run: command('core.media.audio.insert') },
    { id: 'video', title: 'Video', category: 'media', keywords: ['film', 'mp4', 'movie', 'clip'], run: command('core.media.video.insert') },
    { id: 'quote', title: 'Quote', category: 'layout', keywords: ['blockquote'], run: command('core.blockquote') },
    { id: 'callout', title: 'Callout', category: 'layout', keywords: ['info', 'note'], run: command('core.callout') },
    { id: 'toggle', title: 'Toggle', category: 'layout', keywords: ['toggle', 'collapsible', 'fold', 'collapse', 'details', 'spoiler'], run: command('core.toggle.insert') },
    { id: 'divider', title: 'Divider', category: 'layout', keywords: ['separator', 'line', 'hr'], run: command('core.divider') },
  ]
}

function createPhysicalUndoRedoKeymap(commands: Map<string, Command>): Plugin {
  return new Plugin({
    props: {
      handleKeyDown(view, event) {
        if (event.code !== 'KeyZ' || event.altKey || !(event.ctrlKey || event.metaKey)) return false

        const command = event.shiftKey ? commands.get('core.redo') : commands.get('core.undo')
        if (!command?.(view.state, view.dispatch, view)) return false

        event.preventDefault()
        return true
      },
    },
  })
}

export function createNevoEditorState(options: CreateNevoEditorStateOptions): NevoEditorStateSetup {
  const coreCommands = createCoreCommands(options.schema)
  const commandRegistry = new Map<string, Command>(coreCommands.commands)

  const plugins: Plugin[] = options.enableMarkdownShortcuts !== false ? [createMarkdownInputRules(options.schema)] : []

  if (options.yFragment) {
    plugins.push(ySyncPlugin(options.yFragment))
    if (options.awareness) {
      plugins.push(safeYCursorPlugin(options.awareness))
    }
    plugins.push(yUndoPlugin())
    commandRegistry.set('core.undo', yUndoCommand)
    commandRegistry.set('core.redo', yRedoCommand)
  } else {
    plugins.push(history())
  }

  if (options.onTemplateInsertRequest) {
    commandRegistry.set('core.template.insert', () => {
      options.onTemplateInsertRequest?.()
      return true
    })
  }

  const host = options.pluginHost
  if (host) {
    for (const [id, command] of host.registries.commands.entries()) {
      if (!commandRegistry.has(id)) {
        commandRegistry.set(id, command)
      }
    }
  }

  const coreKeymap = createCoreKeymap(options.schema, commandRegistry, options.tabBehavior)
  plugins.push(createPhysicalUndoRedoKeymap(commandRegistry))
  plugins.push(keymap(coreKeymap))

  if (host) {
    for (const keymapEntry of host.getOrderedKeymaps()) {
      plugins.push(keymap(keymapEntry.bindings))
    }
  }

  const slashItems = createCoreSlashItems(commandRegistry)
  if (options.enableVega === false) {
    const vegaIdx = slashItems.findIndex(item => item.id === 'chart')
    if (vegaIdx !== -1) slashItems.splice(vegaIdx, 1)
  }
  if (options.enableMarkmap === false) {
    const markmapIdx = slashItems.findIndex(item => item.id === 'markmap')
    if (markmapIdx !== -1) slashItems.splice(markmapIdx, 1)
  }
  if (commandRegistry.has('core.template.insert')) {
    slashItems.push({
      id: 'insert-template',
      title: 'Insert template',
      category: 'layout',
      keywords: ['template', 'preset', 'snippet'],
      run: ({ state, dispatch }) => {
        commandRegistry.get('core.template.insert')?.(state, dispatch)
      },
    })
  }
  if (host) {
    slashItems.push(...host.listSlashItems())
    plugins.push(host.createDecorationPlugin())
    plugins.push(...host.registries.extraPlugins)
  }
  if (options.aiSlashItems?.length) {
    slashItems.push(...options.aiSlashItems)
  }

  plugins.push(columnResizing({ cellMinWidth: 80, defaultCellMinWidth: 120 }))
  plugins.push(tableEditing())
  plugins.push(createColumnDropPlugin())
  plugins.push(createBlockSelectionPlugin())
  plugins.push(createActiveBlockEmphasisPlugin())
  plugins.push(createListMarkerPlugin())
  plugins.push(createAiStreamingPlugin())
  plugins.push(headingFoldingPlugin)
  plugins.push(createToggleFoldingPlugin())
  if (options.enableSlashCommands !== false) {
    plugins.push(createSlashCommandPlugin(() => slashItems))
  }
  plugins.push(createLinkPickerPlugin())
  plugins.push(keymap(baseKeymap))

  const doc = parseNoteContentToDoc(options.schema, options.content)
  const initialSelection = createInitialSelection(doc)

  const state = EditorState.create({
    schema: options.schema,
    doc,
    plugins,
    ...(initialSelection ? { selection: initialSelection } : {}),
  })

  const nodeViews = {
    ...createCoreNodeViews(options.schema, options.nodeViewOptions),
    ...(host ? Object.fromEntries(host.registries.nodeViews.entries()) : {}),
  }

  return {
    state,
    commands: commandRegistry,
    coreCommands,
    slashItems,
    nodeViews,
  }
}
