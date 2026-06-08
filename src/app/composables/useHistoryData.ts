import { computed, ref, watch } from 'vue'
import { noteCommands } from '../../tauri/commands'
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
  workspacePath: string | null
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
    () => { const p = getProps(); return { open: p.open, workspacePath: p.workspacePath, manifest: p.manifest, preselectedNoteId: p.preselectedNoteId, activeNoteId: p.activeNoteId } },
    async ({ open, workspacePath, manifest }) => {
      if (!open) { confirmRestoreOpen.value = false; restoreError.value = null; return }
      if (!workspacePath || !manifest) { resetState(); filesError.value = t('workspace.history.errors.noWorkspace'); return }
      await loadFiles(workspacePath, manifest)
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
    () => { const p = getProps(); return { open: p.open, workspacePath: p.workspacePath, noteId: selectedNoteId.value, snapshotId: selectedSnapshotId.value, paneMode: paneMode.value, activeUpdatedAt: p.activeNote?.updatedAt } },
    async ({ open, workspacePath, noteId, snapshotId }) => {
      if (!open || !workspacePath || !noteId || !snapshotId) {
        selectedSnapshot.value = null; currentNote.value = null
        previewError.value = null; compareError.value = null
        return
      }
      await loadPane(workspacePath, noteId, snapshotId)
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

  async function loadFiles(workspacePath: string, manifest: WorkspaceManifest) {
    const token = ++loadToken
    resetState(); filesLoading.value = true
    try {
      const notes = collectNotes(manifest)
      const results = await Promise.all(notes.map(async (note) => {
        try { return { note, snapshots: await noteCommands.listNoteSnapshots(workspacePath, note.id) } }
        catch { return { note, snapshots: [] as NoteSnapshotMeta[] } }
      }))
      if (token !== loadToken) return
      const nextSnapshotsMap: Record<string, NoteSnapshotMeta[]> = {}
      const nextFiles: HistoryFileListItem[] = []
      for (const { note, snapshots } of results) {
        if (!snapshots.length) continue
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

  async function loadPane(workspacePath: string, noteId: string, snapshotId: string) {
    const token = ++loadToken
    paneLoading.value = true; previewError.value = null; compareError.value = null
    selectedSnapshot.value = null; currentNote.value = null
    try {
      const snapshot = await noteCommands.loadNoteSnapshot(workspacePath, noteId, snapshotId)
      if (token !== loadToken) return
      selectedSnapshot.value = snapshot
    } catch {
      if (token !== loadToken) return
      previewError.value = t('workspace.history.errors.loadSnapshot')
      paneLoading.value = false; return
    }
    try {
      const p = getProps()
      currentNote.value = p.activeNote?.id === noteId && p.activeNote ? p.activeNote : await noteCommands.loadNote(workspacePath, noteId)
    } catch {
      if (token !== loadToken) return
      compareError.value = t('workspace.history.errors.loadCurrent')
    } finally {
      if (token === loadToken) paneLoading.value = false
    }
  }

  async function confirmRestore() {
    const p = getProps()
    if (!p.workspacePath || !selectedNoteId.value || !selectedSnapshotId.value) return
    restoring.value = true; restoreError.value = null
    try {
      const restored = await noteCommands.restoreNoteSnapshot(p.workspacePath, selectedNoteId.value, selectedSnapshotId.value)
      onRestored(restored)
      historyFiles.value = historyFiles.value.map(f => f.id !== restored.id ? f : { ...f, title: restored.title, icon: restored.icon, folderId: restored.folderId, updatedAt: restored.updatedAt })
      const snapshots = await noteCommands.listNoteSnapshots(p.workspacePath, restored.id)
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
