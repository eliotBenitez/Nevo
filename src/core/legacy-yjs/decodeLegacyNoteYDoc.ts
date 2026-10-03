import * as Y from 'yjs'
import { yDocToProsemirrorJSON } from 'y-prosemirror'
import type { Schema } from 'prosemirror-model'

/**
 * Standalone copy of the decode half of `src/editor-core/collaboration/index.ts`
 * (`Y_FRAGMENT_NAME`, `decodePersistedNoteYDoc`, `ResolvedNoteYDoc`), kept for
 * the one-time legacy `.yjs` -> `note.json` migration in `migrateWorkspaceYjs`.
 * This is the only place outside `src/editor-core/collaboration` allowed to
 * import `yjs`/`y-prosemirror` once later phases delete the editor's own Yjs
 * plumbing — see `src/core/legacy-yjs/migrateWorkspaceYjs.ts`. Reachable only
 * through a dynamic `import()` so `yjs` stays out of the startup bundle.
 *
 * Kept semantically identical to the original on purpose: this module still
 * classifies decode failures instead of silently seeding a fallback, for the
 * exact reason the original does (see the doc comment below).
 */
export const LEGACY_Y_FRAGMENT_NAME = 'prosemirror'

function restoreLegacyYDocFromBinary(binary: Uint8Array): Y.Doc {
  const ydoc = new Y.Doc()
  Y.applyUpdate(ydoc, binary)
  return ydoc
}

/** The outcome of decoding a note's persisted `.yjs` bytes. Deliberately does
 *  not seed a fallback doc itself — a corrupted `.yjs` file is the note's
 *  authoritative content, so silently substituting `note.content` for it
 *  would look indistinguishable from an empty note and risk permanently
 *  losing the original bytes on the next write.
 *
 *  `corrupt` and `unsupported` are deliberately distinct: `corrupt` means the
 *  bytes themselves are broken (undecodable, or decode to nothing readable) —
 *  the file is actually damaged. `unsupported` means the bytes decoded fine
 *  and hold a real, complete document that this build's schema just doesn't
 *  recognize (typically a block type from a disabled/missing plugin). */
export type ResolvedLegacyNoteYDoc =
  | { kind: 'restored'; ydoc: Y.Doc }
  | { kind: 'missing' }
  | { kind: 'corrupt'; error: unknown }
  | { kind: 'unsupported'; error: unknown }

/**
 * Classifies a note's persisted Y.Doc bytes without ever silently discarding
 * them — see `ResolvedLegacyNoteYDoc` above and the original
 * `decodePersistedNoteYDoc` in `src/editor-core/collaboration/index.ts` for
 * the full rationale. Semantics kept identical to that original:
 *
 *  - `bytes.length === 0` -> `missing`.
 *  - decoding throws, or the fragment cannot be read -> `corrupt`.
 *  - `bytes.length > 2` but the decoded prosemirror fragment is empty ->
 *    `corrupt` (`<= 2` bytes is what an untouched Y.Doc's own update encodes
 *    to, so that case is `missing`, not `corrupt`).
 *  - the fragment reads back but does not survive round-tripping through the
 *    editor schema (`schema.nodeFromJSON`) -> `unsupported`, not `corrupt`.
 *    Skippable via `validateSchema: false` for callers that cannot supply a
 *    schema reflecting every plugin a note's content might reference (the
 *    workspace-wide migration this module backs is exactly such a caller —
 *    see the comment on the call site in `migrateWorkspaceYjs.ts`).
 */
export function decodeLegacyPersistedNoteYDoc(
  schema: Schema,
  bytes: Uint8Array,
  options: { validateSchema?: boolean } = {},
): ResolvedLegacyNoteYDoc {
  const { validateSchema = true } = options
  if (bytes.length === 0) return { kind: 'missing' }

  let ydoc: Y.Doc
  try {
    ydoc = restoreLegacyYDocFromBinary(bytes)
  } catch (error) {
    return { kind: 'corrupt', error }
  }

  try {
    const fragment = ydoc.getXmlFragment(LEGACY_Y_FRAGMENT_NAME)
    if (fragment.length === 0) {
      if (bytes.length <= 2) {
        ydoc.destroy()
        return { kind: 'missing' }
      }
      throw new Error('Persisted Y.Doc has no readable prosemirror content')
    }
  } catch (error) {
    ydoc.destroy()
    return { kind: 'corrupt', error }
  }

  if (validateSchema) {
    try {
      schema.nodeFromJSON(yDocToProsemirrorJSON(ydoc, LEGACY_Y_FRAGMENT_NAME))
    } catch (error) {
      ydoc.destroy()
      return { kind: 'unsupported', error }
    }
  }

  return { kind: 'restored', ydoc }
}
