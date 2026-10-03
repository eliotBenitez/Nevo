<script setup lang="ts">
import { computed, defineAsyncComponent, reactive, ref } from 'vue'
import { ChevronRight, ExternalLink, FileText, X } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'
import { refDebounced } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import type { NoteDocument, NoteProperties, NoteStatus, NoteType } from '../../types/note'
import { extractOutline, countWords, extractExternalLinks } from '../composables/useNoteOutline'
import { useGraphStore } from '../../stores/graph'
import { useNoteStore } from '../../stores/note'
import { useWorkspaceStore } from '../../stores/workspace'
import NvSelect from '../../ui/primitives/NvSelect.vue'
import NvDatePicker from '../../ui/primitives/NvDatePicker.vue'
import { systemCommands } from '../../tauri/commands'

const LocalGraphPanel = defineAsyncComponent(() => import('../../features/graph/LocalGraphPanel.vue'))

interface Props {
  note: NoteDocument | null
  editorRootEl: HTMLElement | null
}

const props = defineProps<Props>()
const emit = defineEmits<{ close: []; 'open-note': [noteId: string]; 'open-graph': [] }>()

const { t, locale } = useI18n()
const graphStore = useGraphStore()
const noteStore = useNoteStore()
const workspaceStore = useWorkspaceStore()

type PanelTab = 'document' | 'links' | 'graph'
const PANEL_TABS: PanelTab[] = ['document', 'links', 'graph']
const activeTab = ref<PanelTab>('document')

function focusTab(tab: PanelTab) {
  activeTab.value = tab
  document.getElementById(`right-panel-tab-${tab}`)?.focus()
}

// Roving tabindex: arrow keys move between tabs, Home/End jump to the ends.
function onTabKeydown(event: KeyboardEvent) {
  const index = PANEL_TABS.indexOf(activeTab.value)
  if (event.key === 'ArrowRight') focusTab(PANEL_TABS[(index + 1) % PANEL_TABS.length])
  else if (event.key === 'ArrowLeft') focusTab(PANEL_TABS[(index - 1 + PANEL_TABS.length) % PANEL_TABS.length])
  else if (event.key === 'Home') focusTab(PANEL_TABS[0])
  else if (event.key === 'End') focusTab(PANEL_TABS[PANEL_TABS.length - 1])
  else return
  event.preventDefault()
}
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

const updatedAgo = computed(() => props.note ? workspaceStore.getRelativeTime(props.note.updatedAt) : '')
const createdFormatted = computed(() => {
  if (!props.note) return ''
  return new Intl.DateTimeFormat(locale.value, { day: 'numeric', month: 'short', year: 'numeric' })
    .format(new Date(props.note.createdAt))
})
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
  <aside class="right-panel tw:w-[296px] tw:h-full tw:border-l-0 tw:bg-(--frame-bg) tw:flex tw:flex-col tw:overflow-x-hidden tw:overflow-y-auto tw:[scrollbar-width:thin] tw:[scrollbar-color:var(--border-default)_transparent]">
    <div class="right-panel__head tw:sticky tw:top-0 tw:z-[1] tw:flex-shrink-0 tw:flex tw:items-center tw:gap-1.5 tw:pt-2 tw:pr-2 tw:pb-1.5 tw:pl-3 tw:bg-(--frame-bg)">
      <div class="right-panel__tabs tw:flex-1 tw:min-w-0 tw:flex tw:gap-0.5 tw:p-0.5 tw:rounded-[calc(8px*var(--radius-scale,1))] tw:bg-[color-mix(in_oklab,var(--frame-bg)_92%,var(--text-primary))]" role="tablist" :aria-label="t('workspace.rightPanel.tabs.label')">
        <button
          v-for="tab in PANEL_TABS"
          :id="`right-panel-tab-${tab}`"
          :key="tab"
          type="button"
          role="tab"
          class="right-panel__tab tw:flex-1 tw:min-w-0 tw:h-7 tw:px-2 tw:border-0 tw:rounded-[calc(6px*var(--radius-scale,1))] tw:font-medium tw:text-[12.5px] tw:font-nv-ui tw:cursor-pointer tw:truncate tw:transition-[background-color,color,box-shadow] tw:duration-[120ms] tw:ease-[ease] tw:hover:text-content-primary tw:focus-visible:outline-2 tw:focus-visible:outline-(--focus-ring) tw:focus-visible:outline-offset-2"
          :class="activeTab === tab ? 'is-active tw:bg-(--island-bg) tw:text-content-primary tw:shadow-raised' : 'tw:bg-transparent tw:text-content-secondary'"
          :aria-selected="activeTab === tab"
          :aria-controls="`right-panel-tabpanel-${tab}`"
          :tabindex="activeTab === tab ? 0 : -1"
          @click="activeTab = tab"
          @keydown="onTabKeydown"
        >
          {{ t(`workspace.rightPanel.tabs.${tab}`) }}
        </button>
      </div>
      <button type="button" class="right-panel__close tw:size-7 tw:flex-shrink-0 tw:grid tw:place-items-center tw:border-none tw:rounded-[calc(8px*var(--radius-scale,1))] tw:bg-transparent tw:text-content-muted tw:cursor-pointer tw:transition-[background-color,color] tw:duration-[120ms] tw:ease-[ease] tw:hover:bg-(--hover) tw:hover:text-content-primary tw:focus-visible:outline-2 tw:focus-visible:outline-(--focus-ring) tw:focus-visible:outline-offset-2" :aria-label="t('workspace.context.cancel')" @click="emit('close')">
        <X :size="14" aria-hidden="true" />
      </button>
    </div>

    <div
      v-if="activeTab === 'document'"
      id="right-panel-tabpanel-document"
      class="right-panel__tabpanel tw:flex tw:flex-col tw:pb-4"
      role="tabpanel"
      aria-labelledby="right-panel-tab-document"
    >
      <div class="right-panel__section tw:flex-shrink-0 tw:pt-3 tw:px-4 tw:pb-3.5 tw:flex tw:flex-col tw:gap-1.5">
        <div class="right-panel__section-label tw:mb-1 tw:font-nv-mono tw:text-[10.5px] tw:font-medium tw:tracking-[0.06em] tw:uppercase tw:text-content-muted">{{ t('workspace.rightPanel.outline') }}</div>
        <div v-if="!outline.length" class="right-panel__empty right-panel__empty--sm tw:text-xs tw:text-content-muted">{{ t('workspace.rightPanel.noHeadings') }}</div>
        <div v-else class="right-panel__toc tw:flex tw:flex-col tw:-ml-1.5">
          <div
            v-for="{ item, hasChildren, collapsed } in visibleOutline"
            :key="item.index"
            class="right-panel__toc-item tw:w-full tw:min-h-7 tw:flex tw:items-center tw:gap-0.5 tw:pr-1.5 tw:rounded-[calc(6px*var(--radius-scale,1))] tw:text-[12.5px] tw:transition-[background-color,color] tw:duration-[120ms] tw:ease-[ease] tw:hover:bg-(--hover) tw:hover:text-content-primary"
            :class="collapsed ? 'is-collapsed tw:text-content-muted' : 'tw:text-content-secondary'"
            :style="{ paddingLeft: `${(item.level - 1) * 12}px` }"
          >
            <button
              type="button"
              class="right-panel__toc-chevron tw:size-[18px] tw:flex-shrink-0 tw:grid tw:place-items-center tw:border-none tw:bg-transparent tw:text-content-muted tw:cursor-pointer tw:rounded-[calc(4px*var(--radius-scale,1))] tw:hover:text-content-secondary tw:focus-visible:outline-2 tw:focus-visible:outline-(--focus-ring) tw:focus-visible:outline-offset-2"
              :class="{ 'is-open': !collapsed, 'is-hidden tw:opacity-0 tw:pointer-events-none': !hasChildren }"
              @click.stop="hasChildren && toggleTocCollapse(item.index)"
            >
              <ChevronRight :size="11" />
            </button>
            <button type="button" class="right-panel__toc-text tw:flex-1 tw:min-w-0 tw:overflow-hidden tw:text-ellipsis tw:whitespace-nowrap tw:border-none tw:bg-transparent tw:text-inherit tw:font-inherit tw:text-left tw:cursor-pointer tw:py-1 tw:px-0 tw:focus-visible:outline-2 tw:focus-visible:outline-(--focus-ring) tw:focus-visible:outline-offset-2" @click="scrollToHeading(item.index)">
              {{ item.text || t('workspace.untitledNote') }}
            </button>
          </div>
        </div>
      </div>

      <div class="right-panel__section right-panel__properties tw:flex-shrink-0 tw:pt-3 tw:px-4 tw:pb-3.5 tw:flex tw:flex-col tw:gap-0.5">
        <div class="right-panel__section-label tw:mb-1 tw:font-nv-mono tw:text-[10.5px] tw:font-medium tw:tracking-[0.06em] tw:uppercase tw:text-content-muted">{{ t('workspace.rightPanel.properties.title') }}</div>
        <div class="right-panel__property-row tw:min-h-8 tw:grid tw:grid-cols-[76px_minmax(0,1fr)] tw:items-center tw:gap-2">
          <span class="right-panel__property-label tw:text-xs tw:text-content-muted tw:overflow-hidden tw:text-ellipsis tw:whitespace-nowrap">{{ t('workspace.rightPanel.properties.type') }}</span>
          <NvSelect
            class="right-panel__property-control tw:min-w-0 tw:w-full"
            :model-value="typeValue"
            :options="typeOptions"
            :min-width="132"
            :placeholder="t('workspace.rightPanel.properties.typeNone')"
            :disabled="!note"
            @update:model-value="updateType"
          />
        </div>
        <div class="right-panel__property-row tw:min-h-8 tw:grid tw:grid-cols-[76px_minmax(0,1fr)] tw:items-center tw:gap-2">
          <span class="right-panel__property-label tw:text-xs tw:text-content-muted tw:overflow-hidden tw:text-ellipsis tw:whitespace-nowrap">{{ t('workspace.rightPanel.properties.status') }}</span>
          <NvSelect
            class="right-panel__property-control tw:min-w-0 tw:w-full"
            :model-value="statusValue"
            :options="statusOptions"
            :min-width="132"
            :disabled="!note"
            @update:model-value="updateStatus"
          />
        </div>
        <div class="right-panel__property-row tw:min-h-8 tw:grid tw:grid-cols-[76px_minmax(0,1fr)] tw:items-center tw:gap-2">
          <span class="right-panel__property-label tw:text-xs tw:text-content-muted tw:overflow-hidden tw:text-ellipsis tw:whitespace-nowrap">{{ t('workspace.rightPanel.properties.date') }}</span>
          <NvDatePicker
            class="right-panel__property-control tw:min-w-0 tw:w-full"
            :model-value="properties.date"
            :placeholder="t('workspace.rightPanel.properties.datePlaceholder')"
            :disabled="!note"
            @update:model-value="updateDate"
          />
        </div>
        <div class="right-panel__property-row right-panel__property-row--tags tw:min-h-8 tw:grid tw:grid-cols-[76px_minmax(0,1fr)] tw:items-start tw:gap-2 tw:pt-1">
          <span class="right-panel__property-label tw:text-xs tw:text-content-muted tw:overflow-hidden tw:text-ellipsis tw:whitespace-nowrap tw:leading-6">{{ t('workspace.rightPanel.properties.tags') }}</span>
          <div class="right-panel__property-tags tw:min-w-0 tw:flex tw:items-center tw:flex-wrap tw:gap-1" :aria-label="t('workspace.rightPanel.properties.tags')">
            <span
              v-for="(tag, index) in properties.tags"
              :key="`${tag}-${index}`"
              class="right-panel__tag tw:max-w-full tw:min-w-0 tw:h-6 tw:inline-flex tw:items-center tw:gap-0.5 tw:pt-0 tw:pr-1 tw:pb-0 tw:pl-[9px] tw:rounded-full tw:bg-[color-mix(in_oklab,var(--frame-bg)_90%,var(--text-primary))] tw:text-content-secondary tw:text-xs"
            >
              <span class="right-panel__tag-text tw:min-w-0 tw:overflow-hidden tw:text-ellipsis tw:whitespace-nowrap">{{ tag }}</span>
              <button type="button" class="right-panel__tag-remove tw:size-4 tw:flex-shrink-0 tw:grid tw:place-items-center tw:border-none tw:rounded-full tw:bg-transparent tw:text-content-muted tw:cursor-pointer tw:p-0 tw:hover:bg-(--hover-strong) tw:hover:text-content-primary" :aria-label="t('workspace.rightPanel.properties.removeTag', { tag })" @click="removeTag(index)">
                <X :size="10" />
              </button>
            </span>
            <input
              v-model="tagInput"
              class="right-panel__tag-input tw:flex-[1_1_72px] tw:min-w-[72px] tw:h-6 tw:px-1 tw:border tw:border-solid tw:border-transparent tw:rounded-[calc(6px*var(--radius-scale,1))] tw:outline-none tw:bg-transparent tw:text-content-secondary tw:font-inherit tw:text-xs tw:hover:bg-(--hover) tw:focus:bg-input-bg tw:focus:shadow-[0_0_0_2px_var(--input-ring)] tw:placeholder:text-content-muted disabled:tw:cursor-not-allowed disabled:tw:opacity-55"
              type="text"
              :disabled="!note"
              :placeholder="properties.tags.length ? t('workspace.rightPanel.properties.addTag') : t('workspace.rightPanel.properties.tagsPlaceholder')"
              @keydown="onTagKeydown"
              @blur="addTags"
            >
          </div>
        </div>
      </div>

      <div class="right-panel__section tw:flex-shrink-0 tw:pt-3 tw:px-4 tw:pb-3.5 tw:flex tw:flex-col tw:gap-1.5">
        <div class="right-panel__section-label tw:mb-1 tw:font-nv-mono tw:text-[10.5px] tw:font-medium tw:tracking-[0.06em] tw:uppercase tw:text-content-muted">{{ t('workspace.rightPanel.metadata') }}</div>
        <div class="right-panel__meta-row tw:min-h-6 tw:flex tw:items-center tw:gap-1.25 tw:text-xs tw:text-content-secondary [&>svg]:tw:text-content-muted"><FileText :size="12" aria-hidden="true" /><span>{{ t('workspace.rightPanel.words', { n: wordCount }) }}</span><span class="right-panel__meta-sep tw:text-content-muted">·</span><span>{{ t('workspace.rightPanel.readTime', { n: readMinutes }) }}</span></div>
        <div class="right-panel__meta-row tw:min-h-6 tw:flex tw:items-center tw:gap-1.25 tw:text-xs tw:text-content-secondary [&>svg]:tw:text-content-muted"><span class="right-panel__meta-key tw:text-content-muted tw:w-[76px] tw:flex-shrink-0 tw:mr-[3px]">{{ t('workspace.rightPanel.updated') }}</span><span class="right-panel__meta-value tw:[font-variant-numeric:tabular-nums]">{{ updatedAgo }}</span></div>
        <div class="right-panel__meta-row tw:min-h-6 tw:flex tw:items-center tw:gap-1.25 tw:text-xs tw:text-content-secondary [&>svg]:tw:text-content-muted"><span class="right-panel__meta-key tw:text-content-muted tw:w-[76px] tw:flex-shrink-0 tw:mr-[3px]">{{ t('workspace.rightPanel.created') }}</span><span class="right-panel__meta-value tw:[font-variant-numeric:tabular-nums]">{{ createdFormatted }}</span></div>
      </div>
    </div>

    <div
      v-else-if="activeTab === 'links'"
      id="right-panel-tabpanel-links"
      class="right-panel__tabpanel tw:flex tw:flex-col tw:pb-4"
      role="tabpanel"
      aria-labelledby="right-panel-tab-links"
    >
      <div class="right-panel__section right-panel__backlinks tw:flex-shrink-0 tw:pt-3 tw:px-4 tw:pb-3.5 tw:flex tw:flex-col tw:gap-1.5">
        <div class="right-panel__section-label tw:mb-1 tw:font-nv-mono tw:text-[10.5px] tw:font-medium tw:tracking-[0.06em] tw:uppercase tw:text-content-muted">
          {{ t('workspace.rightPanel.backlinks') }}<template v-if="backlinks.length"> · {{ backlinks.length }}</template>
        </div>
        <div v-if="!backlinks.length" class="right-panel__empty right-panel__empty--sm tw:text-xs tw:text-content-muted">{{ t('workspace.rightPanel.noBacklinks') }}</div>
        <button v-for="bl in backlinks" :key="bl.sourceId" type="button" class="right-panel__backlink-item tw:w-full tw:min-h-8 tw:flex tw:items-center tw:gap-2 tw:-ml-1.5 tw:px-1.5 tw:border-none tw:rounded-[calc(6px*var(--radius-scale,1))] tw:bg-transparent tw:text-content-secondary tw:text-[12.5px] tw:text-left tw:cursor-pointer tw:transition-[background-color,color] tw:duration-[120ms] tw:ease-[ease] tw:hover:bg-(--hover) tw:hover:text-content-primary tw:focus-visible:outline-2 tw:focus-visible:outline-(--focus-ring) tw:focus-visible:outline-offset-2" @click="emit('open-note', bl.sourceId)">
          <span class="right-panel__backlink-icon tw:text-[13px] tw:leading-none tw:flex-shrink-0">{{ bl.sourceIcon || '📄' }}</span>
          <span class="right-panel__backlink-title tw:flex-1 tw:min-w-0 tw:overflow-hidden tw:text-ellipsis tw:whitespace-nowrap">{{ bl.sourceTitle }}</span>
          <span v-if="bl.count > 1" class="right-panel__backlink-count tw:font-nv-mono tw:text-[10.5px] tw:text-content-muted tw:flex-shrink-0">{{ bl.count }}</span>
        </button>
      </div>

      <div class="right-panel__section tw:flex-shrink-0 tw:pt-3 tw:px-4 tw:pb-3.5 tw:flex tw:flex-col tw:gap-1.5">
        <div class="right-panel__section-label tw:mb-1 tw:font-nv-mono tw:text-[10.5px] tw:font-medium tw:tracking-[0.06em] tw:uppercase tw:text-content-muted">{{ t('workspace.rightPanel.externalLinks') }}</div>
        <div v-if="!externalLinks.length" class="right-panel__empty right-panel__empty--sm tw:text-xs tw:text-content-muted">{{ t('workspace.rightPanel.noExternalLinks') }}</div>
        <button v-for="link in externalLinks" :key="link.url" type="button" class="right-panel__link-item tw:w-full tw:min-h-8 tw:flex tw:items-center tw:gap-2 tw:-ml-1.5 tw:px-1.5 tw:border-none tw:rounded-[calc(6px*var(--radius-scale,1))] tw:bg-transparent tw:text-content-secondary tw:text-[12.5px] tw:text-left tw:cursor-pointer tw:transition-[background-color,color] tw:duration-[120ms] tw:ease-[ease] tw:hover:bg-(--hover) tw:hover:text-content-primary tw:focus-visible:outline-2 tw:focus-visible:outline-(--focus-ring) tw:focus-visible:outline-offset-2" :title="link.url" @click="onOpenLink(link.url)">
          <ExternalLink :size="11" class="right-panel__link-icon tw:flex-shrink-0 tw:text-content-muted" />
          <span class="right-panel__link-text tw:flex-1 tw:min-w-0 tw:overflow-hidden tw:text-ellipsis tw:whitespace-nowrap">{{ linkDomain(link.url) }}</span>
        </button>
      </div>
    </div>

    <div
      v-else
      id="right-panel-tabpanel-graph"
      class="right-panel__tabpanel tw:flex tw:min-h-0 tw:flex-1 tw:flex-col tw:overflow-hidden"
      role="tabpanel"
      aria-labelledby="right-panel-tab-graph"
    >
      <LocalGraphPanel
        class="right-panel__graph-canvas tw:flex-1"
        :note="note"
        embedded
        @open-note="emit('open-note', $event)"
      />
    </div>
  </aside>
</template>

<style scoped>
.right-panel__toc-chevron :deep(svg) {
  transition: transform 180ms ease;
  transform: rotate(0deg);
}

.right-panel__toc-chevron.is-open :deep(svg) {
  transform: rotate(90deg);
}

.right-panel__property-control :deep(.nv-select__trigger),
.right-panel__property-control :deep(.ndp-trigger) {
  width: 100%;
  min-width: 0;
  height: 28px;
  margin-left: -8px;
  background: transparent;
  box-shadow: none;
  color: var(--text-primary);
}

.right-panel__property-control :deep(.nv-select__trigger:hover),
.right-panel__property-control :deep(.ndp-trigger:hover) {
  background: var(--hover);
}
</style>
