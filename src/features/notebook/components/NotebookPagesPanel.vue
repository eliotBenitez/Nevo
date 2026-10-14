<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { Copy, ChevronDown, ChevronUp, Plus, Trash2, X } from '../../../ui/icons'
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
    class="notebook-pages tw:flex tw:min-h-0 tw:w-[206px] tw:flex-none tw:flex-col tw:border-r tw:border-border-subtle tw:bg-surface-panel"
    :class="{ 'notebook-pages--open': open, 'notebook-pages--drawer': narrow }"
    :aria-label="t('notebook.pages.label')"
    :aria-hidden="!open"
    :inert="!open"
  >
    <header class="notebook-pages__header tw:flex tw:min-h-[54px] tw:items-center tw:justify-between tw:border-b tw:border-border-subtle tw:py-[5px] tw:pr-2 tw:pl-3.5">
      <h2 class="tw:m-0 tw:text-[12px] tw:font-semibold tw:text-content-secondary">{{ t('notebook.pages.label') }}</h2>
      <NvButton variant="ghost" icon :aria-label="t('notebook.pages.close')" @click="emit('close')">
        <X :size="18" aria-hidden="true" />
      </NvButton>
      <NvButton variant="ghost" icon :aria-label="t('notebook.pages.add')" @click="emit('add')">
        <Plus :size="18" aria-hidden="true" />
      </NvButton>
    </header>
    <ol ref="listEl" class="notebook-pages__list tw:m-0 tw:grid tw:list-none tw:content-start tw:gap-2 tw:overflow-auto tw:px-2.5 tw:py-3" :aria-label="t('notebook.pages.order')" @scroll="onListScroll">
      <li v-if="topSpacerHeight" class="notebook-pages__spacer tw:pointer-events-none" :style="{ height: `${topSpacerHeight}px` }" aria-hidden="true" />
      <li v-for="(page, visibleIndex) in visiblePages" :key="page.id" class="tw:grid tw:gap-[3px]">
        <button
          class="notebook-pages__item tw:grid tw:min-h-11 tw:w-full tw:cursor-pointer tw:gap-[5px] tw:rounded-lg tw:border tw:p-[5px] tw:focus-visible:outline-2 tw:focus-visible:outline-offset-1 tw:focus-visible:outline-focus-ring"
          :data-page-thumbnail="page.id"
          :class="page.id === selectedPageId ? 'notebook-pages__item--active tw:border-accent tw:bg-(--accent-soft) tw:text-content-primary' : 'tw:border-transparent tw:bg-transparent tw:text-content-secondary tw:hover:bg-(--hover)'"
          :aria-current="page.id === selectedPageId ? 'page' : undefined"
          :aria-label="t('notebook.pages.pageSummary', { page: startIndex + visibleIndex + 1, marks: page.objects.length })"
          :aria-posinset="startIndex + visibleIndex + 1"
          :aria-setsize="pages.length"
          @click="emit('select', page.id)"
        >
          <span class="notebook-pages__thumbnail tw:pointer-events-none tw:block tw:aspect-[595.28/841.89] tw:w-full tw:overflow-hidden tw:bg-[#fff] tw:[box-shadow:0_1px_4px_rgb(16_22_28/12%)]"><NotebookPageThumbnail :page="page" /></span>
          <span class="notebook-pages__number tw:text-center tw:text-[11px] tw:tabular-nums">{{ startIndex + visibleIndex + 1 }}</span>
        </button>
        <div class="notebook-pages__row-actions tw:flex tw:justify-center tw:gap-px tw:opacity-[0.84]" :aria-label="t('notebook.pages.actions', { page: startIndex + visibleIndex + 1 })">
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
      <li v-if="bottomSpacerHeight" class="notebook-pages__spacer tw:pointer-events-none" :style="{ height: `${bottomSpacerHeight}px` }" aria-hidden="true" />
    </ol>
  </aside>
</template>

<style scoped>
/* Remaining CSS: :deep() override into NvButton and the narrow-width drawer (parent-class state cascade, transition and reduced-motion). */
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
