import type { NodeType } from 'prosemirror-model'
import type { Command } from 'prosemirror-state'
import { createDefaultDatabaseData, type DatabaseBlockData } from '../../types/database-block'
import { createInsertBlockCommand, createSetNodeAttrsCommand } from './utils'

export function createInsertDatabaseCommand(databaseBlock: NodeType): Command {
  return createInsertBlockCommand(databaseBlock, { data: createDefaultDatabaseData() })
}

export function createDatabaseDataCommand(databaseBlock: NodeType, data: DatabaseBlockData): Command {
  return createSetNodeAttrsCommand(databaseBlock, (node) => ({ ...node.attrs, data }))
}
