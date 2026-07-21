import { describe, expect, it, vi } from 'vitest'
import type { BlockNode, ImportedImageAsset } from '../../../types/note'
import {
  attachmentMime,
  classifyAttachment,
  createVaultAssetResolver,
  preprocessObsidianEmbeds,
  resolveObsidianEmbeds,
  type ResolveEmbedsCtx,
} from './obsidianEmbeds'

describe('preprocessObsidianEmbeds', () => {
  it('rewrites a plain embed to the sentinel image form with an empty alt', () => {
    const result = preprocessObsidianEmbeds('![[a.png]]')
    expect(result).toBe('![](obsidian-embed:a.png)')
  })

  it('rewrites an aliased embed with a subpath, percent-encoding the target', () => {
    const result = preprocessObsidianEmbeds('![[Folder/b.png|Alt]]')
    expect(result).toBe(`![Alt](obsidian-embed:${encodeURIComponent('Folder/b.png')})`)
  })

  it('percent-encodes spaces in the target', () => {
    const result = preprocessObsidianEmbeds('![[My Folder/My Image.png]]')
    expect(result).toContain(encodeURIComponent('My Folder/My Image.png'))
  })

  it('leaves a plain [[wiki link]] (no leading !) untouched', () => {
    const result = preprocessObsidianEmbeds('See [[Some Note]] for details.')
    expect(result).toBe('See [[Some Note]] for details.')
  })

  it('does not rewrite an embed-like sequence inside a fenced code block', () => {
    const markdown = ['```', '![[a.png]]', '```'].join('\n')
    expect(preprocessObsidianEmbeds(markdown)).toBe(markdown)
  })

  it('does not rewrite an embed-like sequence inside a ~~~ fenced code block', () => {
    const markdown = ['~~~', '![[a.png]]', '~~~'].join('\n')
    expect(preprocessObsidianEmbeds(markdown)).toBe(markdown)
  })

  it('does not rewrite an embed-like sequence inside an inline code span', () => {
    const markdown = 'Use `![[a.png]]` as an example.'
    expect(preprocessObsidianEmbeds(markdown)).toBe(markdown)
  })

  it('rewrites an embed on a line outside a code span while leaving the span alone', () => {
    const markdown = 'Use `code` and ![[a.png]] together.'
    const result = preprocessObsidianEmbeds(markdown)
    expect(result).toContain('`code`')
    expect(result).toContain('obsidian-embed:a.png')
  })
})

describe('classifyAttachment', () => {
  it.each([
    ['photo.png', 'image'],
    ['photo.JPG', 'image'],
    ['photo.svg', 'image'],
    ['clip.mp3', 'audio'],
    ['clip.flac', 'audio'],
    ['movie.mp4', 'video'],
    ['movie.MOV', 'video'],
    ['doc.pdf', 'pdf'],
    ['archive.zip', 'file'],
    ['no-extension', 'file'],
  ] as const)('classifies %s as %s', (name, expected) => {
    expect(classifyAttachment(name)).toBe(expected)
  })
})

describe('attachmentMime', () => {
  it.each([
    ['photo.png', 'image/png'],
    ['photo.jpeg', 'image/jpeg'],
    ['clip.mp3', 'audio/mpeg'],
    ['movie.mp4', 'video/mp4'],
    ['doc.pdf', 'application/pdf'],
    ['archive.zip', 'application/octet-stream'],
    ['no-extension', 'application/octet-stream'],
  ] as const)('maps %s to %s', (name, expected) => {
    expect(attachmentMime(name)).toBe(expected)
  })
})

describe('createVaultAssetResolver', () => {
  it('resolves an exact vault-root-relative path', () => {
    const resolver = createVaultAssetResolver([{ relativePath: 'attachments/a.png' }])
    expect(resolver('attachments/a.png', '')).toBe('attachments/a.png')
  })

  it('resolves by basename when no path match exists', () => {
    const resolver = createVaultAssetResolver([{ relativePath: 'deep/nested/x.png' }])
    expect(resolver('x.png', '')).toBe('deep/nested/x.png')
  })

  it('resolves a basename collision to the shortest relativePath, deterministically', () => {
    const resolver = createVaultAssetResolver([
      { relativePath: 'a/b/c/img.png' },
      { relativePath: 'a/img.png' },
      { relativePath: 'x/img.png' },
    ])
    expect(resolver('img.png', '')).toBe('a/img.png')
  })

  it('resolves relative to fromDir, including "../" segments', () => {
    const resolver = createVaultAssetResolver([{ relativePath: 'notes/attachments/pic.png' }])
    expect(resolver('attachments/pic.png', 'notes')).toBe('notes/attachments/pic.png')
    expect(resolver('../attachments/pic.png', 'notes/sub')).toBe('notes/attachments/pic.png')
  })

  it('is case-insensitive for both path and basename matches', () => {
    const resolver = createVaultAssetResolver([{ relativePath: 'Attachments/Pic.PNG' }])
    expect(resolver('attachments/pic.png', '')).toBe('Attachments/Pic.PNG')
    expect(resolver('PIC.png', '')).toBe('Attachments/Pic.PNG')
  })

  it('returns null when nothing matches', () => {
    const resolver = createVaultAssetResolver([{ relativePath: 'a.png' }])
    expect(resolver('ghost.png', '')).toBeNull()
  })
})

describe('resolveObsidianEmbeds', () => {
  function makeCtx(
    overrides: Omit<Partial<ResolveEmbedsCtx>, 'onUnresolvedEmbed' | 'onAttachmentImported'> = {},
  ): ResolveEmbedsCtx & {
    onUnresolvedEmbed: ReturnType<typeof vi.fn>
    onAttachmentImported: ReturnType<typeof vi.fn>
  } {
    const onUnresolvedEmbed = vi.fn()
    const onAttachmentImported = vi.fn()
    return {
      noteDir: '',
      resolveAsset: () => null,
      resolveNote: () => null,
      importAsset: async () => null,
      onUnresolvedEmbed,
      onAttachmentImported,
      ...overrides,
    }
  }

  function imageEmbedDoc(target: string, alt: string | null = null): BlockNode {
    return {
      type: 'doc',
      content: [
        { type: 'image_block', attrs: { src: `obsidian-embed:${encodeURIComponent(target)}`, alt, caption: null, sizePreset: 'full', width: null } },
      ],
    }
  }

  it('resolves an image embed into an image_block with the imported .nevo asset src', async () => {
    const imported: ImportedImageAsset = { src: '.nevo/assets/hash-a.png', hash: 'hash', deduplicated: false, bytes: 10 }
    const ctx = makeCtx({
      resolveAsset: (ref) => (ref === 'a.png' ? 'a.png' : null),
      importAsset: async () => imported,
    })
    const result = await resolveObsidianEmbeds(imageEmbedDoc('a.png', 'Alt'), ctx)
    const node = result.content![0]
    expect(node.type).toBe('image_block')
    expect(node.attrs).toMatchObject({ src: '.nevo/assets/hash-a.png', alt: 'Alt', sizePreset: 'medium', align: 'center' })
    expect(ctx.onAttachmentImported).toHaveBeenCalledTimes(1)
  })

  it('resolves a pdf embed into a file_block', async () => {
    const imported: ImportedImageAsset = { src: '.nevo/assets/hash-doc.pdf', hash: 'hash', deduplicated: false, bytes: 20 }
    const ctx = makeCtx({
      resolveAsset: (ref) => (ref === 'doc.pdf' ? 'doc.pdf' : null),
      importAsset: async () => imported,
    })
    const result = await resolveObsidianEmbeds(imageEmbedDoc('doc.pdf'), ctx)
    const node = result.content![0]
    expect(node.type).toBe('file_block')
    expect(node.attrs).toMatchObject({ src: '.nevo/assets/hash-doc.pdf', filename: 'doc.pdf', mime: 'application/pdf', size: 20 })
  })

  it('resolves an mp4 embed into a media_block with kind video', async () => {
    const imported: ImportedImageAsset = { src: '.nevo/assets/hash-movie.mp4', hash: 'hash', deduplicated: false, bytes: 30 }
    const ctx = makeCtx({
      resolveAsset: (ref) => (ref === 'movie.mp4' ? 'movie.mp4' : null),
      importAsset: async () => imported,
    })
    const result = await resolveObsidianEmbeds(imageEmbedDoc('movie.mp4'), ctx)
    const node = result.content![0]
    expect(node.type).toBe('media_block')
    expect(node.attrs).toMatchObject({ kind: 'video', src: '.nevo/assets/hash-movie.mp4', mime: 'video/mp4' })
  })

  it('resolves a note embed (no extension) into a note_embed with the resolved noteId', async () => {
    const ctx = makeCtx({ resolveNote: (target) => (target === 'Other Note' ? 'note-42' : null) })
    const result = await resolveObsidianEmbeds(imageEmbedDoc('Other Note'), ctx)
    const node = result.content![0]
    expect(node.type).toBe('note_embed')
    expect(node.attrs).toMatchObject({ noteId: 'note-42', title: 'Other Note' })
  })

  it('resolves a relative markdown-style image and rewrites its src', async () => {
    const imported: ImportedImageAsset = { src: '.nevo/assets/hash-x.png', hash: 'hash', deduplicated: false, bytes: 5 }
    const ctx = makeCtx({
      noteDir: 'notes',
      resolveAsset: (ref, fromDir) => (ref === 'img/x.png' && fromDir === 'notes' ? 'notes/img/x.png' : null),
      importAsset: async () => imported,
    })
    const doc: BlockNode = {
      type: 'doc',
      content: [{ type: 'image_block', attrs: { src: 'img/x.png', alt: 'orig alt', caption: null, sizePreset: 'full', width: null } }],
    }
    const result = await resolveObsidianEmbeds(doc, ctx)
    const node = result.content![0]
    expect(node.type).toBe('image_block')
    expect(node.attrs).toMatchObject({ src: '.nevo/assets/hash-x.png', alt: 'orig alt' })
    expect(ctx.onAttachmentImported).toHaveBeenCalledTimes(1)
  })

  it('replaces an unresolved embed with a paragraph placeholder and fires the callback', async () => {
    const ctx = makeCtx()
    const result = await resolveObsidianEmbeds(imageEmbedDoc('Ghost.png'), ctx)
    const node = result.content![0]
    expect(node).toEqual({ type: 'paragraph', content: [{ type: 'text', text: '![[Ghost.png]]' }] })
    expect(ctx.onUnresolvedEmbed).toHaveBeenCalledWith('Ghost.png')
  })

  it('leaves an http(s) image src unchanged', async () => {
    const ctx = makeCtx()
    const doc: BlockNode = {
      type: 'doc',
      content: [{ type: 'image_block', attrs: { src: 'https://example.com/pic.png', alt: null, caption: null, sizePreset: 'full', width: null } }],
    }
    const result = await resolveObsidianEmbeds(doc, ctx)
    expect(result.content![0]).toEqual(doc.content![0])
    expect(ctx.onUnresolvedEmbed).not.toHaveBeenCalled()
    expect(ctx.onAttachmentImported).not.toHaveBeenCalled()
  })

  it('processes nested image_block nodes inside a blockquote and a list', async () => {
    const imported: ImportedImageAsset = { src: '.nevo/assets/hash-a.png', hash: 'hash', deduplicated: false, bytes: 1 }
    const ctx = makeCtx({
      resolveAsset: (ref) => (ref === 'a.png' ? 'a.png' : null),
      importAsset: async () => imported,
    })
    const doc: BlockNode = {
      type: 'doc',
      content: [
        {
          type: 'blockquote',
          content: [{ type: 'image_block', attrs: { src: 'obsidian-embed:a.png', alt: null, caption: null, sizePreset: 'full', width: null } }],
        },
        {
          type: 'bullet_list',
          content: [
            {
              type: 'list_item',
              content: [{ type: 'image_block', attrs: { src: 'obsidian-embed:a.png', alt: null, caption: null, sizePreset: 'full', width: null } }],
            },
          ],
        },
      ],
    }
    const result = await resolveObsidianEmbeds(doc, ctx)
    const blockquoteImage = result.content![0].content![0]
    const listImage = result.content![1].content![0].content![0]
    expect(blockquoteImage.type).toBe('image_block')
    expect((blockquoteImage.attrs as { src: string }).src).toBe('.nevo/assets/hash-a.png')
    expect(listImage.type).toBe('image_block')
    expect((listImage.attrs as { src: string }).src).toBe('.nevo/assets/hash-a.png')
    expect(ctx.onAttachmentImported).toHaveBeenCalledTimes(2)
  })

  it('does not mutate the input doc', async () => {
    const doc = imageEmbedDoc('Ghost.png')
    const before = JSON.stringify(doc)
    await resolveObsidianEmbeds(doc, makeCtx())
    expect(JSON.stringify(doc)).toBe(before)
  })
})
