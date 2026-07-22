import { describe, expect, it } from 'vitest'
import { parseMarkdownToBlockNode } from '../markdownParser'
import type { ImportedImageAsset } from '../../../types/note'
import type { NotionExportDocument } from '../../../types/notion-import'
import { stripNotionId } from './paths'
import { buildNotionImportTree, parseNotionSitemap } from './tree'
import { createNotionLinkResolver, resolveArchiveReference } from './links'
import { preprocessNotionHtml } from './html'
import { normalizeNotionDocument } from './content'
import { resolveNotionAssets } from './assets'
import { createDatabaseMetadata, parseNotionCsv } from './csvDatabase'

function document(relativePath: string, kind: 'markdown' | 'csv' = 'markdown'): NotionExportDocument {
  return { relativePath, kind, content: '', size: 0 }
}

describe('Notion import helpers', () => {
  it('removes only a valid trailing Notion id', () => {
    expect(stripNotionId('Project abcdef1234567890abcdef1234567890')).toBe('Project')
    expect(stripNotionId('Project abcdef1234567890abcdef123456789')).toBe('Project abcdef1234567890abcdef123456789')
    expect(stripNotionId('abcdef1234567890abcdef1234567890 notes')).toBe('abcdef1234567890abcdef1234567890 notes')
  })

  it('builds page folders with the parent note and leaf children', () => {
    const parent = 'Parent abcdef1234567890abcdef1234567890'
    const tree = buildNotionImportTree([
      document(`${parent}.md`),
      document(`${parent}/Child 11111111111111111111111111111111.md`),
    ])

    expect(tree.folders).toEqual([{ path: parent, parentPath: '', title: 'Parent' }])
    expect(tree.documents[0]).toMatchObject({ title: 'Parent', folderPath: parent, hasChildren: true })
    expect(tree.documents[1]).toMatchObject({ title: 'Child', folderPath: parent, hasChildren: false })
  })

  it('parses sitemap links and resolves encoded relative links with anchors', () => {
    expect(parseNotionSitemap('<a href="Team%20Page.md">Team</a><a href="https://notion.so">outside</a>'))
      .toEqual(['Team Page.md'])
    expect(resolveArchiveReference('../Team%20Page.md#Roadmap', 'Area/Current.md'))
      .toEqual({ path: 'Team Page.md', anchor: 'Roadmap' })

    const plans = buildNotionImportTree([document('Team Page.md'), document('Area/Current.md')]).documents
    const team = plans.find(plan => plan.title === 'Team Page')!
    const resolver = createNotionLinkResolver('Area/Current.md', plans, new Map([[team.key, 'note-team']]))
    expect(resolver('../Team%20Page.md#Roadmap')).toEqual({ noteId: 'note-team', title: 'Team Page', anchor: 'Roadmap' })
    expect(resolver('https://example.com')).toBeNull()
  })

  it('converts asides to callouts, moves their emoji to the icon and keeps visible HTML text', () => {
    const preprocessed = preprocessNotionHtml('<aside><div>🚀</div><div><b>Remember</b></div></aside>\n<div>Visible <em>text</em></div>')
    const parsed = parseMarkdownToBlockNode(preprocessed.markdown, 'Page', undefined, { extractTitle: false })
    const transformed = normalizeNotionDocument(parsed.content, 'Page')

    expect(transformed.content?.[0].type).toBe('callout')
    expect(transformed.content?.[0].attrs?.icon).toBe('🚀')
    expect(JSON.stringify(transformed.content?.[0].content)).not.toContain('🚀')
    expect(JSON.stringify(transformed)).toContain('Remember')
    expect(JSON.stringify(transformed)).toContain('Visible text')
    expect(preprocessed.warnings).toBeGreaterThan(0)
  })

  it('uses the standard callout icon when Notion did not export one', () => {
    const preprocessed = preprocessNotionHtml('<aside>Remember</aside>')
    const parsed = parseMarkdownToBlockNode(preprocessed.markdown, 'Page', undefined, { extractTitle: false })
    const callout = normalizeNotionDocument(parsed.content, 'Page').content?.[0]

    expect(callout?.attrs?.icon).toBe('💡')
    expect(JSON.stringify(callout)).toContain('Remember')
  })

  it('removes only the leading H1 that duplicates the Notion page title', () => {
    const parsed = parseMarkdownToBlockNode('# Page\n\nIntro\n\n# Section', 'Page', undefined, { extractTitle: false })
    const normalized = normalizeNotionDocument(parsed.content, 'Page')

    expect(normalized.content?.map(node => node.type)).toEqual(['paragraph', 'heading'])
    expect(JSON.stringify(normalized)).toContain('Section')
  })

  it('maps relative images, media and files while keeping readable fallbacks', () => {
    const parsed = parseMarkdownToBlockNode(
      '![Picture](files/photo.png)\n\n[Audio](files/track.mp3)\n\n[Manual](files/missing.pdf)',
      'Page',
      undefined,
      { extractTitle: false },
    )
    const imported = (src: string): ImportedImageAsset => ({ src, hash: src, deduplicated: false, bytes: 10 })
    const result = resolveNotionAssets(
      parsed.content,
      'Page.md',
      new Map([
        ['files/photo.png', imported('.nevo/assets/photo.png')],
        ['files/track.mp3', imported('.nevo/assets/track.mp3')],
        ['files/missing.pdf', null],
      ]),
      new Map([['files/track.mp3', 42]]),
    )

    expect(result.content?.map(node => node.type)).toEqual(['image_block', 'media_block', 'paragraph'])
    expect(result.content?.[1].attrs).toMatchObject({ kind: 'audio', size: 42 })
    expect(JSON.stringify(result.content?.[2])).toContain('Manual')
  })

  it('infers safe CSV types and builds database V2 metadata', () => {
    const parsed = parseNotionCsv('Name,Count,When,Done,URL\nOne,12,2025-01-02,true,https://example.com')
    expect(parsed.fields.map(field => field.type)).toEqual(['text', 'number', 'date', 'checkbox', 'url'])
    expect(parsed.records[0].cells[parsed.fields[1].id]).toBe(12)
    expect(parsed.records[0].cells[parsed.fields[3].id]).toBe(true)

    const metadata = createDatabaseMetadata('Tasks', parsed.fields, parsed.records.length)
    expect(metadata).toMatchObject({ version: 2, title: 'Tasks', rowCount: 1 })
    expect(metadata.views).toHaveLength(1)
  })

  it('uses the optional regular Markdown link resolver without changing external links', () => {
    const parsed = parseMarkdownToBlockNode('[Page](Page.md) [Web](https://example.com)', 'Links', undefined, {
      extractTitle: false,
      markdownLinkResolver: href => href === 'Page.md' ? { noteId: 'note-1', title: 'Page' } : null,
    })
    const marks = parsed.content.content?.[0].content?.flatMap(node => node.marks ?? []) ?? []
    expect(marks.map(mark => mark.type)).toEqual(['internal_link', 'link'])
  })
})
