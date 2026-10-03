import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { i18n } from '../../i18n'
import type { TrashedItem } from '../../types/workspace'
import { useWorkspaceStore } from '../../stores/workspace'
import { useTreeStore } from '../../stores/tree'
import { useConfirmDialog } from '../../ui/composables/useConfirmDialog'
import { daysUntilPurge, retentionTone, type RetentionTone } from '../../utils/archive/retention'
import { groupArchiveItems, type ArchiveGroup } from '../../utils/archive/grouping'

export type { ArchiveGroup }

export interface ArchiveItemViewModel {
  item: TrashedItem
  title: string
  parentLabel: string
  deletedLabel: string
  daysLeft: number | null
  tone: RetentionTone
}

export function useArchiveItems() {
  let t: (key: string, params?: Record<string, unknown>) => string
  try {
    const vueI18n = useI18n()
    t = (key, params) => vueI18n.t(key, (params ?? {}) as Record<string, string | number>)
  } catch {
    t = (key, params) => i18n.global.t(key, (params ?? {}) as Record<string, string | number>)
  }

  const workspaceStore = useWorkspaceStore()
  const treeStore = useTreeStore()
  const { confirm } = useConfirmDialog()

  const searchQuery = ref('')
  const selectedId = ref<string | null>(null)

  const retentionDays = computed(() => (
    workspaceStore.settings?.files?.trashRetentionDays ?? 30
  ))

  const count = computed(() => workspaceStore.manifest?.trash?.length ?? 0)

  const items = computed<ArchiveItemViewModel[]>(() => {
    const rawList = workspaceStore.manifest?.trash ?? []
    const sorted = [...rawList].sort(
      (a, b) => new Date(b.deletedAt).getTime() - new Date(a.deletedAt).getTime(),
    )

    const query = searchQuery.value.toLowerCase().trim()
    const matched = query
      ? sorted.filter(item => (item.title || '').toLowerCase().includes(query))
      : sorted

    const folders = treeStore.folderById

    return matched.map((item) => {
      const parentFolder = item.originalParentId ? folders.get(item.originalParentId) : undefined
      const parentLabel = parentFolder ? parentFolder.title : t('workspace.trash.rootFolder')
      const daysLeft = daysUntilPurge(item.deletedAt, retentionDays.value)
      const tone = retentionTone(daysLeft)
      const relativeTime = workspaceStore.getRelativeTime(item.deletedAt)
      const deletedLabel = t('workspace.trash.deletedRelative', { time: relativeTime })
      const title = item.title || t('editor.titlePlaceholder')

      return {
        item,
        title,
        parentLabel,
        deletedLabel,
        daysLeft,
        tone,
      }
    })
  })

  const groups = computed<ArchiveGroup<ArchiveItemViewModel>[]>(() => (
    groupArchiveItems(items.value)
  ))

  const selectedItem = computed<ArchiveItemViewModel | null>(() => (
    items.value.find(i => i.item.id === selectedId.value) ?? null
  ))

  watch(
    items,
    (newList, oldList) => {
      if (newList.length === 0) {
        selectedId.value = null
        return
      }
      if (selectedId.value && newList.some(item => item.item.id === selectedId.value)) {
        return
      }
      if (selectedId.value && oldList && oldList.length > 0) {
        const oldIndex = oldList.findIndex(item => item.item.id === selectedId.value)
        if (oldIndex >= 0) {
          if (oldIndex < newList.length) {
            selectedId.value = newList[oldIndex]!.item.id
            return
          }
          selectedId.value = newList[newList.length - 1]!.item.id
          return
        }
      }
      selectedId.value = newList[0]?.item.id ?? null
    },
    { immediate: true, flush: 'sync' },
  )

  function select(id: string | null) {
    selectedId.value = id
  }

  async function restore(id: string): Promise<boolean> {
    await treeStore.restoreFromTrash(id)
    return true
  }

  async function deleteForever(id: string): Promise<boolean> {
    const confirmed = await confirm({
      message: t('workspace.trash.deletePermanentlyConfirm'),
      confirmLabel: t('confirmDialog.delete'),
      variant: 'danger',
    })
    if (confirmed) {
      await treeStore.permanentlyDeleteFromTrash(id)
      return true
    }
    return false
  }

  async function emptyArchive(): Promise<boolean> {
    const confirmed = await confirm({
      message: t('workspace.trash.emptyConfirmCount', { count: count.value }),
      confirmLabel: t('workspace.trash.emptyAction'),
      variant: 'danger',
    })
    if (confirmed) {
      await treeStore.emptyTrash()
      return true
    }
    return false
  }

  return {
    searchQuery,
    retentionDays,
    count,
    items,
    groups,
    selectedId,
    selectedItem,
    select,
    restore,
    deleteForever,
    emptyArchive,
  }
}
