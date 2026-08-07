import { describe, expect, it, vi } from 'vitest'
import { Packer } from 'docx'
import JSZip from 'jszip'
import type { NoteDocument } from '../../types/note'
import { serializeNoteToDocx, type DocxExportHelpers } from './docxSerializer'
import { DEFAULT_DOCX_OPTIONS } from './docxOptions'

function note(content: NoteDocument['content'], title = 'Doc'): NoteDocument {
  return { id: 'n1', title, icon: '', folderId: null, createdAt: '', updatedAt: '', content }
}

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47])

function stubHelpers(overrides: Partial<DocxExportHelpers> = {}): DocxExportHelpers {
  return {
    loadAssetImage: vi.fn(async () => ({ data: PNG, type: 'png' as const, width: 20, height: 10 })),
    rasterizeSvg: vi.fn(async () => ({ data: PNG, width: 30, height: 15 })),
    ...overrides,
  }
}

async function documentXml(doc: Awaited<ReturnType<typeof serializeNoteToDocx>>): Promise<string> {
  return docxFileXml(doc, 'word/document.xml')
}

async function docxFileXml(
  doc: Awaited<ReturnType<typeof serializeNoteToDocx>>,
  path: string,
): Promise<string> {
  const buffer = await Packer.toBuffer(doc)
  const zip = await JSZip.loadAsync(buffer)
  const file = zip.file(path)
  if (!file) throw new Error(`${path} missing`)
  return file.async('string')
}

describe('serializeNoteToDocx', () => {
  it('writes the note title and a heading with styled runs', async () => {
    const doc = await serializeNoteToDocx(note({
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Section' }] },
        { type: 'paragraph', content: [
          { type: 'text', text: 'bold', marks: [{ type: 'strong' }] },
          { type: 'text', text: 'italic', marks: [{ type: 'em' }] },
        ] },
      ],
    }, 'My Note'), stubHelpers())
    const xml = await documentXml(doc)

    expect(xml).toContain('My Note')
    expect(xml).toContain('w:val="Heading2"')
    expect(xml).toContain('Section')
    expect(xml).toContain('<w:b/>')
    expect(xml).toContain('<w:i/>')
  })

  it('emits bullet and ordered list numbering references', async () => {
    const doc = await serializeNoteToDocx(note({
      type: 'doc',
      content: [
        { type: 'bullet_list', content: [
          { type: 'list_item', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'one' }] }] },
        ] },
        { type: 'ordered_list', content: [
          { type: 'list_item', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'first' }] }] },
        ] },
      ],
    }), stubHelpers())
    const xml = await documentXml(doc)

    expect(xml).toContain('<w:numPr>')
    expect(xml).toContain('one')
    expect(xml).toContain('first')
  })

  it('renders tables, checklists and links', async () => {
    const doc = await serializeNoteToDocx(note({
      type: 'doc',
      content: [
        { type: 'table', content: [
          { type: 'table_row', content: [
            { type: 'table_header', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Head' }] }] },
            { type: 'table_cell', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Cell' }] }] },
          ] },
        ] },
        { type: 'checklist_item', attrs: { checked: true }, content: [{ type: 'text', text: 'done' }] },
        { type: 'paragraph', content: [
          { type: 'text', text: 'site', marks: [{ type: 'link', attrs: { href: 'https://example.test' } }] },
        ] },
      ],
    }), stubHelpers())
    const xml = await documentXml(doc)

    expect(xml).toContain('<w:tbl>')
    expect(xml).toContain('Head')
    expect(xml).toContain('Cell')
    expect(xml).toContain('☑')
    expect(xml).toContain('<w:hyperlink')
  })

  it('numbers headings without leading zeros when the note starts below H1', async () => {
    const doc = await serializeNoteToDocx(note({
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Section A' }] },
        { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Sub' }] },
      ],
    }), stubHelpers(), { ...DEFAULT_DOCX_OPTIONS, headingNumbers: true })
    const xml = await documentXml(doc)

    expect(xml).toContain('1. ')
    expect(xml).toContain('1.1. ')
    expect(xml).not.toContain('0.1')
  })

  it('builds a self-contained, clickable table of contents from heading bookmarks', async () => {
    const doc = await serializeNoteToDocx(note({
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Real Heading' }] },
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Nested' }] },
      ],
    }), stubHelpers(), { ...DEFAULT_DOCX_OPTIONS, tableOfContents: true })
    const xml = await documentXml(doc)

    expect(xml).toContain('Table of Contents')
    // The TOC title is a plain paragraph, never a heading (would otherwise be an entry).
    expect(/Heading1"\/>[\s\S]{0,120}Table of Contents/.test(xml)).toBe(false)
    // Headings carry bookmarks and the TOC links to them.
    expect(xml).toContain('w:name="_Toc_0"')
    expect(xml).toContain('w:anchor="_Toc_0"')
    expect(xml).toContain('w:anchor="_Toc_1"')
    expect(xml).toContain('Real Heading')
    expect(xml).toContain('Nested')
  })

  it('renders emoji with an emoji-capable font', async () => {
    const doc = await serializeNoteToDocx(note({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'hi 🚀 there' }] }],
    }), stubHelpers())
    const xml = await documentXml(doc)

    expect(xml).toContain('Segoe UI Emoji')
    expect(xml).toContain('🚀')
  })

  it('embeds asset images and rasterized drawings, skipping empty drawings', async () => {
    const helpers = stubHelpers()
    const doc = await serializeNoteToDocx(note({
      type: 'doc',
      content: [
        { type: 'image_block', attrs: { src: '.nevo/assets/pic.png' } },
        { type: 'draw_block', attrs: { drawId: 'd1', svgPreview: '<svg xmlns="http://www.w3.org/2000/svg" width="30" height="15"></svg>' } },
        { type: 'draw_block', attrs: { drawId: 'd2', svgPreview: '' } },
      ],
    }), helpers)
    const xml = await documentXml(doc)

    expect(helpers.loadAssetImage).toHaveBeenCalledWith('.nevo/assets/pic.png')
    expect(helpers.rasterizeSvg).toHaveBeenCalledTimes(1)
    expect(xml).toContain('<w:drawing>')
  })

  it.each([
    ['A4', 'portrait', 11906, 16838, 'portrait'],
    ['A4', 'landscape', 16838, 11906, 'landscape'],
    ['Letter', 'portrait', 12240, 15840, 'portrait'],
    ['Letter', 'landscape', 15840, 12240, 'landscape'],
  ] as const)('writes correct %s %s page dimensions', async (
    paperFormat,
    orientation,
    width,
    height,
    orient,
  ) => {
    const doc = await serializeNoteToDocx(
      note({ type: 'doc', content: [] }),
      stubHelpers(),
      { ...DEFAULT_DOCX_OPTIONS, paperFormat, orientation },
    )
    const xml = await documentXml(doc)

    expect(xml).toContain(`<w:pgSz w:w="${width}" w:h="${height}" w:orient="${orient}"/>`)
  })

  it('writes all margins, header/footer distances, 11 pt, and paragraph spacing', async () => {
    const doc = await serializeNoteToDocx(
      note({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Body' }] }] }),
      stubHelpers(),
      {
        ...DEFAULT_DOCX_OPTIONS,
        marginTop: 10,
        marginRight: 11,
        marginBottom: 12,
        marginLeft: 13,
      },
    )
    const document = await documentXml(doc)
    const styles = await docxFileXml(doc, 'word/styles.xml')

    expect(document).toContain(
      '<w:pgMar w:top="567" w:right="624" w:bottom="680" w:left="737" w:header="720" w:footer="720" w:gutter="0"/>',
    )
    expect(styles).toMatch(/<w:docDefaults>[\s\S]*?<w:sz w:val="22"\/>/)
    expect(styles).toMatch(/<w:spacing w:after="160" w:line="276" w:lineRule="auto"\/>/)
  })

  it('writes the same title and heading typography used by the preview', async () => {
    const doc = await serializeNoteToDocx(
      note({ type: 'doc', content: [] }),
      stubHelpers(),
      DEFAULT_DOCX_OPTIONS,
    )
    const styles = await docxFileXml(doc, 'word/styles.xml')

    expect(styles).toMatch(/w:styleId="Title"[\s\S]*?<w:sz w:val="56"\/>/)
    expect(styles).toMatch(/w:styleId="Heading1"[\s\S]*?<w:color w:val="2E74B5"\/>[\s\S]*?<w:sz w:val="32"\/>/)
    expect(styles).toMatch(/w:styleId="Heading2"[\s\S]*?<w:color w:val="2E74B5"\/>[\s\S]*?<w:sz w:val="26"\/>/)
    expect(styles).toMatch(/w:styleId="Heading3"[\s\S]*?<w:color w:val="1F4D78"\/>[\s\S]*?<w:sz w:val="24"\/>/)
    expect(styles).toMatch(/w:styleId="Heading4"[\s\S]*?<w:i\/>[\s\S]*?<w:color w:val="2E74B5"\/>/)
  })

  it('fits wide and tall images into the actual usable page area', async () => {
    const helpers = stubHelpers({
      loadAssetImage: vi.fn(async (src: string) => ({
        data: PNG,
        type: 'png' as const,
        width: src.includes('wide') ? 2000 : 1000,
        height: src.includes('wide') ? 1000 : 2000,
      })),
    })
    const doc = await serializeNoteToDocx(note({
      type: 'doc',
      content: [
        { type: 'image_block', attrs: { src: 'wide.png' } },
        { type: 'image_block', attrs: { src: 'tall.png' } },
      ],
    }), helpers)
    const xml = await documentXml(doc)
    const extents = [...xml.matchAll(/<wp:extent cx="(\d+)" cy="(\d+)"\/>/g)]
      .map(match => ({ width: Number(match[1]), height: Number(match[2]) }))

    expect(extents).toHaveLength(2)
    expect(extents[0].width).toBeLessThanOrEqual(170 * 36000)
    expect(extents[0].height / extents[0].width).toBeCloseTo(0.5, 5)
    expect(extents[1].height).toBeLessThanOrEqual(247 * 36000)
    expect(extents[1].width / extents[1].height).toBeCloseTo(0.5, 5)
  })
})
