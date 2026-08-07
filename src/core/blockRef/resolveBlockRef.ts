// Cross-note block reference resolution (Phase 3b/3c of block references).
//
// A block reference points at a specific block inside a specific note via a
// stable `attrs.id` (see `src/editor-core/schema/blockIdAttr.ts` and
// `commands/blockId.ts` `ensureBlockId`). Resolving one means: load the
// target note's current content and walk it for the block carrying that id.
//
// `note.content` (not the disk-backed Y.Doc) is the correct read target here:
// a note's live editor content is periodically flushed into `note.content`
// via `serializeDocToNoteContent` (see `src/editor-core/serialization.ts`),
// and `backend.loadNote` is the only read path available outside a live
// EditorView. Assigned block ids are never null, so they always survive the
// `stripNullBlockIds` pass that strips only unset ones.
import type { WorkspaceBackend } from '../workspace-backend/types'
import type { BlockNode } from '../../types/note'

export interface BlockRefTarget {
  noteId: string
  blockId: string
}

export type BlockRefResolution =
  | { status: 'ok'; node: BlockNode; sourceTitle: string }
  | { status: 'note-missing' }
  | { status: 'block-missing'; sourceTitle: string }

const BLOCK_REF_SCHEME = 'nevo://block/'

/** Encodes a block reference target into the clipboard/paste token used by
 *  the "copy block reference" block-handle action and the paste-to-embed
 *  handler. Not a real URL — just a stable, greppable, round-trippable token. */
export function encodeBlockRef(target: BlockRefTarget): string {
  return `${BLOCK_REF_SCHEME}${encodeURIComponent(target.noteId)}/${encodeURIComponent(target.blockId)}`
}

/** Tolerant decode: trims surrounding whitespace (clipboard text often carries
 *  a trailing newline) and returns `null` for anything that isn't exactly the
 *  `nevo://block/<noteId>/<blockId>` shape — never throws on junk input. */
export function decodeBlockRef(text: string): BlockRefTarget | null {
  const trimmed = text.trim()
  if (!trimmed.startsWith(BLOCK_REF_SCHEME)) return null

  const rest = trimmed.slice(BLOCK_REF_SCHEME.length)
  const parts = rest.split('/')
  if (parts.length !== 2) return null

  const decodePart = (part: string): string => {
    try {
      return decodeURIComponent(part)
    } catch {
      return part
    }
  }

  const noteId = decodePart(parts[0])
  const blockId = decodePart(parts[1])
  if (!noteId || !blockId) return null

  return { noteId, blockId }
}

/** Recursively walks a note's content tree (plain `BlockNode` JSON, not a live
 *  ProseMirror doc) for the first node whose `attrs.id` matches. Depth-first,
 *  pre-order — matches `PMNode.descendants` traversal order used elsewhere
 *  for block ids (see `plugins/blockIds.ts`). */
export function findBlockById(content: unknown, blockId: string): BlockNode | null {
  if (!content || typeof content !== 'object' || Array.isArray(content)) return null

  const node = content as BlockNode
  if (typeof node.type !== 'string') return null

  if (node.attrs && node.attrs.id === blockId) return node

  if (Array.isArray(node.content)) {
    for (const child of node.content) {
      const found = findBlockById(child, blockId)
      if (found) return found
    }
  }

  return null
}

/** Resolves a block reference against a workspace backend. A failed
 *  `loadNote` (missing/deleted note, IO error) is treated as `note-missing`
 *  rather than propagating the error, since a stale reference pointing at a
 *  deleted note is an expected, recoverable state for the embed to render. */
export async function resolveBlockRef(backend: WorkspaceBackend, target: BlockRefTarget): Promise<BlockRefResolution> {
  let note
  try {
    note = await backend.loadNote(target.noteId)
  } catch {
    return { status: 'note-missing' }
  }

  const sourceTitle = note.title || ''
  const found = findBlockById(note.content, target.blockId)
  if (!found) return { status: 'block-missing', sourceTitle }

  return { status: 'ok', node: found, sourceTitle }
}
