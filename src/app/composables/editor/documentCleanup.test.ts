import { afterEach, describe, expect, it, vi } from 'vitest'
import { Schema, type Node } from 'prosemirror-model'
import { EditorState } from 'prosemirror-state'
import { collectRemovedDatabaseIds, collectDatabaseIds } from '../../../editor-core/databaseCleanup'
import type { DatabaseRepository } from '../../../features/database/databaseRepository'
import { collectRemovedAssetSrcs, createDatabaseCleanup } from './documentCleanup'

vi.mock('../../../editor-core/databaseCleanup', () => ({
  collectRemovedDatabaseIds: vi.fn(() => [] as string[]),
  collectDatabaseIds: vi.fn(() => new Set<string>()),
}))

const mockedRemovedIds = vi.mocked(collectRemovedDatabaseIds)
const mockedLiveIds = vi.mocked(collectDatabaseIds)

// Minimal schema: a block-atom `image` carrying a `src` attribute is all
// `collectRemovedAssetSrcs` inspects.
const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: { group: 'block', content: 'inline*' },
    image: { group: 'block', atom: true, attrs: { src: { default: '' } } },
    text: { group: 'inline' },
  },
})

function img(src: string) {
  return schema.nodes.image.create({ src })
}
function para(text: string) {
  return schema.nodes.paragraph.create(null, text ? schema.text(text) : undefined)
}
function docOf(...children: Node[]) {
  return schema.nodes.doc.create(null, children)
}
function nodePos(doc: Node, predicate: (node: Node) => boolean): number {
  let found = -1
  doc.descendants((node, pos) => {
    if (found === -1 && predicate(node)) found = pos
  })
  return found
}

describe('collectRemovedAssetSrcs', () => {
  it('reports an asset src removed by a transaction', () => {
    const doc = docOf(img('.nevo/assets/a.png'), para('x'), img('.nevo/assets/b.png'))
    const state = EditorState.create({ schema, doc })
    const pos = nodePos(doc, (n) => n.attrs.src === '.nevo/assets/a.png')
    const tr = state.tr.delete(pos, pos + 1)

    expect(collectRemovedAssetSrcs(doc, tr)).toEqual(['.nevo/assets/a.png'])
  })

  it('returns nothing for a plain text edit (no asset in changed range)', () => {
    const doc = docOf(para('hello'))
    const state = EditorState.create({ schema, doc })
    const tr = state.tr.delete(2, 4)

    expect(collectRemovedAssetSrcs(doc, tr)).toEqual([])
  })

  it('does not report an asset that still exists elsewhere after the change', () => {
    const doc = docOf(img('.nevo/assets/a.png'), img('.nevo/assets/a.png'))
    const state = EditorState.create({ schema, doc })
    const tr = state.tr.delete(0, 1)

    expect(collectRemovedAssetSrcs(doc, tr)).toEqual([])
  })

  it('ignores non-workspace-asset srcs', () => {
    const doc = docOf(img('https://example.com/x.png'))
    const state = EditorState.create({ schema, doc })
    const tr = state.tr.delete(0, 1)

    expect(collectRemovedAssetSrcs(doc, tr)).toEqual([])
  })
})

describe('createDatabaseCleanup', () => {
  afterEach(() => {
    mockedRemovedIds.mockReset()
    mockedLiveIds.mockReset()
    mockedRemovedIds.mockReturnValue([])
    mockedLiveIds.mockReturnValue(new Set())
  })

  function repo() {
    return { deleteDatabase: vi.fn().mockResolvedValue(undefined) } as unknown as DatabaseRepository & {
      deleteDatabase: ReturnType<typeof vi.fn>
    }
  }
  const anyDoc = {} as Node

  it('deletes records for a removed, un-restored database block on flush', () => {
    const cleanup = createDatabaseCleanup()
    const repository = repo()
    cleanup.setRepository(repository)

    mockedRemovedIds.mockReturnValue(['db1'])
    mockedLiveIds.mockReturnValue(new Set()) // not restored in next doc
    cleanup.recordRemoved(anyDoc, {} as never, anyDoc)

    cleanup.flush(anyDoc, '/ws')
    expect(repository.deleteDatabase).toHaveBeenCalledWith('db1')
  })

  it('cancels the deletion when the block is restored in the same transaction', () => {
    const cleanup = createDatabaseCleanup()
    const repository = repo()
    cleanup.setRepository(repository)

    mockedRemovedIds.mockReturnValue(['db1'])
    mockedLiveIds.mockReturnValue(new Set(['db1'])) // restored (undo/paste)
    cleanup.recordRemoved(anyDoc, {} as never, anyDoc)

    cleanup.flush(anyDoc, '/ws')
    expect(repository.deleteDatabase).not.toHaveBeenCalled()
  })

  it('keeps a block that is present again in the live doc at flush time', () => {
    const cleanup = createDatabaseCleanup()
    const repository = repo()
    cleanup.setRepository(repository)

    mockedRemovedIds.mockReturnValue(['db1'])
    mockedLiveIds.mockReturnValueOnce(new Set()) // recordRemoved: not restored yet
    cleanup.recordRemoved(anyDoc, {} as never, anyDoc)

    mockedLiveIds.mockReturnValueOnce(new Set(['db1'])) // flush: present again
    cleanup.flush(anyDoc, '/ws')
    expect(repository.deleteDatabase).not.toHaveBeenCalled()
  })

  it('is a no-op when no repository is set', () => {
    const cleanup = createDatabaseCleanup()
    mockedRemovedIds.mockReturnValue(['db1'])
    cleanup.recordRemoved(anyDoc, {} as never, anyDoc)
    expect(() => cleanup.flush(anyDoc, null)).not.toThrow()
  })
})
