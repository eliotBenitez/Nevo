import { computed, ref, watch, type Ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useWorkspaceStore } from '../../stores/workspace'
import { useNoteStore } from '../../stores/note'
import { useTreeStore } from '../../stores/tree'
import type { NoteDocument, NoteSnapshotMeta } from '../../types/note'
import {
  buildNoteHistoryDiff,
  type NoteHistoryDiff,
} from '../../utils/noteHistory'
import { buildHistoryPreview, type HistoryPreviewBlock } from '../../utils/noteHistoryPreview'
import { decodeNoteFormat, notebookPageSvg } from '../../core/notebook'
import type { NotebookPaperKind } from '../../core/notebook/types'

/**
 * Owns all note-history state for the `/workspace/note/:noteId/history` route:
 * the snapshot timeline, which one is selected, its loaded body, and the diff
 * built against the current note. Components under src/features/history only
 * render what this returns.
 *
 * The "current note" side of the diff is loaded directly from the backend so
 * viewing history does not mount or change the editor's active note.
 */
export function useNoteHistory(noteId: Ref<string>) {
  const { t } = useI18n()
  const workspaceStore = useWorkspaceStore()
  const noteStore = useNoteStore()
  const treeStore = useTreeStore()

  const snapshots = ref<NoteSnapshotMeta[]>([])
  const currentNote = ref<NoteDocument | null>(null)
  const currentNoteLoading = ref(true)
  const currentNoteError = ref<string | null>(null)
  const snapshotsLoading = ref(false)
  const snapshotsError = ref<string | null>(null)
  const selectedSnapshotId = ref<string | null>(null)

  const selectedSnapshot = ref<NoteDocument | null>(null)
  const snapshotLoading = ref(false)
  const snapshotError = ref<string | null>(null)

  const restoring = ref(false)
  const restoreError = ref<string | null>(null)
  const confirmation = ref<{ snapshotId: string; createdAt: string } | null>(null)
  const recoverySnapshotId = ref<string | null>(null)
  const restoreWarning = ref<string | null>(null)
  const restoreSucceeded = ref(false)
  const copying = ref(false)
  const copyError = ref<string | null>(null)

  let snapshotsToken = 0
  let snapshotToken = 0
  let currentNoteToken = 0
  let selectionRevision = 0

  const diff = computed<NoteHistoryDiff | null>(() => {
    if (!currentNote.value || !selectedSnapshot.value) return null
    return buildNoteHistoryDiff(currentNote.value, selectedSnapshot.value)
  })

  const previewBlocks = computed<HistoryPreviewBlock[]>(() =>
    selectedSnapshot.value ? buildHistoryPreview(selectedSnapshot.value.content) : [],
  )
  const notebookPreviewPages = computed(() => {
    const note = selectedSnapshot.value
    if (!note) return []
    const format = decodeNoteFormat(note)
    if (format.status !== 'notebook') return []
    return format.snapshot.pages.map((page, index) => ({
      id: page.id,
      source: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(notebookPageSvg(page, true))}`,
      marks: page.objects.length,
      alt: t('notebook.pages.accessibleSummary', {
        page: index + 1,
        marks: page.objects.length,
        paper: t(`notebook.paper.${page.paper.kind}`),
      }),
    }))
  })

  const selectedSnapshotLoaded = computed(() =>
    !!selectedSnapshotId.value
      && snapshots.value.some(snapshot => snapshot.id === selectedSnapshotId.value)
      && selectedSnapshot.value !== null
      && !snapshotsLoading.value
      && !snapshotsError.value
      && !snapshotLoading.value
      && !snapshotError.value,
  )

  async function loadSnapshots() {
    const backend = workspaceStore.backend
    const id = noteId.value
    const token = ++snapshotsToken
    snapshotsLoading.value = true
    snapshotsError.value = null
    try {
      if (!backend) throw new Error('No active workspace backend')
      const list = await backend.listNoteSnapshots(id)
      if (token !== snapshotsToken) return
      snapshots.value = [...list].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      if (!snapshots.value.some(entry => entry.id === selectedSnapshotId.value)) {
        selectedSnapshotId.value = snapshots.value[0]?.id ?? null
      }
    } catch {
      if (token !== snapshotsToken) return
      snapshots.value = []
      selectedSnapshotId.value = null
      selectedSnapshot.value = null
      confirmation.value = null
      snapshotsError.value = t('workspace.history.timeline.error')
    } finally {
      if (token === snapshotsToken) snapshotsLoading.value = false
    }
  }

  async function loadCurrentNote() {
    const backend = workspaceStore.backend
    const id = noteId.value
    const token = ++currentNoteToken
    currentNote.value = null
    currentNoteError.value = null
    currentNoteLoading.value = true
    try {
      if (!backend) throw new Error('No active workspace backend')
      const note = await backend.loadNote(id)
      if (token === currentNoteToken) {
        if (note.id !== id) throw new Error('Loaded a different note')
        currentNote.value = note
      }
    } catch {
      if (token === currentNoteToken) {
        currentNote.value = null
        currentNoteError.value = t('workspace.history.currentNoteError')
      }
    } finally {
      if (token === currentNoteToken) currentNoteLoading.value = false
    }
  }

  async function loadSelectedSnapshot() {
    const backend = workspaceStore.backend
    const id = noteId.value
    const snapshotId = selectedSnapshotId.value
    const token = ++snapshotToken
    selectedSnapshot.value = null
    snapshotError.value = null
    if (!backend || !snapshotId) return
    snapshotLoading.value = true
    try {
      const snapshot = await backend.loadNoteSnapshot(id, snapshotId)
      if (token !== snapshotToken) return
      selectedSnapshot.value = snapshot
    } catch {
      if (token !== snapshotToken) return
      snapshotError.value = t('workspace.history.errorLoadingSnapshot')
    } finally {
      if (token === snapshotToken) snapshotLoading.value = false
    }
  }

  watch(noteId, () => {
    selectedSnapshotId.value = null
    restoreSucceeded.value = false
    void loadSnapshots()
    void loadCurrentNote()
  }, { immediate: true })

  watch(() => workspaceStore.backend, () => { void loadSnapshots(); void loadCurrentNote() })

  watch(selectedSnapshotId, () => {
    confirmation.value = null
    restoreError.value = null
    void loadSelectedSnapshot()
  }, { immediate: true })

  function selectSnapshot(id: string) {
    if (id === selectedSnapshotId.value) return
    // Only an explicit user pick retires a stale "restore succeeded"
    // announcement — not the internal reselect confirmRestore does to land
    // on the recovery snapshot (that reselect goes straight through the
    // ref, not this function, so it can't immediately undo the flag it
    // depends on setting).
    restoreSucceeded.value = false
    selectionRevision += 1
    selectedSnapshotId.value = id
  }

  /**
   * Opens the restore confirmation, binding it to the snapshot that is
   * selected *right now*. Confirming later restores this bound snapshot
   * regardless of what the user has since selected in the timeline — see
   * the `selectedSnapshotId` watch above, which closes the confirmation the
   * moment the selection changes, so a stale confirm can never fire against
   * the wrong version.
   */
  function requestRestore() {
    if (!selectedSnapshotLoaded.value) return
    const snapshotId = selectedSnapshotId.value
    if (!snapshotId) return
    const meta = snapshots.value.find(entry => entry.id === snapshotId)
    if (!meta) return
    confirmation.value = { snapshotId, createdAt: meta.createdAt }
  }

  function cancelRestore() {
    if (restoring.value) return
    confirmation.value = null
  }

  /**
   * Restores the snapshot bound by `requestRestore`, not the current
   * selection (see that function's doc). On success, selects the
   * pre-restore recovery snapshot so reversing the restore is one click —
   * but only if the user hasn't picked a different version while the
   * restore was in flight (or `loadSnapshots` itself had to drop the
   * selection because it no longer exists). A user's own newer choice is
   * never overwritten. Reloads the timeline since restoring writes a fresh
   * snapshot of the pre-restore state (see restore_note_snapshot on the
   * Rust side). A failure keeps the confirmation and the selection so the
   * user can retry.
   */
  async function confirmRestore() {
    if (!confirmation.value || restoring.value) return
    const id = noteId.value
    const snapshotId = confirmation.value.snapshotId
    const selectionAtRequest = selectedSnapshotId.value
    restoring.value = true
    restoreError.value = null
    restoreWarning.value = null
    restoreSucceeded.value = false
    try {
      const result = await noteStore.restoreSnapshot(id, snapshotId)
      await loadCurrentNote()
      confirmation.value = null
      recoverySnapshotId.value = result.recoverySnapshotId
      restoreWarning.value = result.warnings.length ? t('workspace.history.restoreWarning') : null
      const selectionBeforeReload = selectedSnapshotId.value
      const revisionBeforeReload = selectionRevision
      await loadSnapshots()
      const reloadClearedSelection = selectionRevision === revisionBeforeReload
        && selectedSnapshotId.value !== selectionBeforeReload
      if (selectedSnapshotId.value === selectionAtRequest || reloadClearedSelection) {
        selectedSnapshotId.value = result.recoverySnapshotId
      }
      restoreSucceeded.value = true
    } catch (error) {
      restoreError.value = error instanceof Error && error.message
        ? t('workspace.history.restoreErrorWithMessage', { message: error.message })
        : t('workspace.history.restoreErrorGeneric')
    } finally {
      restoring.value = false
    }
  }

  async function retrySnapshots() {
    await loadSnapshots()
  }

  async function retrySnapshot() {
    await loadSelectedSnapshot()
  }

  async function copySelectedSnapshot(): Promise<string | null> {
    const backend = workspaceStore.backend
    const snapshot = selectedSnapshot.value
    if (!backend || !snapshot || !selectedSnapshotLoaded.value || copying.value) return null

    copying.value = true
    copyError.value = null
    let created: NoteDocument | null = null
    try {
      const folderId = treeStore.noteById.get(noteId.value)?.folderId ?? snapshot.folderId
      const title = t('workspace.history.copyTitle', {
        title: snapshot.title || t('workspace.untitledNote'),
      })
      const format = decodeNoteFormat(snapshot)
      if (snapshot.documentKind === 'notebook') {
        if (format.status !== 'notebook') throw new Error(t('app.notebook.readOnlyDescription'))
        const paper: NotebookPaperKind = format.snapshot.pages[0]?.paper.kind ?? 'ruled'
        created = await treeStore.createNotebook(folderId, title, snapshot.icon || '📓', paper)
      } else if (format.status === 'document') {
        created = await treeStore.createNote(folderId, title, snapshot.icon || '📄')
      } else {
        throw new Error(t('app.notebook.readOnlyDescription'))
      }
      if (!created) throw new Error(t('workspace.history.copyErrorGeneric'))

      const updatedAt = new Date().toISOString()
      await backend.saveNote({
        ...snapshot,
        id: created.id,
        title,
        folderId,
        createdAt: created.createdAt,
        updatedAt,
      })
      noteStore.invalidateNoteCache(created.id)
      treeStore.syncNoteMeta(created.id, { title, icon: snapshot.icon || '📄' }, updatedAt)
      void workspaceStore.refreshSidebarNotePreviews()
      return created.id
    } catch (error) {
      const message = error instanceof Error && error.message
        ? t('workspace.history.copyErrorWithMessage', { message: error.message })
        : t('workspace.history.copyErrorGeneric')
      if (created) {
        // The note was created but a later step failed (e.g. the write of
        // its content). Undo the create so it doesn't linger as an
        // incomplete, empty note; if the rollback itself fails, surface the
        // orphan's id so the user can find and remove it manually.
        try {
          await treeStore.deleteNote(created.id)
          await treeStore.permanentlyDeleteFromTrash(created.id)
          copyError.value = message
        } catch {
          copyError.value = t('workspace.history.copyRollbackFailed', { noteId: created.id })
        }
      } else {
        copyError.value = message
      }
      return null
    } finally {
      copying.value = false
    }
  }

  return {
    snapshots,
    snapshotsLoading,
    snapshotsError,
    selectedSnapshotId,
    selectSnapshot,
    selectedSnapshot,
    snapshotLoading,
    snapshotError,
    currentNote,
    currentNoteLoading,
    currentNoteError,
    diff,
    previewBlocks,
    notebookPreviewPages,
    selectedSnapshotLoaded,
    restoring,
    restoreError,
    confirmation,
    requestRestore,
    cancelRestore,
    confirmRestore,
    recoverySnapshotId,
    restoreWarning,
    restoreSucceeded,
    retrySnapshots,
    retrySnapshot,
    retryCurrentNote: loadCurrentNote,
    copying,
    copyError,
    copySelectedSnapshot,
  }
}
