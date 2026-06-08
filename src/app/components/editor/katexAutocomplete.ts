export interface KatexCommandMatch {
  from: number
  to: number
  query: string
}

export interface KatexAutocompleteItem {
  command: string
  insertText: string
  cursorOffset: number
}

import { KATEX_COMMANDS, POPULAR_KATEX_COMMANDS } from './katexCommands'
import { KATEX_ARGUMENT_COUNTS } from './katexArgumentCounts'

const POPULAR_RANK = new Map(POPULAR_KATEX_COMMANDS.map((command, index) => [command, index]))

const SUGGESTION_LIMIT = 8

function compareCommands(a: string, b: string, query: string) {
  const aQuery = a.slice(1).toLowerCase()
  const bQuery = b.slice(1).toLowerCase()
  const exactA = aQuery === query
  const exactB = bQuery === query
  if (exactA !== exactB) return exactA ? -1 : 1

  const prefixA = aQuery.startsWith(query)
  const prefixB = bQuery.startsWith(query)
  if (prefixA !== prefixB) return prefixA ? -1 : 1

  const popularA = POPULAR_RANK.get(a) ?? Number.POSITIVE_INFINITY
  const popularB = POPULAR_RANK.get(b) ?? Number.POSITIVE_INFINITY
  if (popularA !== popularB) return popularA - popularB

  if (a.length !== b.length) return a.length - b.length
  return a.localeCompare(b)
}

export function findKatexCommandMatch(value: string, caret: number): KatexCommandMatch | null {
  if (caret < 0 || caret > value.length) return null

  const prefix = value.slice(0, caret)
  const slashIndex = prefix.lastIndexOf('\\')
  if (slashIndex < 0) return null

  const query = prefix.slice(slashIndex + 1)
  if (!/^[A-Za-z*]*$/.test(query)) return null

  return {
    from: slashIndex,
    to: caret,
    query,
  }
}

export function buildKatexAutocompleteItem(command: string): KatexAutocompleteItem {
  const argCount = KATEX_ARGUMENT_COUNTS[command] ?? 0
  if (argCount <= 0) {
    return {
      command,
      insertText: command,
      cursorOffset: command.length,
    }
  }

  const insertText = `${command}${'{}'.repeat(argCount)}`
  return {
    command,
    insertText,
    cursorOffset: command.length + 1,
  }
}

export function getKatexAutocompleteItems(query: string): KatexAutocompleteItem[] {
  const normalizedQuery = query.toLowerCase()
  const commands = normalizedQuery.length === 0
    ? [...POPULAR_KATEX_COMMANDS]
    : KATEX_COMMANDS
        .filter((command) => command.slice(1).toLowerCase().includes(normalizedQuery))
        .sort((a, b) => compareCommands(a, b, normalizedQuery))
        .slice(0, SUGGESTION_LIMIT)

  return commands.map((command) => buildKatexAutocompleteItem(command))
}
