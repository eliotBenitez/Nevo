import { computed, nextTick, ref, type Ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'
import type { Router } from 'vue-router'
import { useNoteStore } from '../../../stores/note'
import { useTabsStore } from '../../../stores/tabs'
import { useTreeStore } from '../../../stores/tree'
import { useWorkspaceStore } from '../../../stores/workspace'
import { useMarkdownImport } from '../../../composables/useMarkdownImport'
import { isPluginEnabled } from '../../../utils/system-plugins'
import { formatDateOnly } from '../../../utils/dateOnly'
import type { NoteDocument } from '../../../types/note'
import type { TemplateDocument, TemplateFieldValues } from '../../../types/template'
import { useNotebookCreation } from '../useNotebookCreation'

export interface UseWorkspaceCreationOptions {
  router: Router
  activeNoteId: Readonly<Ref<string | null>>
  activeFolderId: Readonly<Ref<string | null>>
  flushSave: () => Promise<void> | void
  mobileSidebarOpen: Ref<boolean>
}

// Creating and importing notes/folders: title and placement resolution, the
// template picker, the create-folder dialog, and the Obsidian/Notion import
// dialogs' open state.
export function useWorkspaceCreation(options: UseWorkspaceCreationOptions) {
  const { router, activeNoteId, activeFolderId, flushSave, mobileSidebarOpen } = options
  const { t } = useI18n()
  const workspaceStore = useWorkspaceStore()
  const treeStore = useTreeStore()
  const tabsStore = useTabsStore()
  const noteStore = useNoteStore()
  const { settings, plugins } = storeToRefs(workspaceStore)
  const { importMarkdownFile, importMarkdownIntoNote } = useMarkdownImport()

  const templateCreatePickerOpen = ref(false)
  const templateCreateFolderId = ref<string | null>(null)
  const createFolderModalOpen = ref(false)
  const createFolderParentId = ref<string | null>(null)
  const obsidianImportOpen = ref(false)
  const obsidianImportFolderId = ref<string | null>(null)
  const notionImportOpen = ref(false)
  const createFolderTitle = ref('')
  const createFolderError = ref('')
  const templatesEnabled = computed(() => isPluginEnabled(plugins.value, 'nevo.templates'))

  function resolveNoteTitle(): string {
    const pattern = settings.value.workspace.defaultNoteTitlePattern
    const now = new Date()
    if (pattern === 'date') return formatDateOnly(now)
    if (pattern === 'date-time') return `${formatDateOnly(now)} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
    return t('workspace.untitledNote')
  }

  function resolveNotePlacementFolder(): string | null {
    return settings.value.workspace.newNotePlacement === 'root' ? null : activeFolderId.value
  }

  function resolveFolderPlacementFolder(): string | null {
    return settings.value.workspace.newFolderPlacement === 'root' ? null : activeFolderId.value
  }

  async function openCreatedNote(note: NoteDocument | null) {
    if (note) {
      tabsStore.openTab(note.id, note.title, note.icon)
      await router.push(`/workspace/note/${note.id}`)
    }
  }

  const notebookCreation = useNotebookCreation(openCreatedNote)

  async function createPlainNote(folderId: string | null) {
    const icon = settings.value.workspace.defaultNoteIcon || '📄'
    await openCreatedNote(await treeStore.createNote(folderId, resolveNoteTitle(), icon))
  }

  async function createTemplatedNote(folderId: string | null, templateId: string, fieldValues: TemplateFieldValues = {}) {
    const icon = settings.value.workspace.defaultNoteIcon || '📄'
    await openCreatedNote(await treeStore.createNoteFromTemplate(templateId, folderId, resolveNoteTitle(), icon, fieldValues))
  }

  async function createNoteWithWorkspaceDefault(folderId: string | null) {
    mobileSidebarOpen.value = false
    const backend = workspaceStore.backend
    if (!templatesEnabled.value || !backend) {
      await createPlainNote(folderId)
      return
    }

    const templateId = settings.value.workspace.newNoteTemplate || 'blank'
    try {
      const template = await backend.getTemplate(templateId)
      if (template.fields.length === 0) {
        await createTemplatedNote(folderId, template.id)
        return
      }
      templateCreateFolderId.value = folderId
      templateCreatePickerOpen.value = true
    } catch {
      await createPlainNote(folderId)
    }
  }

  async function createNote() {
    await createNoteWithWorkspaceDefault(resolveNotePlacementFolder())
  }

  async function createNoteInFolder(folderId: string) {
    await createNoteWithWorkspaceDefault(folderId)
  }

  async function createNotebook() {
    mobileSidebarOpen.value = false
    await notebookCreation.create(resolveNotePlacementFolder())
  }

  async function handleTemplateCreate(payload: { template: TemplateDocument; fieldValues: TemplateFieldValues }) {
    templateCreatePickerOpen.value = false
    await createTemplatedNote(templateCreateFolderId.value, payload.template.id, payload.fieldValues)
    templateCreateFolderId.value = null
  }
  function closeTemplatePicker() {
    templateCreatePickerOpen.value = false
    templateCreateFolderId.value = null
  }

  async function createFolder(parentId?: string) {
    mobileSidebarOpen.value = false
    createFolderParentId.value = parentId ?? resolveFolderPlacementFolder()
    createFolderTitle.value = ''
    createFolderError.value = ''
    createFolderModalOpen.value = true
  }

  function closeCreateFolderModal() {
    createFolderModalOpen.value = false
    createFolderTitle.value = ''
    createFolderError.value = ''
  }

  async function submitCreateFolder() {
    const title = createFolderTitle.value.trim()
    if (!title) {
      createFolderError.value = t('workspace.createFolderModal.emptyName')
      return
    }
    const icon = settings.value.workspace.defaultFolderIcon || '📁'
    await treeStore.createFolder(createFolderParentId.value, title, icon)
    closeCreateFolderModal()
  }
  function updateCreateFolderTitle(value: string) {
    createFolderTitle.value = value
    createFolderError.value = ''
  }

  async function openImportedNote(noteId: string | null) {
    if (!noteId) return
    const meta = treeStore.noteById.get(noteId)
    tabsStore.openTab(noteId, meta?.title ?? t('workspace.untitledNote'), meta?.icon ?? '📄')
    await router.push(`/workspace/note/${noteId}`)
  }
  async function importMd() {
    mobileSidebarOpen.value = false
    await openImportedNote(await importMarkdownFile(resolveNotePlacementFolder()))
  }
  function openObsidianImport() {
    mobileSidebarOpen.value = false
    obsidianImportFolderId.value = resolveNotePlacementFolder()
    obsidianImportOpen.value = true
  }
  function openNotionImport() {
    mobileSidebarOpen.value = false
    if (workspaceStore.backendKind === 'local') notionImportOpen.value = true
  }
  async function importMdToFolder(folderId: string) {
    mobileSidebarOpen.value = false
    await openImportedNote(await importMarkdownFile(folderId))
  }
  async function importMdIntoNote(noteId: string) {
    mobileSidebarOpen.value = false
    const isActiveImport = activeNoteId.value === noteId
    if (isActiveImport) await flushSave()
    const ok = await importMarkdownIntoNote(noteId, {
      beforePersist: isActiveImport
        ? async () => {
            noteStore.clearNote()
            await nextTick()
          }
        : undefined,
    })
    if (ok && activeNoteId.value === noteId) await noteStore.loadNote(noteId, { force: true })
  }

  return {
    templateCreatePickerOpen,
    createFolderModalOpen,
    createFolderTitle,
    createFolderError,
    obsidianImportOpen,
    obsidianImportFolderId,
    notionImportOpen,
    resolveNoteTitle,
    createNote,
    createNoteInFolder,
    createNotebook,
    handleTemplateCreate,
    closeTemplatePicker,
    createFolder,
    closeCreateFolderModal,
    submitCreateFolder,
    updateCreateFolderTitle,
    importMd,
    openObsidianImport,
    openNotionImport,
    importMdToFolder,
    importMdIntoNote,
  }
}
