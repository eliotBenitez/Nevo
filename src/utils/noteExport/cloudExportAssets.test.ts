import { describe, expect, it } from 'vitest'
import { prepareCloudExportAssets, type CloudAssetReader } from './cloudExportAssets'
import type { NoteDocument } from '../../types/note'

const CLOUD = 'cloud-asset:'

function note(content: NoteDocument['content']): NoteDocument {
  return {
    id: 'note-1',
    title: 'Note',
    icon: '📄',
    folderId: null,
    createdAt: '',
    updatedAt: '',
    properties: { type: null, tags: [], date: null, status: null },
    content,
  }
}

const reader = (contentType = 'image/png'): CloudAssetReader =>
  async src => ({ bytes: new TextEncoder().encode(`bytes:${src}`), contentType })

describe('prepareCloudExportAssets', () => {
  it('rewrites cloud references to workspace-shaped paths so serializers name the file the same way', async () => {
    const doc = note({
      type: 'doc',
      content: [{ type: 'image', attrs: { src: `${CLOUD}abc-123` } }],
    })

    const { note: prepared, inlineAssets } = await prepareCloudExportAssets(doc, reader())

    const src = prepared.content.content![0].attrs!.src as string
    expect(src).toBe('.nevo/assets/cloud-asset-1.png')
    // The serializers take the basename; it must match the written file.
    expect(src.split('/').pop()).toBe(inlineAssets[0].name)
  })

  it('carries the decrypted bytes as base64 and by name', async () => {
    const doc = note({
      type: 'doc',
      content: [{ type: 'image', attrs: { src: `${CLOUD}abc` } }],
    })

    const { inlineAssets, bytesByName } = await prepareCloudExportAssets(doc, reader())

    expect(inlineAssets).toHaveLength(1)
    expect(atob(inlineAssets[0].bytesBase64)).toBe(`bytes:${CLOUD}abc`)
    expect(new TextDecoder().decode(bytesByName.get('cloud-asset-1.png'))).toBe(`bytes:${CLOUD}abc`)
  })

  it('picks the extension from the content type', async () => {
    const doc = note({ type: 'doc', content: [{ type: 'image', attrs: { src: `${CLOUD}a` } }] })

    for (const [contentType, extension] of [
      ['image/jpeg', 'jpg'],
      ['image/svg+xml; charset=utf-8', 'svg'],
      ['application/pdf', 'pdf'],
      ['application/x-unknown', 'bin'],
    ] as const) {
      const { inlineAssets } = await prepareCloudExportAssets(
        structuredClone(doc),
        reader(contentType),
      )
      expect(inlineAssets[0].name).toBe(`cloud-asset-1.${extension}`)
    }
  })

  it('walks nested content and reuses one file for a repeated reference', async () => {
    const doc = note({
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'image', attrs: { src: `${CLOUD}same` } }] },
        {
          type: 'callout',
          content: [
            { type: 'image', attrs: { src: `${CLOUD}same` } },
            { type: 'image', attrs: { src: `${CLOUD}other` } },
          ],
        },
      ],
    })

    const { note: prepared, inlineAssets } = await prepareCloudExportAssets(doc, reader())

    expect(inlineAssets.map(a => a.name)).toEqual(['cloud-asset-1.png', 'cloud-asset-2.png'])
    const first = prepared.content.content![0].content![0].attrs!.src
    const repeat = prepared.content.content![1].content![0].attrs!.src
    expect(repeat).toBe(first)
  })

  it('leaves non-cloud sources untouched', async () => {
    const doc = note({
      type: 'doc',
      content: [
        { type: 'image', attrs: { src: '.nevo/assets/local.png' } },
        { type: 'image', attrs: { src: 'https://example.com/remote.png' } },
      ],
    })

    const { note: prepared, inlineAssets } = await prepareCloudExportAssets(doc, reader())

    expect(inlineAssets).toEqual([])
    expect(prepared.content.content![0].attrs!.src).toBe('.nevo/assets/local.png')
    expect(prepared.content.content![1].attrs!.src).toBe('https://example.com/remote.png')
  })

  it('degrades to a missing image rather than failing the whole export', async () => {
    const doc = note({
      type: 'doc',
      content: [
        { type: 'image', attrs: { src: `${CLOUD}gone` } },
        { type: 'image', attrs: { src: `${CLOUD}fine` } },
      ],
    })
    const partial: CloudAssetReader = async src =>
      src.endsWith('gone') ? null : { bytes: new Uint8Array([1]), contentType: 'image/png' }

    const { note: prepared, inlineAssets } = await prepareCloudExportAssets(doc, partial)

    expect(inlineAssets).toHaveLength(1)
    // The unreadable one keeps its original src and simply has no file written.
    expect(prepared.content.content![0].attrs!.src).toBe(`${CLOUD}gone`)
    expect(prepared.content.content![1].attrs!.src).toBe('.nevo/assets/cloud-asset-1.png')
  })

  it('does nothing when the note has no cloud assets', async () => {
    const doc = note({ type: 'doc', content: [{ type: 'paragraph' }] })
    let calls = 0
    const counting: CloudAssetReader = async () => { calls++; return null }

    const { inlineAssets, bytesByName } = await prepareCloudExportAssets(doc, counting)

    expect(calls).toBe(0)
    expect(inlineAssets).toEqual([])
    expect(bytesByName.size).toBe(0)
  })
})
