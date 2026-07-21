<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { ChevronRight, ExternalLink, FileText, Hash, X } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'
import { useTimeAgo, useDateFormat, refDebounced } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import type { NoteDocument, NoteProperties, NoteStatus, NoteType } from '../../types/note'
import { extractOutline, countWords, extractExternalLinks } from '../composables/useNoteOutline'
import { useGraphStore } from '../../stores/graph'
import { useNoteStore } from '../../stores/note'
import NvSelect from '../../ui/primitives/NvSelect.vue'
import NvDatePicker from '../../ui/primitives/NvDatePicker.vue'
import { systemCommands } from '../../tauri/commands'

interface Props {
  note: NoteDocument | null
  editorRootEl: HTMLElement | null
}

const props = defineProps<Props>()
const emit = defineEmits<{ close: []; 'open-note': [noteId: string] }>()

const { t } = useI18n()
const graphStore = useGraphStore()
const noteStore = useNoteStore()
const { backlinks } = storeToRefs(graphStore)
const tagInput = ref('')

const emptyProperties: NoteProperties = {
  type: null,
  tags: [],
  date: null,
  status: null,
}

// Outline/word-count/links walk the whole document. While the user is typing,
// the note content updates frequently, so debounce the source to avoid
// recomputing these on every keystroke.
const noteContent = computed(() => props.note?.content ?? null)
const debouncedContent = refDebounced(noteContent, 300)
const outline = computed(() => debouncedContent.value ? extractOutline(debouncedContent.value) : [])
const wordCount = computed(() => debouncedContent.value ? countWords(debouncedContent.value) : 0)
const readMinutes = computed(() => Math.max(1, Math.round(wordCount.value / 200)))
const externalLinks = computed(() => debouncedContent.value ? extractExternalLinks(debouncedContent.value) : [])

const updatedAt = computed(() => props.note ? new Date(props.note.updatedAt) : new Date())
const createdAt = computed(() => props.note ? new Date(props.note.createdAt) : new Date())
const updatedAgo = useTimeAgo(updatedAt)
const createdFormatted = useDateFormat(createdAt, 'MMM D, YYYY')
const properties = computed<NoteProperties>(() => props.note?.properties ?? emptyProperties)
const typeValue = computed(() => properties.value.type ?? '')
const statusValue = computed(() => properties.value.status ?? 'none')

const typeOptions = computed(() => [
  { value: '', label: t('workspace.rightPanel.properties.typeNone') },
  { value: 'note', label: t('workspace.rightPanel.properties.types.note') },
  { value: 'task', label: t('workspace.rightPanel.properties.types.task') },
  { value: 'idea', label: t('workspace.rightPanel.properties.types.idea') },
  { value: 'meeting', label: t('workspace.rightPanel.properties.types.meeting') },
  { value: 'project', label: t('workspace.rightPanel.properties.types.project') },
  { value: 'research', label: t('workspace.rightPanel.properties.types.research') },
])

const statusOptions = computed(() => [
  { value: 'none', label: t('workspace.rightPanel.properties.statuses.none') },
  { value: 'draft', label: t('workspace.rightPanel.properties.statuses.draft') },
  { value: 'active', label: t('workspace.rightPanel.properties.statuses.active') },
  { value: 'waiting', label: t('workspace.rightPanel.properties.statuses.waiting') },
  { value: 'done', label: t('workspace.rightPanel.properties.statuses.done') },
])

// TOC-local collapse state (independent from editor)
const tocCollapsed = reactive<Set<number>>(new Set())

const visibleOutline = computed(() => {
  const items = outline.value
  const result: { item: typeof items[0]; hasChildren: boolean; collapsed: boolean }[] = []
  let collapsedLevel: number | null = null

  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    if (collapsedLevel !== null) {
      if (item.level <= collapsedLevel) collapsedLevel = null
      else continue
    }
    const hasChildren = !!items[i + 1] && items[i + 1].level > item.level
    const collapsed = tocCollapsed.has(item.index)
    result.push({ item, hasChildren, collapsed })
    if (collapsed) collapsedLevel = item.level
  }
  return result
})

function toggleTocCollapse(index: number) {
  if (tocCollapsed.has(index)) tocCollapsed.delete(index)
  else tocCollapsed.add(index)
}

function scrollToHeading(index: number) {
  const pm = props.editorRootEl?.querySelector('.ProseMirror')
  if (!pm) return
  pm.querySelectorAll('h1, h2, h3, h4, h5, h6')[index]?.scrollIntoView({ block: 'start', behavior: 'smooth' })
}

async function onOpenLink(url: string) {
  await systemCommands.openExternalUrl(url)
}

function linkDomain(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, '') } catch { return url }
}

function updateType(value: string) {
  noteStore.setPropertiesPatch({ type: value ? value as NoteType : null })
}

function updateStatus(value: string) {
  noteStore.setPropertiesPatch({ status: value ? value as NoteStatus : null })
}

function updateDate(value: string | null) {
  noteStore.setPropertiesPatch({ date: value })
}

function addTags() {
  const tags = tagInput.value.split(',').map(tag => tag.trim()).filter(Boolean)
  if (!tags.length) return
  noteStore.setPropertiesPatch({ tags: [...properties.value.tags, ...tags] })
  tagInput.value = ''
}

function removeTag(index: number) {
  noteStore.setPropertiesPatch({ tags: properties.value.tags.filter((_, tagIndex) => tagIndex !== index) })
}

function onTagKeydown(event: KeyboardEvent) {
  if (event.key !== 'Enter' && event.key !== ',') return
  event.preventDefault()
  addTags()
}
</script>

<template>
  <aside class="right-panel">
    <div class="right-panel__head">
      <Hash :size="13" class="right-panel__head-icon" />
      <span class="right-panel__head-title">{{ t('workspace.rightPanel.outline') }}</span>
      <button type="button" class="right-panel__close" :aria-label="t('workspace.context.cancel')" @click="emit('close')">
        <X :size="14" />
      </button>
    </div>

    <!-- TOC -->
    <div class="right-panel__toc">
      <div v-if="!outline.length" class="right-panel__empty">{{ t('workspace.rightPanel.noHeadings') }}</div>
      <div
        v-for="{ item, hasChildren, collapsed } in visibleOutline"
        :key="item.index"
        class="right-panel__toc-item"
        :class="{ 'is-collapsed': collapsed }"
        :style="{ paddingLeft: `${10 + (item.level - 1) * 12}px` }"
      >
        <button type="button" class="right-panel__toc-chevron" :class="{ 'is-open': !collapsed, 'is-hidden': !hasChildren }" @click.stop="hasChildren && toggleTocCollapse(item.index)">
          <ChevronRight :size="11" />
        </button>
        <span class="right-panel__toc-level">H{{ item.level }}</span>
        <button type="button" class="right-panel__toc-text" @click="scrollToHeading(item.index)">
          {{ item.text || t('workspace.untitledNote') }}
        </button>
      </div>
    </div>

    <!-- Properties -->
    <div class="right-panel__section right-panel__properties">
      <div class="right-panel__section-label">{{ t('workspace.rightPanel.properties.title') }}</div>
      <div class="right-panel__property-row">
        <span class="right-panel__property-label">{{ t('workspace.rightPanel.properties.type') }}</span>
        <NvSelect
          class="right-panel__property-control"
          :model-value="typeValue"
          :options="typeOptions"
          :min-width="132"
          :placeholder="t('workspace.rightPanel.properties.typeNone')"
          :disabled="!note"
          @update:model-value="updateType"
        />
      </div>
      <div class="right-panel__property-row">
        <span class="right-panel__property-label">{{ t('workspace.rightPanel.properties.status') }}</span>
        <NvSelect
          class="right-panel__property-control"
          :model-value="statusValue"
          :options="statusOptions"
          :min-width="132"
          :disabled="!note"
          @update:model-value="updateStatus"
        />
      </div>
      <div class="right-panel__property-row">
        <span class="right-panel__property-label">{{ t('workspace.rightPanel.properties.date') }}</span>
        <NvDatePicker
          class="right-panel__property-control"
          :model-value="properties.date"
          :placeholder="t('workspace.rightPanel.properties.datePlaceholder')"
          :disabled="!note"
          @update:model-value="updateDate"
        />
      </div>
      <div class="right-panel__property-tags" :aria-label="t('workspace.rightPanel.properties.tags')">
        <span
          v-for="(tag, index) in properties.tags"
          :key="`${tag}-${index}`"
          class="right-panel__tag"
        >
          <span class="right-panel__tag-text">{{ tag }}</span>
          <button type="button" class="right-panel__tag-remove" :aria-label="t('workspace.rightPanel.properties.removeTag', { tag })" @click="removeTag(index)">
            <X :size="10" />
          </button>
        </span>
        <input
          v-model="tagInput"
          class="right-panel__tag-input"
          type="text"
          :disabled="!note"
          :placeholder="properties.tags.length ? t('workspace.rightPanel.properties.addTag') : t('workspace.rightPanel.properties.tagsPlaceholder')"
          @keydown="onTagKeydown"
          @blur="addTags"
        >
      </div>
    </div>

    <!-- Metadata -->
    <div class="right-panel__section">
      <div class="right-panel__section-label">{{ t('workspace.rightPanel.metadata') }}</div>
      <div class="right-panel__meta-row"><FileText :size="12" /><span>{{ t('workspace.rightPanel.words', { n: wordCount }) }}</span><span class="right-panel__meta-sep">·</span><span>{{ t('workspace.rightPanel.readTime', { n: readMinutes }) }}</span></div>
      <div class="right-panel__meta-row"><span class="right-panel__meta-key">{{ t('workspace.rightPanel.updated') }}</span><span>{{ updatedAgo }}</span></div>
      <div class="right-panel__meta-row"><span class="right-panel__meta-key">{{ t('workspace.rightPanel.created') }}</span><span>{{ createdFormatted }}</span></div>
    </div>

    <!-- External links -->
    <div class="right-panel__section right-panel__section--scroll">
      <div class="right-panel__section-label">{{ t('workspace.rightPanel.externalLinks') }}</div>
      <div v-if="!externalLinks.length" class="right-panel__empty right-panel__empty--sm">{{ t('workspace.rightPanel.noExternalLinks') }}</div>
      <button v-for="link in externalLinks" :key="link.url" type="button" class="right-panel__link-item" :title="link.url" @click="onOpenLink(link.url)">
        <ExternalLink :size="11" class="right-panel__link-icon" />
        <span class="right-panel__link-text">{{ linkDomain(link.url) }}</span>
      </button>
    </div>

    <!-- Backlinks -->
    <div class="right-panel__section right-panel__section--scroll">
      <div class="right-panel__section-label">{{ t('workspace.rightPanel.backlinks') }}</div>
      <div v-if="!backlinks.length" class="right-panel__empty right-panel__empty--sm">{{ t('workspace.rightPanel.noBacklinks') }}</div>
      <button v-for="bl in backlinks" :key="bl.sourceId" type="button" class="right-panel__backlink-item" @click="emit('open-note', bl.sourceId)">
        <span class="right-panel__backlink-icon">{{ bl.sourceIcon || '📄' }}</span>
        <span class="right-panel__backlink-title">{{ bl.sourceTitle }}</span>
        <span v-if="bl.count > 1" class="right-panel__backlink-count">{{ bl.count }}</span>
      </button>
    </div>
  </aside>
</template>

<style scoped>
.right-panel {
  width: 280px; height: 100%;
  border-left: 1px solid var(--line-1);
  background: var(--glass-1);
  backdrop-filter: blur(28px) saturate(140%);
  -webkit-backdrop-filter: blur(28px) saturate(140%);
  display: flex; flex-direction: column; overflow: hidden;
}

.right-panel__head {
  flex-shrink: 0; height: 42px; display: flex; align-items: center; gap: 7px;
  padding: 0 12px; border-bottom: 1px solid var(--line-1);
}
.right-panel__head-icon { color: var(--text-4); }
.right-panel__head-title { flex: 1; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-4); }
.right-panel__close { width: 24px; height: 24px; display: grid; place-items: center; border: none; border-radius: calc(6px * var(--radius-scale, 1)); background: transparent; color: var(--text-4); cursor: pointer; transition: background-color 120ms ease, color 120ms ease; }
.right-panel__close:hover { background: var(--hover); color: var(--text-1); }

.right-panel__toc { flex: 1; overflow-y: auto; padding: 6px 0; scrollbar-width: thin; scrollbar-color: var(--line-2) transparent; contain: paint; }

.right-panel__toc-item {
  position: relative; width: 100%; height: 28px; display: flex; align-items: center;
  gap: 5px; padding-right: 10px; border-radius: calc(7px * var(--radius-scale, 1)); color: var(--text-2);
  font-size: 12.5px; transition: background-color 120ms ease, color 120ms ease;
}
.right-panel__toc-item:hover { background: var(--hover); color: var(--text-1); }
.right-panel__toc-item.is-collapsed { color: var(--text-4); }
.right-panel__toc-chevron { width: 16px; height: 16px; flex-shrink: 0; display: grid; place-items: center; border: none; background: transparent; color: var(--text-4); cursor: pointer; border-radius: calc(4px * var(--radius-scale, 1)); }
.right-panel__toc-chevron.is-hidden { opacity: 0; pointer-events: none; }
.right-panel__toc-chevron:hover { color: var(--text-2); }
.right-panel__toc-chevron :deep(svg) { transition: transform 180ms ease; transform: rotate(0deg); }
.right-panel__toc-chevron.is-open :deep(svg) { transform: rotate(90deg); }

.right-panel__toc-level { font-size: 9.5px; font-weight: 600; color: var(--text-4); min-width: 16px; flex-shrink: 0; }
.right-panel__toc-text { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; border: none; background: transparent; color: inherit; font-size: inherit; font-family: inherit; text-align: left; cursor: pointer; padding: 0; }

.right-panel__section { flex-shrink: 0; padding: 10px 12px; border-top: 1px solid var(--line-1); display: flex; flex-direction: column; gap: 4px; }
.right-panel__section--scroll { max-height: 160px; overflow-y: auto; scrollbar-width: thin; scrollbar-color: var(--line-2) transparent; contain: paint; }
.right-panel__section-label { font-size: 10.5px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-4); margin-bottom: 4px; }
.right-panel__properties { gap: 7px; }
.right-panel__property-row { min-height: 28px; display: grid; grid-template-columns: 64px minmax(0, 1fr); align-items: center; gap: 8px; }
.right-panel__property-label { font-size: 11.5px; color: var(--text-4); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.right-panel__property-control { min-width: 0; width: 100%; }
.right-panel__property-control :deep(.nv-select__trigger),
.right-panel__property-control :deep(.ndp-trigger) { width: 100%; min-width: 0; height: 28px; }
.right-panel__property-tags {
  min-height: 30px;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 5px;
  padding: 4px 6px;
  border: 1px solid var(--line-1);
  border-radius: calc(7px * var(--radius-scale, 1));
  background: var(--glass-2);
}
.right-panel__tag {
  max-width: 100%;
  min-width: 0;
  height: 21px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 0 3px 0 7px;
  border-radius: calc(5px * var(--radius-scale, 1));
  background: var(--hover);
  color: var(--text-2);
  font-size: 11.5px;
}
.right-panel__tag-text { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.right-panel__tag-remove { width: 15px; height: 15px; flex-shrink: 0; display: grid; place-items: center; border: none; border-radius: calc(4px * var(--radius-scale, 1)); background: transparent; color: var(--text-4); cursor: pointer; padding: 0; }
.right-panel__tag-remove:hover { background: var(--hover-strong); color: var(--text-1); }
.right-panel__tag-input {
  flex: 1 1 78px;
  min-width: 78px;
  height: 22px;
  border: none;
  outline: none;
  background: transparent;
  color: var(--text-2);
  font: inherit;
  font-size: 11.5px;
  padding: 0 2px;
}
.right-panel__tag-input::placeholder { color: var(--text-4); }
.right-panel__tag-input:disabled { cursor: not-allowed; opacity: 0.55; }
.right-panel__meta-row { display: flex; align-items: center; gap: 5px; font-size: 12px; color: var(--text-3); }
.right-panel__meta-key { color: var(--text-4); min-width: 58px; flex-shrink: 0; }
.right-panel__meta-sep { color: var(--text-4); }
.right-panel__empty { padding: 4px 12px; font-size: 12px; color: var(--text-4); }
.right-panel__section .right-panel__empty { padding: 4px 0; }
.right-panel__empty--sm { font-size: 11.5px; }

.right-panel__link-item { width: 100%; height: 26px; display: flex; align-items: center; gap: 6px; padding: 0 2px; border: none; background: transparent; color: var(--text-3); font-size: 12px; text-align: left; cursor: pointer; border-radius: calc(6px * var(--radius-scale, 1)); transition: background-color 120ms ease, color 120ms ease; }
.right-panel__link-item:hover { background: var(--hover); color: var(--text-1); }
.right-panel__link-icon { flex-shrink: 0; color: var(--text-4); }
.right-panel__link-text { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.right-panel__backlink-item { width: 100%; height: 28px; display: flex; align-items: center; gap: 7px; padding: 0 2px; border: none; background: transparent; color: var(--text-2); font-size: 12.5px; text-align: left; cursor: pointer; border-radius: calc(7px * var(--radius-scale, 1)); transition: background-color 120ms ease, color 120ms ease; }
.right-panel__backlink-item:hover { background: var(--hover); color: var(--text-1); }
.right-panel__backlink-icon { font-size: 13px; line-height: 1; flex-shrink: 0; }
.right-panel__backlink-title { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.right-panel__backlink-count { font-size: 10.5px; font-weight: 600; color: var(--text-4); background: var(--hover); padding: 1px 5px; border-radius: calc(4px * var(--radius-scale, 1)); flex-shrink: 0; }
</style>
