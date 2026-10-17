import { describe, expect, it } from 'vitest'
import { serializeNoteToMarkdown } from './markdownSerializer'
import type { NoteDocument } from '../../types/note'

function noteWith(content: unknown): NoteDocument {
  return {
    id: 'n1',
    title: 'Test',
    icon: '📄',
    folderId: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    content: { type: 'doc', content: content as any } as any,
  }
}

describe('serializeNoteToMarkdown — internal_link', () => {
  it('emits [[Title]] when there is no alias', () => {
    const note = noteWith([{
      type: 'paragraph',
      content: [{
        type: 'text',
        text: 'Ideas',
        marks: [{ type: 'internal_link', attrs: { noteId: 'id-1', title: 'Ideas', anchor: null, alias: null } }],
      }],
    }])
    expect(serializeNoteToMarkdown(note, 'assets').markdown).toContain('[[Ideas]]')
  })

  it('emits [[Title|Alias]] when an alias differs from the visible text', () => {
    const note = noteWith([{
      type: 'paragraph',
      content: [{
        type: 'text',
        text: 'my note',
        marks: [{ type: 'internal_link', attrs: { noteId: 'id-1', title: 'Ideas', anchor: null, alias: 'my note' } }],
      }],
    }])
    expect(serializeNoteToMarkdown(note, 'assets').markdown).toContain('[[Ideas|my note]]')
  })

  it('falls back to visible text when title is missing (legacy links)', () => {
    const note = noteWith([{
      type: 'paragraph',
      content: [{
        type: 'text',
        text: 'Visible',
        marks: [{ type: 'internal_link', attrs: { noteId: 'id-1', anchor: null, title: null, alias: null } }],
      }],
    }])
    expect(serializeNoteToMarkdown(note, 'assets').markdown).toContain('[[Visible]]')
  })

  it('omits the alias form when the alias equals the target title', () => {
    const note = noteWith([{
      type: 'paragraph',
      content: [{
        type: 'text',
        text: 'Ideas',
        marks: [{ type: 'internal_link', attrs: { noteId: 'id-1', title: 'Ideas', anchor: null, alias: 'Ideas' } }],
      }],
    }])
    // alias === title → no `|alias` suffix, just [[Ideas]]
    expect(serializeNoteToMarkdown(note, 'assets').markdown).toContain('[[Ideas]]')
    expect(serializeNoteToMarkdown(note, 'assets').markdown).not.toContain('[[Ideas|')
  })
})

describe('serializeNoteToMarkdown — block types', () => {
  it('embeds a drawing svgPreview as a data-uri image', () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0"/></svg>'
    const note = noteWith([{ type: 'draw_block', attrs: { drawId: 'd1', svgPreview: svg, title: 'Sketch' } }])
    const md = serializeNoteToMarkdown(note, 'assets').markdown
    expect(md).toContain('![Sketch](data:image/svg+xml;charset=utf-8,')
    expect(md).toContain(encodeURIComponent(svg))
  })

  it('skips an empty drawing but keeps its title', () => {
    const note = noteWith([{ type: 'draw_block', attrs: { drawId: 'd1', svgPreview: '', title: 'Empty' } }])
    expect(serializeNoteToMarkdown(note, 'assets').markdown).toContain('_Empty_')
  })

  it('emits a fenced block for vega charts', () => {
    const note = noteWith([{ type: 'vega_block', attrs: { spec: '{"mark":"bar"}' } }])
    expect(serializeNoteToMarkdown(note, 'assets').markdown).toContain('```vega-lite\n{"mark":"bar"}\n```')
  })

  it('links media assets through the assets folder', () => {
    const note = noteWith([{ type: 'media_block', attrs: { kind: 'audio', src: '.nevo/assets/a.mp3', name: 'Track' } }])
    const { markdown, assetSrcs } = serializeNoteToMarkdown(note, 'assets')
    expect(markdown).toContain('[Track](assets/a.mp3)')
    expect(assetSrcs).toEqual(['.nevo/assets/a.mp3'])
  })

  it('exports audio transcripts with timestamps and escaped text', () => {
    const note = noteWith([{ type: 'media_block', attrs: {
      kind: 'audio', src: '.nevo/assets/a.mp3', name: 'Track',
      transcript: [{ start: 1, end: 3, text: 'Hello **world**\n<bad>' }],
    } }])
    const { markdown } = serializeNoteToMarkdown(note, 'assets')
    expect(markdown).toContain('Transcript:')
    expect(markdown).toContain('0:01 — Hello \\*\\*world\\*\\* \\<bad\\>')
  })

  it('renders valid audio bookmarks as escaped readable Markdown without changing asset collection', () => {
    const note = noteWith([{
      type: 'media_block',
      attrs: {
        kind: 'audio', src: '.nevo/assets/a.mp3', name: 'Track',
        bookmarks: [
          { id: 'later', time: 65, label: 'Later **chapter**\nnext line' },
          { id: 'first', time: 2, label: 'Intro [start]' },
        ],
      },
    }])
    const { markdown, assetSrcs } = serializeNoteToMarkdown(note, 'assets')

    expect(markdown).toContain('[Track](assets/a.mp3)')
    expect(markdown).toContain('0:02 — Intro \\[start\\]')
    expect(markdown).toContain('1:05 — Later \\*\\*chapter\\*\\* next line')
    expect(assetSrcs).toEqual(['.nevo/assets/a.mp3'])
  })

  it('omits invalid and empty audio bookmarks and leaves video output unchanged', () => {
    const note = noteWith([
      { type: 'media_block', attrs: { kind: 'audio', src: '.nevo/assets/a.mp3', bookmarks: [{ id: 'bad', time: Infinity, label: 'bad' }] } },
      { type: 'media_block', attrs: { kind: 'video', src: '.nevo/assets/v.mp4', name: 'Clip', bookmarks: [{ id: 'ok', time: 1, label: 'ignored' }] } },
    ])
    const { markdown } = serializeNoteToMarkdown(note, 'assets')

    expect(markdown).not.toContain('bad')
    expect(markdown).not.toContain('ignored')
  })

  it('keeps the legacy Markdown output and deduplicated assets for audio without usable bookmarks', () => {
    const note = noteWith([
      { type: 'media_block', attrs: { kind: 'audio', src: '.nevo/assets/a.mp3', name: 'Track', bookmarks: [] } },
      { type: 'media_block', attrs: { kind: 'audio', src: '.nevo/assets/a.mp3', name: 'Track', bookmarks: [{ id: '', time: 1, label: 'ignored' }] } },
    ])
    const { markdown, assetSrcs } = serializeNoteToMarkdown(note, 'assets')

    expect(markdown).toBe('# Test\n\n[Track](assets/a.mp3)\n\n[Track](assets/a.mp3)')
    expect(assetSrcs).toEqual(['.nevo/assets/a.mp3'])
  })

  it('renders note embeds, external embeds and toggles', () => {
    const note = noteWith([
      { type: 'note_embed', attrs: { noteId: 'n2', title: 'Other', previewText: 'Preview' } },
      { type: 'embed_block', attrs: { url: 'https://youtu.be/x', title: 'Clip' } },
      {
        type: 'toggle',
        content: [
          { type: 'toggle_title', content: [{ type: 'text', text: 'Summary' }] },
          { type: 'paragraph', content: [{ type: 'text', text: 'Hidden body' }] },
        ],
      },
    ])
    const md = serializeNoteToMarkdown(note, 'assets').markdown
    expect(md).toContain('> **Other**')
    expect(md).toContain('> Preview')
    expect(md).toContain('[Clip](https://youtu.be/x)')
    expect(md).toContain('<summary>Summary</summary>')
    expect(md).toContain('Hidden body')
  })
})
