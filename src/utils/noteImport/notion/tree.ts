import type { NotionExportDocument } from '../../../types/notion-import'
import {
  dirnameArchivePath,
  normalizeArchivePath,
  notionTitleFromPath,
  stripNotionId,
  withoutDocumentExtension,
} from './paths'

export interface NotionFolderPlan {
  path: string
  parentPath: string
  title: string
}

export interface NotionDocumentPlan {
  key: string
  folderPath: string
  title: string
  document: NotionExportDocument
  hasChildren: boolean
}

export interface NotionImportTree {
  folders: NotionFolderPlan[]
  documents: NotionDocumentPlan[]
}

function folderTitle(path: string): string {
  const segments = path.split('/')
  const segment = segments[segments.length - 1] ?? path
  return stripNotionId(segment) || 'Untitled'
}

export function buildNotionImportTree(documents: NotionExportDocument[]): NotionImportTree {
  const documentKeys = new Set(documents.map(document => withoutDocumentExtension(document.relativePath)))
  const folderPaths = new Set<string>()
  const plans = documents.map(document => {
    const key = withoutDocumentExtension(document.relativePath)
    const directory = dirnameArchivePath(document.relativePath)
    const hasChildren = documents.some(candidate => {
      const candidateDirectory = dirnameArchivePath(candidate.relativePath)
      return candidateDirectory === key || candidateDirectory.startsWith(`${key}/`)
    })
    const folderPath = hasChildren ? key : directory
    if (folderPath) folderPaths.add(folderPath)
    return {
      key,
      folderPath,
      title: notionTitleFromPath(document.relativePath),
      document,
      hasChildren,
    }
  })

  for (const path of [...folderPaths]) {
    let parent = dirnameArchivePath(path)
    while (parent) {
      folderPaths.add(parent)
      parent = dirnameArchivePath(parent)
    }
  }

  const folders = [...folderPaths]
    .map(path => ({ path: normalizeArchivePath(path), parentPath: dirnameArchivePath(path), title: folderTitle(path) }))
    .sort((left, right) => {
      const depth = left.path.split('/').length - right.path.split('/').length
      return depth || left.path.localeCompare(right.path)
    })

  plans.sort((left, right) => {
    if (documentKeys.has(left.folderPath) !== documentKeys.has(right.folderPath)) {
      return documentKeys.has(left.folderPath) ? -1 : 1
    }
    return left.key.localeCompare(right.key)
  })
  return { folders, documents: plans }
}

export function parseNotionSitemap(html: string): string[] {
  const paths: string[] = []
  const hrefRe = /<a\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>/gi
  let match: RegExpExecArray | null
  while ((match = hrefRe.exec(html)) !== null) {
    const href = match[1]
    if (!href || /^(?:[a-z]+:|#)/i.test(href)) continue
    try {
      paths.push(normalizeArchivePath(decodeURIComponent(href.split('#')[0])))
    } catch {
      paths.push(normalizeArchivePath(href.split('#')[0]))
    }
  }
  return [...new Set(paths.filter(Boolean))]
}
