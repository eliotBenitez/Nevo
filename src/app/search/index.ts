import type { FolderMeta } from '../../types/note'
import type { TitleBarSearchResult, WorkspaceEntitySearchItem } from '../../types/search'
import type { WorkspaceManifest } from '../../types/workspace'

export interface SearchResultGroup {
  id: 'entities' | 'blocks' | 'settings'
  title: string
  items: TitleBarSearchResult[]
}

export interface SearchGroupLimits {
  entities: number
  blocks: number
  settings: number
}

const DEFAULT_LIMITS: SearchGroupLimits = {
  entities: 6,
  blocks: 8,
  settings: 4,
}

function normalizeSearchText(value: string): string {
  return value.trim().toLowerCase()
}

function scoreOrderedFuzzy(query: string, text: string): number | null {
  let queryIndex = 0
  let firstMatchIndex = -1
  let lastMatchIndex = -1

  for (let textIndex = 0; textIndex < text.length && queryIndex < query.length; textIndex += 1) {
    if (text[textIndex] !== query[queryIndex]) continue
    if (firstMatchIndex === -1) firstMatchIndex = textIndex
    lastMatchIndex = textIndex
    queryIndex += 1
  }

  if (queryIndex !== query.length || firstMatchIndex === -1 || lastMatchIndex === -1) return null

  const span = Math.max(1, lastMatchIndex - firstMatchIndex + 1)
  const densityPenalty = span - query.length
  return 1_000 - firstMatchIndex * 6 - densityPenalty * 8
}

function scoreSearchText(query: string, text: string): number | null {
  const normalizedQuery = normalizeSearchText(query)
  const normalizedText = normalizeSearchText(text)

  if (!normalizedQuery || !normalizedText) return null

  if (normalizedText.startsWith(normalizedQuery)) {
    return 3_000 - normalizedText.length
  }

  const substringIndex = normalizedText.indexOf(normalizedQuery)
  if (substringIndex !== -1) {
    return 2_000 - substringIndex * 8 - normalizedText.length
  }

  return scoreOrderedFuzzy(normalizedQuery, normalizedText)
}

function scoreResult(query: string, result: TitleBarSearchResult): number | null {
  if (result.type === 'note' || result.type === 'folder') {
    return scoreSearchText(query, result.title)
  }

  if (result.type === 'block') {
    const blockScore = scoreSearchText(query, result.blockText)
    const titleScore = scoreSearchText(query, result.noteTitle)
    if (blockScore === null && titleScore === null) return null
    return Math.max(blockScore ?? 0, (titleScore ?? 0) - 150)
  }

  const titleScore = scoreSearchText(query, result.title)
  const descriptionScore = scoreSearchText(query, result.description)
  const valueScore = scoreSearchText(query, result.value)
  const sectionScore = scoreSearchText(query, result.sectionLabel)

  const candidates = [titleScore, descriptionScore, valueScore, sectionScore]
    .filter((score): score is number => score !== null)

  if (candidates.length === 0) return null
  return Math.max(...candidates)
}

function compareRankedResults(query: string, left: TitleBarSearchResult, right: TitleBarSearchResult): number {
  const leftScore = scoreResult(query, left) ?? Number.NEGATIVE_INFINITY
  const rightScore = scoreResult(query, right) ?? Number.NEGATIVE_INFINITY

  if (leftScore !== rightScore) return rightScore - leftScore

  const leftLabel = left.type === 'block' ? left.blockText : left.title
  const rightLabel = right.type === 'block' ? right.blockText : right.title
  return leftLabel.localeCompare(rightLabel)
}

export function rankTitleBarResults(query: string, results: TitleBarSearchResult[]): TitleBarSearchResult[] {
  const normalizedQuery = normalizeSearchText(query)
  if (!normalizedQuery) return []

  return results
    .filter(result => scoreResult(normalizedQuery, result) !== null)
    .slice()
    .sort((left, right) => compareRankedResults(normalizedQuery, left, right))
}

export function groupVisibleTitleBarResults(
  query: string,
  results: TitleBarSearchResult[],
  limits: SearchGroupLimits = DEFAULT_LIMITS,
): SearchResultGroup[] {
  const ranked = rankTitleBarResults(query, results)

  const entities = ranked
    .filter(result => result.type === 'note' || result.type === 'folder')
    .slice(0, limits.entities)
  const blocks = ranked
    .filter(result => result.type === 'block')
    .slice(0, limits.blocks)
  const settings = ranked
    .filter(result => result.type === 'setting')
    .slice(0, limits.settings)

  const groups: SearchResultGroup[] = []
  if (entities.length) groups.push({ id: 'entities', title: 'Notes & Folders', items: entities })
  if (blocks.length) groups.push({ id: 'blocks', title: 'Blocks', items: blocks })
  if (settings.length) groups.push({ id: 'settings', title: 'Settings', items: settings })
  return groups
}

function collectFolderItems(folder: FolderMeta, parentPath: string, items: WorkspaceEntitySearchItem[]) {
  items.push({
    type: 'folder',
    id: folder.id,
    title: folder.title,
    pathLabel: parentPath,
  })

  const nextPath = parentPath ? `${parentPath} / ${folder.title}` : folder.title

  for (const note of folder.notes) {
    items.push({
      type: 'note',
      id: note.id,
      title: note.title,
      pathLabel: nextPath,
    })
  }

  for (const child of folder.children) {
    collectFolderItems(child, nextPath, items)
  }
}

export function collectWorkspaceEntitySearchItems(manifest: WorkspaceManifest | null): WorkspaceEntitySearchItem[] {
  if (!manifest) return []

  const items: WorkspaceEntitySearchItem[] = []

  for (const id of manifest.rootOrder) {
    const rootNote = manifest.rootNotes.find(note => note.id === id)
    if (rootNote) {
      items.push({
        type: 'note',
        id: rootNote.id,
        title: rootNote.title,
        pathLabel: '',
      })
      continue
    }

    const rootFolder = manifest.tree.find(folder => folder.id === id)
    if (rootFolder) {
      collectFolderItems(rootFolder, '', items)
    }
  }

  return items
}
