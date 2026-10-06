<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { Copy, ChevronDown, ChevronUp, Plus, Trash2, X } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import type { NotebookPageV1 } from '../../../core/notebook/types'
import NvButton from '../../../ui/primitives/NvButton.vue'
import NotebookPageThumbnail from './NotebookPageThumbnail.vue'

const props = defineProps<{
  pages: NotebookPageV1[]
  selectedPageId: string
  open: boolean
  narrow: boolean
}>()

const emit = defineEmits<{
  select: [pageId: string]
  add: []
  duplicate: [pageId: string]
  move: [pageId: string, direction: -1 | 1]
  remove: [pageId: string]
  close: []
}>()

const { t } = useI18n()
const listEl = ref<HTMLOListElement | null>(null)
const scrollTop = ref(0)
const viewportHeight = ref(520)
const rowHeight = computed(() => props.narrow ? 152 : 300)
const startIndex = computed(() => Math.max(0, Math.floor(scrollTop.value / rowHeight.value) - 1))
const visibleCount = computed(() => Math.ceil(viewportHeight.value / rowHeight.value) + 3)
const visiblePages = computed(() => props.pages.slice(startIndex.value, startIndex.value + visibleCount.value))
const topSpacerHeight = computed(() => startIndex.value * rowHeight.value)
const bottomSpacerHeight = computed(() => Math.max(0, props.pages.length - startIndex.value - visiblePages.value.length) * rowHeight.value)

function onListScroll(event: Event): void {
  const element = event.currentTarget as HTMLOListElement
  scrollTop.value = element.scrollTop
  viewportHeight.value = element.clientHeight || viewportHeight.value
}

watch(() => props.selectedPageId, async (pageId) => {
  const index = props.pages.findIndex(page => page.id === pageId)
  if (index < 0 || !listEl.value) return
  const top = index * rowHeight.value
  const bottom = top + rowHeight.value
  if (top < listEl.value.scrollTop) listEl.value.scrollTop = top
  else if (bottom > listEl.value.scrollTop + listEl.value.clientHeight) listEl.value.scrollTop = bottom - listEl.value.clientHeight
  await nextTick()
  scrollTop.value = listEl.value.scrollTop
}, { flush: 'post' })
</script>

<template>
  <aside
    v-show="open"
    class="notebook-pages"
    :class="{ 'notebook-pages--open': open, 'notebook-pages--drawer': narrow }"
    :aria-label="t('notebook.pages.label')"
    :aria-hidden="!open"
    :inert="!open"
  >
    <header class="notebook-pages__header">
      <h2>{{ t('notebook.pages.label') }}</h2>
      <NvButton variant="ghost" icon :aria-label="t('notebook.pages.close')" @click="emit('close')">
        <X :size="18" aria-hidden="true" />
      </NvButton>
      <NvButton variant="ghost" icon :aria-label="t('notebook.pages.add')" @click="emit('add')">
        <Plus :size="18" aria-hidden="true" />
      </NvButton>
    </header>
    <ol ref="listEl" class="notebook-pages__list" :aria-label="t('notebook.pages.order')" @scroll="onListScroll">
      <li v-if="topSpacerHeight" class="notebook-pages__spacer" :style="{ height: `${topSpacerHeight}px` }" aria-hidden="true" />
      <li v-for="(page, visibleIndex) in visiblePages" :key="page.id">
        <button
          class="notebook-pages__item"
          :data-page-thumbnail="page.id"
          :class="{ 'notebook-pages__item--active': page.id === selectedPageId }"
          :aria-current="page.id === selectedPageId ? 'page' : undefined"
          :aria-label="t('notebook.pages.pageSummary', { page: startIndex + visibleIndex + 1, marks: page.objects.length })"
          :aria-posinset="startIndex + visibleIndex + 1"
          :aria-setsize="pages.length"
          @click="emit('select', page.id)"
        >
          <span class="notebook-pages__thumbnail"><NotebookPageThumbnail :page="page" /></span>
          <span class="notebook-pages__number">{{ startIndex + visibleIndex + 1 }}</span>
        </button>
        <div class="notebook-pages__row-actions" :aria-label="t('notebook.pages.actions', { page: startIndex + visibleIndex + 1 })">
          <NvButton variant="ghost" icon :disabled="startIndex + visibleIndex === 0" :aria-label="t('notebook.pages.moveUp')" @click="emit('move', page.id, -1)">
            <ChevronUp :size="15" aria-hidden="true" />
          </NvButton>
          <NvButton variant="ghost" icon :disabled="startIndex + visibleIndex === pages.length - 1" :aria-label="t('notebook.pages.moveDown')" @click="emit('move', page.id, 1)">
            <ChevronDown :size="15" aria-hidden="true" />
          </NvButton>
          <NvButton variant="ghost" icon :aria-label="t('notebook.pages.duplicate')" @click="emit('duplicate', page.id)">
            <Copy :size="14" aria-hidden="true" />
          </NvButton>
          <NvButton variant="ghost" icon :disabled="pages.length === 1" :aria-label="t('notebook.pages.remove')" @click="emit('remove', page.id)">
            <Trash2 :size="14" aria-hidden="true" />
          </NvButton>
        </div>
      </li>
      <li v-if="bottomSpacerHeight" class="notebook-pages__spacer" :style="{ height: `${bottomSpacerHeight}px` }" aria-hidden="true" />
    </ol>
  </aside>
</template>

<style scoped>
.notebook-pages {
  display: flex;
  width: 206px;
  flex: none;
  flex-direction: column;
  min-height: 0;
  border-right: 1px solid var(--border-subtle);
  background: var(--surface-panel);
}

.notebook-pages__header {
  display: flex;
  min-height: 54px;
  align-items: center;
  justify-content: space-between;
  padding: 5px 8px 5px 14px;
  border-bottom: 1px solid var(--border-subtle);
}

.notebook-pages__header h2 { margin: 0; color: var(--text-secondary); font-size: 12px; font-weight: 600; }
.notebook-pages__list { display: grid; align-content: start; gap: 8px; overflow: auto; margin: 0; padding: 12px 10px; list-style: none; }
.notebook-pages__spacer { pointer-events: none; }
.notebook-pages__list li { display: grid; gap: 3px; }
.notebook-pages__item { display: grid; width: 100%; min-height: 44px; gap: 5px; padding: 5px; border: 1px solid transparent; border-radius: 8px; background: transparent; color: var(--text-secondary); cursor: pointer; }
.notebook-pages__item:hover { background: var(--hover); }
.notebook-pages__item:focus-visible { outline: 2px solid var(--focus-ring); outline-offset: 1px; }
.notebook-pages__item--active { border-color: var(--accent); background: var(--accent-soft); color: var(--text-primary); }
.notebook-pages__thumbnail { display: block; width: 100%; aspect-ratio: 595.28 / 841.89; overflow: hidden; background: #fff; box-shadow: 0 1px 4px rgb(16 22 28 / 12%); pointer-events: none; }
.notebook-pages__thumbnail :deep(svg) { display: block; width: 100%; height: 100%; }
.notebook-pages__number { text-align: center; font-size: 11px; font-variant-numeric: tabular-nums; }
.notebook-pages__row-actions { display: flex; justify-content: center; gap: 1px; opacity: 0.84; }
.notebook-pages__row-actions :deep(.nv-btn) { min-width: 44px; min-height: 44px; padding: 0; }

@media (max-width: 900px) {
  .notebook-pages--drawer { position: absolute; z-index: 10; inset: 0 auto 0 0; width: min(84vw, 290px); box-shadow: var(--shadow-overlay); transform: translateX(-105%); transition: transform var(--dur-base) var(--ease-out); }
  .notebook-pages--drawer.notebook-pages--open { transform: translateX(0); }
  .notebook-pages--drawer .notebook-pages__item { grid-template-columns: 56px 1fr; align-items: center; text-align: left; }
  .notebook-pages--drawer .notebook-pages__thumbnail { width: 56px; }
  .notebook-pages--drawer .notebook-pages__number { text-align: left; }
}

@media (prefers-reduced-motion: reduce) { .notebook-pages--drawer { transition: none; } }
</style>
