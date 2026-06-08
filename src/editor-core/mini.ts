import { EditorState, Plugin, type Command } from 'prosemirror-state'
import { keymap } from 'prosemirror-keymap'
import { baseKeymap } from 'prosemirror-commands'
import { history } from 'prosemirror-history'
import type { Node as PMNode } from 'prosemirror-model'
import type { NodeViewConstructor } from 'prosemirror-view'
import { createCoreCommands, type NevoCoreCommands } from './commands'
import { createCoreKeymap } from './keymap'
import { createCoreNodeViews, type CoreNodeViewOptions } from './node-views'
import { createMarkdownInputRules } from './input-rules'
import { createListMarkerPlugin } from './plugins/list-markers'
import { nevoMiniSchema } from './schema/mini'

export interface CreateMiniEditorStateOptions {
  doc: PMNode
  nodeViewOptions?: CoreNodeViewOptions
  enableMarkdownShortcuts?: boolean
}

export interface MiniEditorStateSetup {
  state: EditorState
  commands: Map<string, Command>
  coreCommands: NevoCoreCommands
  nodeViews: Record<string, NodeViewConstructor>
}

/**
 * Builds an `EditorState` for the lightweight mini editor. It reuses the core
 * commands, markdown input rules, keymap and node-views from the main editor but
 * skips the heavyweight systems (slash menu, link picker, tables, columns,
 * block selection, plugin host) that the mini editor does not expose.
 */
export function createMiniEditorState(options: CreateMiniEditorStateOptions): MiniEditorStateSetup {
  const schema = nevoMiniSchema
  const coreCommands = createCoreCommands(schema)
  const commandRegistry = new Map<string, Command>(coreCommands.commands)

  const plugins: Plugin[] = []
  if (options.enableMarkdownShortcuts !== false) {
    plugins.push(createMarkdownInputRules(schema))
  }
  plugins.push(history())
  plugins.push(keymap(createCoreKeymap(schema, commandRegistry, 'indent')))
  plugins.push(createListMarkerPlugin())
  plugins.push(keymap(baseKeymap))

  const state = EditorState.create({ schema, doc: options.doc, plugins })
  const nodeViews = createCoreNodeViews(schema, options.nodeViewOptions)

  return { state, commands: commandRegistry, coreCommands, nodeViews }
}
