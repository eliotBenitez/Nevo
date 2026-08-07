import { computed, ref, watch } from 'vue'
import { useWorkspaceStore } from '../../stores/workspace'
import type { WorkspaceBackend } from '../../core/workspace-backend'
import type { FolderMeta, NoteDocument, NoteMeta, NoteSnapshotMeta } from '../../types/note'
import type { WorkspaceManifest } from '../../types/workspace'
import {
  buildNoteHistoryDiff,
  filterHistoryFiles,
  normalizeHistoryBlocks,
  pickInitialHistoryNoteId,
  type HistoryFileListItem,
} from '../../utils/noteHistory'

type HistoryPaneMode = 'preview' | 'compare'

interface HistoryProps {
  open: boolean
  manifest: WorkspaceManifest | null
  activeNoteId: string | null
  activeNote: NoteDocument | null
  preselectedNoteId: string | null
}

export function useHistoryData(
  getProps: () => HistoryProps,
  onRestored: (note: NoteDocument) => void,
  t: (key: string, params?: Record<string, unknown>) => string,
) {
  // History is served by whichever backend owns the workspace: snapshots are
  // files on disk locally and encrypted blobs on the relay for a cloud
  // workspace, which has no path to key them by.
  const workspaceStore = useWorkspaceStore()
  const searchQuery = ref('')
  const selectedNoteId = ref<string | null>(null)
  const selectedSnapshotId = ref<string | null>(null)
  const paneMode = ref<HistoryPaneMode>('preview')
  const filesLoading = ref(false)
  const filesError = ref<string | null>(null)
  const paneLoading = ref(false)
  const previewError = ref<string | null>(null)
  const compareError = ref<string | null>(null)
  const restoreError = ref<string | null>(null)
  const restoring = ref(false)
  const confirmRestoreOpen = ref(false)
  const historyFiles = ref<HistoryFileListItem[]>([])
  const snapshotsByNoteId = ref<Record<string, NoteSnapshotMeta[]>>({})
  const selectedSnapshot = ref<NoteDocument | null>(null)
  const currentNote = ref<NoteDocument | null>(null)
  let loadToken = 0

  const filteredFiles = computed(() => filterHistoryFiles(historyFiles.value, searchQuery.value))
  const selectedSnapshots = computed(() => selectedNoteId.value ? (snapshotsByNoteId.value[selectedNoteId.value] ?? []) : [])
  const previewBlocks = computed(() => selectedSnapshot.value ? normalizeHistoryBlocks(selectedSnapshot.value.content) : [])
  const compareDiff = computed(() => {
    if (!selectedSnapshot.value || !currentNote.value) return null
    return buildNoteHistoryDiff(currentNote.value, selectedSnapshot.value)
  })

  watch(
    () => { const p = getProps(); return { open: p.open, backend: workspaceStore.backend, manifest: p.manifest, preselectedNoteId: p.preselectedNoteId, activeNoteId: p.activeNoteId } },
    async ({ open, backend, manifest }) => {
      if (!open) { confirmRestoreOpen.value = false; restoreError.value = null; return }
      if (!backend || !manifest) { resetState(); filesError.value = t('workspace.history.errors.noWorkspace'); return }
      await loadFiles(backend, manifest)
    },
    { immediate: true, deep: true },
  )

  watch(filteredFiles, (files) => {
    if (!getProps().open) return
    if (!files.length) { selectedNoteId.value = null; selectedSnapshotId.value = null; return }
    if (!files.some(f => f.id === selectedNoteId.value)) selectedNoteId.value = files[0]?.id ?? null
  })

  watch(selectedNoteId, (noteId) => {
    confirmRestoreOpen.value = false
    restoreError.value = null
    selectedSnapshotId.value = noteId ? (snapshotsByNoteId.value[noteId]?.[0]?.id ?? null) : null
  })

  watch(
    () => { const p = getProps(); return { open: p.open, backend: workspaceStore.backend, noteId: selectedNoteId.value, snapshotId: selectedSnapshotId.value, paneMode: paneMode.value, activeUpdatedAt: p.activeNote?.updatedAt } },
    async ({ open, backend, noteId, snapshotId }) => {
      if (!open || !backend || !noteId || !snapshotId) {
        selectedSnapshot.value = null; currentNote.value = null
        previewError.value = null; compareError.value = null
        return
      }
      await loadPane(backend, noteId, snapshotId)
    },
    { immediate: true },
  )

  function resetState() {
    historyFiles.value = []; snapshotsByNoteId.value = {}
    selectedNoteId.value = null; selectedSnapshotId.value = null
    selectedSnapshot.value = null; currentNote.value = null
    searchQuery.value = ''; paneMode.value = 'preview'
    filesError.value = null; previewError.value = null; compareError.value = null
  }

  async function loadFiles(backend: WorkspaceBackend, manifest: WorkspaceManifest) {
    const token = ++loadToken
    resetState(); filesLoading.value = true
    try {
      const notes = collectNotes(manifest)
      const entries = await backend.listAllNoteSnapshots()
      const entriesByNoteId = new Map(entries.map(entry => [entry.noteId, entry.snapshots]))
      if (token !== loadToken) return
      const nextSnapshotsMap: Record<string, NoteSnapshotMeta[]> = {}
      const nextFiles: HistoryFileListItem[] = []
      for (const note of notes) {
        const snapshots = entriesByNoteId.get(note.id)
        if (!snapshots?.length) continue
        nextSnapshotsMap[note.id] = snapshots
        nextFiles.push({ id: note.id, title: note.title, icon: note.icon, folderId: note.folderId, updatedAt: note.updatedAt, snapshotCount: snapshots.length, latestSnapshotAt: snapshots[0]?.createdAt ?? note.updatedAt })
      }
      historyFiles.value = nextFiles.sort((a, b) => b.latestSnapshotAt.localeCompare(a.latestSnapshotAt))
      snapshotsByNoteId.value = nextSnapshotsMap
      filesError.value = null
      const p = getProps()
      selectedNoteId.value = pickInitialHistoryNoteId(historyFiles.value.map(f => f.id), { preselectedNoteId: p.preselectedNoteId, activeNoteId: p.activeNoteId })
    } catch {
      if (token !== loadToken) return
      filesError.value = t('workspace.history.errors.loadFiles')
    } finally {
      if (token === loadToken) filesLoading.value = false
    }
  }

  async function loadPane(backend: WorkspaceBackend, noteId: string, snapshotId: string) {
    const token = ++loadToken
    paneLoading.value = true; previewError.value = null; compareError.value = null
    selectedSnapshot.value = null; currentNote.value = null
    try {
      const snapshot = await backend.loadNoteSnapshot(noteId, snapshotId)
      if (token !== loadToken) return
      selectedSnapshot.value = snapshot
    } catch {
      if (token !== loadToken) return
      previewError.value = t('workspace.history.errors.loadSnapshot')
      paneLoading.value = false; return
    }
    try {
      const p = getProps()
      // The comparison needs the note's real body, which on cloud is not part
      // of loadNote — see WorkspaceBackend.loadNoteWithContent.
      currentNote.value = p.activeNote?.id === noteId && p.activeNote ? p.activeNote : await backend.loadNoteWithContent(noteId)
    } catch {
      if (token !== loadToken) return
      compareError.value = t('workspace.history.errors.loadCurrent')
    } finally {
      if (token === loadToken) paneLoading.value = false
    }
  }

  async function confirmRestore() {
    const backend = workspaceStore.backend
    if (!backend || !selectedNoteId.value || !selectedSnapshotId.value) return
    restoring.value = true; restoreError.value = null
    try {
      const restored = await backend.restoreNoteSnapshot(selectedNoteId.value, selectedSnapshotId.value)
      onRestored(restored)
      historyFiles.value = historyFiles.value.map(f => f.id !== restored.id ? f : { ...f, title: restored.title, icon: restored.icon, folderId: restored.folderId, updatedAt: restored.updatedAt })
      const snapshots = await backend.listNoteSnapshots(restored.id)
      snapshotsByNoteId.value = { ...snapshotsByNoteId.value, [restored.id]: snapshots }
      historyFiles.value = historyFiles.value.map(f => f.id !== restored.id ? f : { ...f, snapshotCount: snapshots.length, latestSnapshotAt: snapshots[0]?.createdAt ?? f.latestSnapshotAt }).sort((a, b) => b.latestSnapshotAt.localeCompare(a.latestSnapshotAt))
      selectedSnapshotId.value = snapshots[0]?.id ?? null
      currentNote.value = restored
      confirmRestoreOpen.value = false
    } catch {
      restoreError.value = t('workspace.history.errors.restore')
    } finally {
      restoring.value = false
    }
  }

  function collectNotes(manifest: WorkspaceManifest): NoteMeta[] {
    const notes = [...manifest.rootNotes]
    const walk = (folders: FolderMeta[]) => { for (const f of folders) { notes.push(...f.notes); walk(f.children) } }
    walk(manifest.tree)
    return notes
  }

  return {
    searchQuery, selectedNoteId, selectedSnapshotId, paneMode,
    filesLoading, filesError, paneLoading, previewError, compareError,
    restoreError, restoring, confirmRestoreOpen,
    historyFiles, filteredFiles, selectedSnapshots, previewBlocks, compareDiff,
    selectedSnapshot, confirmRestore,
  }
}
