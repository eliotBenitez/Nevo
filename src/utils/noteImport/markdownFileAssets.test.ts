import { describe, expect, it, vi } from 'vitest'
import type { BlockNode } from '../../types/note'
import { parseMarkdownToBlockNode } from './markdownParser'
import { resolveMarkdownFileAssets } from './markdownFileAssets'

function imageSrcs(doc: BlockNode): string[] {
  if (doc.type === 'image_block') return [String(doc.attrs?.src)]
  return (doc.content ?? []).flatMap(imageSrcs)
}

describe('resolveMarkdownFileAssets', () => {
  it('imports images relative to the Markdown file and keeps external or missing ones', async () => {
    const { content } = parseMarkdownToBlockNode(
      [
        '![a](./images/my%20pic.png)',
        '',
        '![b](images\\b.png)',
        '',
        '![c](https://example.com/c.png)',
        '',
        '![d](missing.png)',
      ].join('\n'),
      '',
      undefined,
      { extractTitle: false },
    )
    const importAsset = vi.fn(async (relativePath: string) =>
      relativePath === 'missing.png'
        ? null
        : { src: `.nevo/assets/${relativePath.split('/').pop()}`, hash: 'h', deduplicated: false, bytes: 1 })

    const doc = await resolveMarkdownFileAssets(content, importAsset)

    expect(importAsset.mock.calls.map(([path]) => path)).toEqual(['images/my pic.png', 'images/b.png', 'missing.png'])
    expect(imageSrcs(doc)).toEqual([
      '.nevo/assets/my pic.png',
      '.nevo/assets/b.png',
      'https://example.com/c.png',
      'missing.png',
    ])
  })
})
