import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { NoteDocument } from '../../types/note'
import { useTreeStore } from '../../stores/tree'
import { useToast } from '../../ui/composables/useToast'

export function useNotebookCreation(onCreated: (note: NoteDocument) => void | Promise<void>) {
  const { t } = useI18n()
  const treeStore = useTreeStore()
  const { showToast } = useToast()
  const submitting = ref(false)

  async function create(folderId: string | null): Promise<void> {
    if (submitting.value) return
    submitting.value = true
    try {
      const note = await treeStore.createNotebook(folderId, t('workspace.untitledNote'), '📓', 'ruled')
      if (!note) throw new Error(t('app.notebook.createError'))
      await onCreated(note)
    } catch (cause) {
      showToast({
        message: cause instanceof Error && cause.message ? cause.message : t('app.notebook.createError'),
        variant: 'error',
      })
    } finally {
      submitting.value = false
    }
  }

  return { submitting, create }
}
