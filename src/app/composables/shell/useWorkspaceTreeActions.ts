import { computed, ref, type Ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'
import type { Router } from 'vue-router'
import { useNoteStore } from '../../../stores/note'
import { useTreeStore } from '../../../stores/tree'
import { useWorkspaceStore } from '../../../stores/workspace'
import { useToast } from '../../../ui/composables/useToast'
import { useNoteExport } from '../../../composables/useNoteExport'
import { useTreeContextMenu } from '../useTreeContextMenu'

export interface UseWorkspaceTreeActionsOptions {
  router: Router
  activeNoteId: Readonly<Ref<string | null>>
  activeFolderId: Readonly<Ref<string | null>>
  flushSave: () => Promise<void> | void
  closeNoteTab: (noteId: string) => string | null
  openHistory: (noteId?: string | null) => Promise<void>
  runWorkspaceSearch: (seed?: string) => Promise<void>
}

// Wires the sidebar/tree context-menu actions to the stores, the router and
// the note exporters, and exposes the export preview dialogs' state.
export function useWorkspaceTreeActions(options: UseWorkspaceTreeActionsOptions) {
  const { router, activeNoteId, activeFolderId, flushSave, closeNoteTab, openHistory, runWorkspaceSearch } = options
  const { t } = useI18n()
  const { showToast } = useToast()
  const workspaceStore = useWorkspaceStore()
  const treeStore = useTreeStore()
  const noteStore = useNoteStore()
  const { manifest, settings } = storeToRefs(workspaceStore)
  const { activeNote } = storeToRefs(noteStore)
  const {
    exportAsMarkdown,
    exportAsHtml,
    exportAsDocx,
    exportAsTypst,
    exportAsPdf,
    pdfPreview,
    closePdfPreview,
    docxPreview,
    closeDocxPreview,
    saveDocxWithOptions,
  } = useNoteExport()
  const renameInputRef = ref<HTMLInputElement | null>(null)

  const { renameModal, onTreeAction, handleRequestExport, submitRename, closeRenameModal } = useTreeContextMenu(
    {
      settings,
      manifest,
      activeNoteId,
      activeFolderId,
      activeNote,
      workspacePath: computed(() => workspaceStore.activePath),
      getBackend: () => workspaceStore.backend,
      treeOps: {
        deleteNote: treeStore.deleteNote,
        restoreFromTrash: treeStore.restoreFromTrash,
        deleteFolder: treeStore.deleteFolder,
        renameFolder: treeStore.renameFolder,
        renameNote: treeStore.renameNote,
        syncNoteMeta: treeStore.syncNoteMeta,
      },
      clearNote: noteStore.clearNote,
      closeNoteTab,
      setTitle: noteStore.setTitle,
      flushSave,
      t,
      onUnsupportedExport: () => showToast({ message: t('app.notebook.unsupportedTextExport'), variant: 'error' }),
      renameInputRef,
    },
    {
      openHistory,
      runSearch: async (seed) => { await runWorkspaceSearch(seed) },
      navigateToNote: async (noteId) => { await router.push(`/workspace/note/${noteId}`) },
      navigateToWorkspaceRoot: async () => { await router.push('/workspace') },
      exportAsMarkdown,
      exportAsHtml,
      exportAsDocx: async (note, path) => { exportAsDocx(note, path) },
      exportAsTypst,
      exportAsPdf,
    },
  )

  return {
    renameModal,
    onTreeAction,
    handleRequestExport,
    submitRename,
    closeRenameModal,
    pdfPreview,
    closePdfPreview,
    docxPreview,
    closeDocxPreview,
    saveDocxWithOptions,
  }
}
