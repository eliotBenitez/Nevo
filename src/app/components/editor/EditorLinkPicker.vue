<script setup lang="ts">
import { computed, ref, watch, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import { useWorkspaceStore } from '../../../stores/workspace'
import type { NoteMeta, FolderMeta } from '../../../types/note'
import { parseWikiQuery } from '../../../editor-core'

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
  create: [payload: { noteTitle: string; anchor: string | null; alias: string | null }]
  itemMousedown: [event: MouseEvent]
}>()

const menuRef = ref<HTMLDivElement | null>(null)

const parsed = computed(() => parseWikiQuery(props.query))
const noteTitleQuery = computed(() => parsed.value.noteTitle)

const createEnabled = computed(() => noteTitleQuery.value.length > 0)

function selectActive(): boolean {
  // When there are matches, Enter selects the active one.
  if (filteredNotes.value.length > 0) {
    const note = filteredNotes.value[clampedActiveIndex.value]
    if (!note) return false
    emit('select', note)
    return true
  }
  // Otherwise, if a title has been typed, Enter creates a new note.
  if (createEnabled.value) {
    emit('create', {
      noteTitle: noteTitleQuery.value,
      anchor: parsed.value.anchor,
      alias: parsed.value.alias,
    })
    return true
  }
  return false
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
  const q = noteTitleQuery.value.toLowerCase().trim()
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

function onCreateClick(event: MouseEvent) {
  if (!createEnabled.value) return
  emit('itemMousedown', event)
  emit('create', {
    noteTitle: noteTitleQuery.value,
    anchor: parsed.value.anchor,
    alias: parsed.value.alias,
  })
}

const aliasHint = computed(() => {
  const { anchor, alias } = parsed.value
  if (anchor && alias) return t('editor.linkPicker.aliasAnchorHint', { anchor, alias })
  if (anchor) return t('editor.linkPicker.anchorHint', { anchor })
  if (alias) return t('editor.linkPicker.aliasHint', { alias })
  return ''
})
</script>

<template>
  <div v-if="open && (filteredNotes.length > 0 || createEnabled)" ref="menuRef" class="editor-overlay link-picker" :style="menuStyle">
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
    <button
      v-if="createEnabled"
      class="link-picker__item link-picker__create"
      :class="{ 'is-active': filteredNotes.length === 0 }"
      :title="t('editor.linkPicker.createNote', { title: noteTitleQuery })"
      @mousedown="emit('itemMousedown', $event)"
      @click="onCreateClick"
    >
      <span class="link-picker__icon link-picker__create-icon">✨</span>
      <span class="link-picker__title">{{ t('editor.linkPicker.createNote', { title: noteTitleQuery }) }}</span>
    </button>
    <div v-if="aliasHint" class="link-picker__hint">{{ aliasHint }}</div>
  </div>
</template>
