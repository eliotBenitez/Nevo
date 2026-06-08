<script setup lang="ts">
import { computed, ref, watch, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import { useWorkspaceStore } from '../../../stores/workspace'
import type { NoteMeta, FolderMeta } from '../../../types/note'

interface PickerNote {
  id: string
  title: string
  icon: string
}

const props = defineProps<{
  open: boolean
  query: string
  activeIndex: number
  menuStyle: Record<string, string>
  currentNoteId?: string | null
}>()

const emit = defineEmits<{
  select: [note: PickerNote]
  itemMousedown: [event: MouseEvent]
}>()

const menuRef = ref<HTMLDivElement | null>(null)

function selectActive(): boolean {
  const note = filteredNotes.value[clampedActiveIndex.value]
  if (!note) return false
  emit('select', note)
  return true
}

defineExpose({ menuRef, selectActive })

const workspaceStore = useWorkspaceStore()
const { t } = useI18n()

function collectNotes(folders: FolderMeta[], out: NoteMeta[]) {
  for (const folder of folders) {
    out.push(...folder.notes)
    collectNotes(folder.children, out)
  }
}

const allNotes = computed<PickerNote[]>(() => {
  const manifest = workspaceStore.manifest
  if (!manifest) return []
  const notes: NoteMeta[] = [...manifest.rootNotes]
  collectNotes(manifest.tree, notes)
  return notes
    .filter(n => n.id !== props.currentNoteId)
    .map(n => ({ id: n.id, title: n.title || t('workspace.untitledNote'), icon: n.icon }))
})

const filteredNotes = computed<PickerNote[]>(() => {
  const q = props.query.toLowerCase().trim()
  if (!q) return allNotes.value.slice(0, 12)
  return allNotes.value
    .filter(n => n.title.toLowerCase().includes(q))
    .slice(0, 12)
})

const clampedActiveIndex = computed(() => {
  const count = filteredNotes.value.length
  if (count === 0) return 0
  return ((props.activeIndex % count) + count) % count
})

watch(() => clampedActiveIndex.value, () => {
  nextTick(() => {
    const el = menuRef.value
    if (!el) return
    const active = el.querySelector<HTMLButtonElement>('.link-picker__item.is-active')
    active?.scrollIntoView({ block: 'nearest' })
  })
})
</script>

<template>
  <div v-if="open && filteredNotes.length > 0" ref="menuRef" class="editor-overlay link-picker" :style="menuStyle">
    <div class="link-picker__header">
      <span class="link-picker__header-label">[[</span>
      <span class="link-picker__header-query">{{ query || t('noteEmbed.searchPlaceholder') }}</span>
      <span class="nv-kbd link-picker__header-esc">{{ t('common.keyboard.esc') }}</span>
    </div>
    <button
      v-for="(note, index) in filteredNotes"
      :key="note.id"
      class="link-picker__item"
      :class="{ 'is-active': index === clampedActiveIndex }"
      @mousedown="emit('itemMousedown', $event)"
      @click="emit('select', note)"
    >
      <span class="link-picker__icon">{{ note.icon }}</span>
      <span class="link-picker__title">{{ note.title }}</span>
    </button>
  </div>
</template>
