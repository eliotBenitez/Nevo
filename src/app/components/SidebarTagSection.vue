<script setup lang="ts">
import { computed } from 'vue'
import { Tag } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'

interface TagStat {
  label: string
  count: number
}

const props = withDefaults(defineProps<{
  tags: TagStat[]
  maxVisible?: number
}>(), {
  maxVisible: 12,
})

const emit = defineEmits<{
  'select-tag': [tag: string]
  'show-all': []
}>()

const { t } = useI18n()

const visibleTags = computed(() => props.tags.slice(0, props.maxVisible))
const hasMore = computed(() => props.tags.length > props.maxVisible)

function selectTag(tag: string) {
  emit('select-tag', tag)
}
</script>

<template>
  <div v-if="tags.length" class="sidebar-tags tw:py-1 tw:border-t-0 tw:flex tw:flex-col tw:gap-1">
    <div class="sidebar-tags__header tw:flex tw:items-center tw:pt-0.5 tw:px-2.5 tw:pb-1">
      <span class="sidebar-tags__label tw:text-[10.5px] tw:font-semibold tw:text-content-muted tw:uppercase tw:tracking-[0.05em] tw:flex-1">{{ t('workspace.tagsSection.title') }}</span>
    </div>
    <div class="sidebar-tags__list tw:flex tw:flex-col tw:gap-1 tw:px-1.5">
      <button
        v-for="tag in visibleTags"
        :key="tag.label"
        type="button"
        class="sidebar-tags__pill tw:w-full tw:min-h-[28px] tw:border tw:border-solid tw:border-transparent tw:rounded-[calc(8px*var(--radius-scale,1))] tw:bg-transparent tw:text-content-muted tw:cursor-pointer tw:grid tw:grid-cols-[12px_minmax(0,1fr)_auto] tw:items-center tw:gap-1.5 tw:px-[7px] tw:text-[11.5px] tw:text-left tw:transition-[background-color,border-color,color] tw:duration-[140ms] tw:hover:bg-(--hover) tw:hover:text-content-primary tw:focus-visible:outline-none tw:focus-visible:shadow-[0_0_0_2px_var(--accent-soft),0_0_0_1px_var(--accent)]"
        @click="selectTag(tag.label)"
      >
        <Tag :size="11" />
        <span class="sidebar-tags__pill-label tw:min-w-0 tw:overflow-hidden tw:text-ellipsis tw:whitespace-nowrap">{{ tag.label }}</span>
        <span class="sidebar-tags__pill-count tw:min-w-[18px] tw:h-[18px] tw:rounded-full tw:grid tw:place-items-center tw:px-[5px] tw:bg-[color-mix(in_oklab,var(--surface-overlay)_82%,transparent)] tw:text-content-muted tw:text-[10.5px] tw:font-[650] tw:[font-variant-numeric:tabular-nums]">{{ tag.count }}</span>
      </button>
    </div>
    <button
      v-if="hasMore"
      type="button"
      class="sidebar-tags__show-all tw:mx-1.5 tw:py-[5px] tw:px-[7px] tw:border-none tw:rounded-[calc(8px*var(--radius-scale,1))] tw:bg-transparent tw:text-content-muted tw:text-[11px] tw:text-left tw:cursor-pointer tw:transition-[background-color,color] tw:duration-[140ms] tw:hover:bg-(--hover) tw:hover:text-content-primary tw:focus-visible:outline-none tw:focus-visible:shadow-[0_0_0_2px_var(--accent-soft),0_0_0_1px_var(--accent)]"
      @click="emit('show-all')"
    >
      {{ t('workspace.tagsSection.showAll') }}
    </button>
  </div>
</template>
