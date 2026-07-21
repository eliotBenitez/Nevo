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
import { createSlashCommandPlugin, prepareListItemForBlockSlash } from './slash'
import { createLinkPickerPlugin } from './link-picker'
import { createMarkdownInputRules } from './input-rules'
import { EditorPluginHost } from './plugin-host'
import { createColumnDropPlugin } from './plugins/column-drop'
import { createBlockSelectionPlugin } from './plugins/block-selection'
import { createActiveBlockEmphasisPlugin } from './plugins/active-block-emphasis'
import { createListMarkerPlugin } from './plugins/list-markers'
import { headingFoldingPlugin } from './plugins/heading-folding'
import { createToggleFoldingPlugin } from './plugins/toggle-folding'
import { createTableFormulaPlugin } from './plugins/table-formula'
import { createAiStreamingPlugin } from './plugins/ai-streaming'
import { createBrokenLinkDecorationPlugin } from './plugins/broken-link-decoration'

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
  enableDraw?: boolean
  yFragment?: XmlFragment
  awareness?: Awareness
  aiSlashItems?: NevoSlashItem[]
  /** Existence check for `internal_link` marks; when provided, links pointing
   *  at non-existent notes are decorated with the `.is-broken` class. */
  internalLinkExists?: (noteId: string) => boolean
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

  const listBlockCommand = (id: string): Pick<NevoSlashItem, 'run' | 'runInList'> => {
    const run = command(id)
    return {
      run,
      runInList: ({ view, state, dispatch, list }) => {
        const preparation = prepareListItemForBlockSlash(state, list)
        if (!preparation) {
          run({ view, state, dispatch })
          return
        }

        dispatch(preparation)
        run({
          view,
          state: view.state,
          dispatch: view.dispatch.bind(view),
        })
      },
    }
  }

  return [
    { id: 'paragraph', title: 'Paragraph', category: 'text', keywords: ['text', 'p'], run: command('core.paragraph') },
    { id: 'h1', title: 'Heading 1', category: 'text', keywords: ['heading1', 'title'], ...listBlockCommand('core.heading.1') },
    { id: 'h2', title: 'Heading 2', category: 'text', keywords: ['heading2'], ...listBlockCommand('core.heading.2') },
    { id: 'h3', title: 'Heading 3', category: 'text', keywords: ['heading3'], ...listBlockCommand('core.heading.3') },
    { id: 'h4', title: 'Heading 4', category: 'text', keywords: ['heading4'], ...listBlockCommand('core.heading.4') },
    { id: 'h5', title: 'Heading 5', category: 'text', keywords: ['heading5'], ...listBlockCommand('core.heading.5') },
    { id: 'h6', title: 'Heading 6', category: 'text', keywords: ['heading6'], ...listBlockCommand('core.heading.6') },
    { id: 'emoji', title: 'Emoji', category: 'text', keywords: ['smile', 'icon', 'symbol'], run: () => {} },
    { id: 'ul', title: 'Bullet List', category: 'lists', keywords: ['list', 'unordered'], ...listBlockCommand('core.bulletList') },
    { id: 'ol', title: 'Ordered List', category: 'lists', keywords: ['numbered'], ...listBlockCommand('core.orderedList') },
    { id: 'checklist', title: 'Checklist Item', category: 'lists', keywords: ['todo', 'task', 'checkbox'], ...listBlockCommand('core.checklistItem') },
    { id: 'code', title: 'Code Block', category: 'code', keywords: ['codeblock', 'snippet'], ...listBlockCommand('core.codeBlock') },
    { id: 'math', title: 'Math Block', category: 'code', keywords: ['latex', 'formula', 'equation'], ...listBlockCommand('core.math.block.insert') },
    { id: 'math-inline', title: 'Inline Math', category: 'code', keywords: ['latex', 'formula'], run: command('core.math.inline.insert') },
    { id: 'image', title: 'Image', category: 'media', keywords: ['photo', 'asset', 'picture'], ...listBlockCommand('core.image.insert') },
    { id: 'file', title: 'File Attachment', category: 'media', keywords: ['attach', 'upload', 'pdf', 'zip', 'document'], ...listBlockCommand('core.file.insert') },
    { id: 'table', title: 'Table', category: 'media', keywords: ['grid', 'cells'], ...listBlockCommand('core.table.insert') },
    { id: 'database', title: 'Database', category: 'media', keywords: ['database', 'db', 'table', 'grid', 'chart', 'cards', 'list', 'csv', 'база', 'таблица'], ...listBlockCommand('core.database.insert') },
    { id: 'mermaid', title: 'Mermaid Diagram', category: 'media', keywords: ['diagram', 'flowchart', 'chart', 'graph', 'sequence'], ...listBlockCommand('core.mermaid.insert') },
    { id: 'draw', title: 'Drawing', category: 'media', keywords: ['sketch', 'draw', 'excalidraw', 'canvas', 'hand', 'paint', 'whiteboard'], ...listBlockCommand('core.draw.insert') },
    { id: 'markmap', title: 'Mind Map', category: 'media', keywords: ['mindmap', 'markmap', 'map', 'outline', 'tree', 'brainstorm'], ...listBlockCommand('core.markmap.insert') },
    { id: 'chart', title: 'Chart', category: 'media', keywords: ['vega', 'vega-lite', 'chart', 'graph', 'visualization', 'plot', 'bar', 'line', 'pie'], ...listBlockCommand('core.vega.insert') },
    { id: 'note-embed', title: 'Note Embed', category: 'media', keywords: ['embed', 'reference', 'card', 'page'], ...listBlockCommand('core.noteEmbed.insert') },
    { id: 'embed', title: 'Embed', category: 'media', keywords: ['embed', 'youtube', 'video', 'figma', 'iframe', 'website', 'link'], ...listBlockCommand('core.embed.insert') },
    { id: 'audio', title: 'Audio', category: 'media', keywords: ['sound', 'music', 'mp3', 'ogg'], ...listBlockCommand('core.media.audio.insert') },
    { id: 'video', title: 'Video', category: 'media', keywords: ['film', 'mp4', 'movie', 'clip'], ...listBlockCommand('core.media.video.insert') },
    { id: 'quote', title: 'Quote', category: 'layout', keywords: ['blockquote'], ...listBlockCommand('core.blockquote') },
    { id: 'callout', title: 'Callout', category: 'layout', keywords: ['info', 'note'], ...listBlockCommand('core.callout') },
    { id: 'toggle', title: 'Toggle', category: 'layout', keywords: ['toggle', 'collapsible', 'fold', 'collapse', 'details', 'spoiler'], ...listBlockCommand('core.toggle.insert') },
    { id: 'divider', title: 'Divider', category: 'layout', keywords: ['separator', 'line', 'hr'], ...listBlockCommand('core.divider') },
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
  if (options.enableDraw === false) {
    const drawIdx = slashItems.findIndex(item => item.id === 'draw')
    if (drawIdx !== -1) slashItems.splice(drawIdx, 1)
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
    const pluginSlashItems = host.listSlashItems()
    for (const pluginItem of pluginSlashItems) {
      const existingIdx = slashItems.findIndex(item => item.id === pluginItem.id)
      if (existingIdx !== -1) slashItems.splice(existingIdx, 1)
      slashItems.push(pluginItem)
    }
    plugins.push(host.createDecorationPlugin())
    plugins.push(...host.registries.extraPlugins)
  }
  if (options.aiSlashItems?.length) {
    slashItems.push(...options.aiSlashItems)
  }

  plugins.push(columnResizing({ cellMinWidth: 80, defaultCellMinWidth: 120 }))
  plugins.push(tableEditing())
  plugins.push(createTableFormulaPlugin({ onRequestFormulaEdit: options.nodeViewOptions?.onRequestFormulaEdit }))
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
  if (options.internalLinkExists) {
    plugins.push(createBrokenLinkDecorationPlugin({ exists: options.internalLinkExists }))
  }
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
