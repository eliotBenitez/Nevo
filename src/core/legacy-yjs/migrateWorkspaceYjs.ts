import { yDocToProsemirrorJSON } from 'y-prosemirror'
import { nevoBaseSchema } from '../../editor-core/schema'
import { canvasSnapshotsEqual, jsonEqual } from '../canvas/equality'
import { appLogger } from '../../utils/logger'
import type { NoteDocument } from '../../types/note'
import {
  decodeLegacyPersistedNoteYDoc,
  LEGACY_Y_FRAGMENT_NAME,
  type ResolvedLegacyNoteYDoc,
} from './decodeLegacyNoteYDoc'
import { readLegacyCanvasSnapshot } from './readLegacyCanvas'

export type LegacyYjsSkipReason = Exclude<ResolvedLegacyNoteYDoc['kind'], 'restored'>

export interface LegacyYjsMigrationSkip {
  noteId: string
  reason: LegacyYjsSkipReason
}

export interface LegacyYjsMigrationFailure {
  noteId: string
  error: unknown
}

export interface LegacyYjsMigrationResult {
  migrated: number
  unchanged: number
  skipped: LegacyYjsMigrationSkip[]
  failed: LegacyYjsMigrationFailure[]
  /** Whether `.nevo/collab` was renamed aside. `false` whenever any note
   *  failed (see `migrateWorkspaceYjs`'s doc comment) or there was nothing to
   *  archive. */
  archived: boolean
  archivePath: string | null
}

export interface ArchiveLegacyCollabDirResult {
  archived: boolean
  archivePath: string | null
}

export interface LegacyYjsMigrationProgress {
  completed: number
  total: number
  noteId: string
}

/** Injected so this module stays framework-agnostic and testable without a
 *  Tauri runtime. `loadYjsState` and `archiveLegacyCollabDir` mirror
 *  `collabCommands`; `loadNote`/`saveNote` mirror a workspace backend's note
 *  read/write (see `src/core/workspace-backend/localBackend.ts`). */
export interface LegacyYjsMigrationDeps {
  workspacePath: string
  /** Every note id to migrate, e.g. `collectWorkspaceNoteIds(workspace)` from
   *  `src/core/plugins/marketplaceMigration.ts`. */
  noteIds: string[]
  loadNote: (noteId: string) => Promise<NoteDocument>
  saveNote: (note: NoteDocument) => Promise<void>
  loadYjsState: (workspacePath: string, noteId: string) => Promise<Uint8Array>
  archiveLegacyCollabDir: (workspacePath: string, noteIds: string[]) => Promise<ArchiveLegacyCollabDirResult>
  onProgress?: (progress: LegacyYjsMigrationProgress) => void
}

function skipLogMessage(noteId: string, reason: LegacyYjsSkipReason): string {
  switch (reason) {
    case 'missing': return `No legacy Y.Doc state for note ${noteId}; note.json is already authoritative`
    case 'corrupt': return `Legacy Y.Doc for note ${noteId} is unreadable; leaving note.json untouched`
    case 'unsupported': return `Legacy Y.Doc for note ${noteId} holds a block type this build's schema doesn't recognize; leaving note.json untouched`
  }
}

async function migrateOneNote(
  deps: Pick<LegacyYjsMigrationDeps, 'workspacePath' | 'loadNote' | 'saveNote' | 'loadYjsState'>,
  noteId: string,
  result: LegacyYjsMigrationResult,
): Promise<void> {
  const bytes = await deps.loadYjsState(deps.workspacePath, noteId)
  // The workspace's plugin-extended schema is unknown here — this migration
  // runs across every note in the workspace, not one plugin's notes, so a
  // note using ANY plugin's block types would look "unsupported" against
  // `nevoBaseSchema` even though it is perfectly valid. See the identical
  // reasoning in `src/core/plugins/marketplaceMigration.ts`'s `loadYjsState`
  // call site. This means an `unsupported` result can never actually be
  // produced by this call — the kind is kept in the type only for parity
  // with the original `decodePersistedNoteYDoc` and is handled defensively
  // below in case that ever changes.
  const decoded = decodeLegacyPersistedNoteYDoc(nevoBaseSchema, bytes, { validateSchema: false })

  if (decoded.kind !== 'restored') {
    result.skipped.push({ noteId, reason: decoded.kind })
    await appLogger.warn({
      source: 'legacy-yjs-migration',
      event: 'note-skipped',
      message: skipLogMessage(noteId, decoded.kind),
      workspacePath: deps.workspacePath,
      payload: { noteId, reason: decoded.kind },
    })
    return
  }

  try {
    const content = yDocToProsemirrorJSON(decoded.ydoc, LEGACY_Y_FRAGMENT_NAME) as NoteDocument['content']
    const canvas = readLegacyCanvasSnapshot(decoded.ydoc)

    const note = await deps.loadNote(noteId)
    const contentChanged = !jsonEqual(note.content, content)
    const canvasChanged = canvas !== undefined && !canvasSnapshotsEqual(note.canvas, canvas)

    if (!contentChanged && !canvasChanged) {
      result.unchanged += 1
      return
    }

    const updatedNote: NoteDocument = {
      ...note,
      content,
      ...(canvas !== undefined ? { canvas } : {}),
    }
    await deps.saveNote(updatedNote)
    result.migrated += 1
  } finally {
    decoded.ydoc.destroy()
  }
}

/**
 * One-time fold of every note's disk-backed Y.Doc (`.nevo/collab/<id>.yjs`)
 * into `note.json`, ahead of later phases that stop reading `.yjs` at all.
 * The Y.Doc is treated as authoritative wherever it disagrees with
 * `note.json` — exactly the semantics the editor already uses when opening a
 * note locally (see `resolveLocalNoteYDoc`) — so a note is only rewritten
 * when its decoded content or canvas snapshot actually differs.
 *
 * A per-note failure (decode succeeds but loading/saving `note.json` throws,
 * or any other unexpected error) is caught and recorded in `result.failed`;
 * it never aborts the rest of the workspace. `.nevo/collab` is archived
 * (renamed aside, never deleted — see `archiveLegacyCollabDir`) only when
 * `result.failed` is empty, so a partially-failed run leaves the legacy
 * directory in place for the next run to retry against. `missing` /
 * `unsupported` / `corrupt` notes are not failures: `note.json` is left
 * untouched and counted in `result.skipped`, and they do not block
 * archiving — there is nothing more this run could safely do for them.
 */
export async function migrateWorkspaceYjs(deps: LegacyYjsMigrationDeps): Promise<LegacyYjsMigrationResult> {
  const result: LegacyYjsMigrationResult = {
    migrated: 0,
    unchanged: 0,
    skipped: [],
    failed: [],
    archived: false,
    archivePath: null,
  }

  const total = deps.noteIds.length
  for (let index = 0; index < total; index += 1) {
    const noteId = deps.noteIds[index]
    try {
      await migrateOneNote(deps, noteId, result)
    } catch (error) {
      result.failed.push({ noteId, error })
      await appLogger.warn({
        source: 'legacy-yjs-migration',
        event: 'note-failed',
        message: `Failed to migrate legacy Y.Doc for note ${noteId}`,
        workspacePath: deps.workspacePath,
        error,
        payload: { noteId },
      })
    }
    deps.onProgress?.({ completed: index + 1, total, noteId })
  }

  if (result.failed.length === 0) {
    const archiveResult = await deps.archiveLegacyCollabDir(deps.workspacePath, deps.noteIds)
    result.archived = archiveResult.archived
    result.archivePath = archiveResult.archivePath
  }

  return result
}
