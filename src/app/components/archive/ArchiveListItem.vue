<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { FileText, Folder } from 'lucide-vue-next'
import type { TrashedItem } from '../../../types/workspace'
import type { RetentionTone } from '../../../utils/archive/retention'

const props = defineProps<{
  item: TrashedItem
  parentLabel: string
  deletedLabel: string
  daysLeft: number | null
  tone: RetentionTone
  selected: boolean
}>()

const emit = defineEmits<{
  select: []
}>()

const { t } = useI18n()

const displayTitle = computed(() => props.item.title || t('editor.titlePlaceholder'))
</script>

<template>
  <div
    role="option"
    :aria-selected="selected"
    class="trv-item tw:grid tw:grid-cols-[28px_minmax(0,1fr)_auto] tw:items-center tw:gap-2.5 tw:rounded-(--r-sm) tw:border tw:border-solid tw:border-transparent tw:px-2 tw:py-[7px] tw:cursor-pointer tw:outline-none tw:transition-colors tw:duration-100"
    :class="selected
      ? 'on tw:bg-(--island-bg) tw:shadow-(--shadow-raised) tw:hover:bg-(--island-bg)'
      : 'tw:bg-transparent tw:hover:bg-(--hover)'"
    @click="emit('select')"
  >
    <span class="tr-ico tw:grid tw:size-7 tw:shrink-0 tw:place-items-center tw:rounded-[calc(6px*var(--radius-scale,1))] tw:bg-surface-subtle tw:text-[13px] tw:text-content-muted" aria-hidden="true">
      <span v-if="item.icon" class="archive-custom-icon">{{ item.icon }}</span>
      <Folder v-else-if="item.type === 'folder'" :size="16" />
      <FileText v-else :size="16" />
    </span>

    <div class="tr-copy tw:flex tw:min-w-0 tw:flex-col tw:gap-0.5">
      <strong class="tr-copy__title tw:truncate tw:text-[13px] tw:font-medium tw:text-content-primary" :title="displayTitle">{{ displayTitle }}</strong>
      <span class="tr-copy__meta tw:truncate tw:text-[11.5px] tw:text-content-muted">{{ parentLabel }} · {{ deletedLabel }}</span>
    </div>

    <span
      v-if="daysLeft !== null"
      class="tr-left mono tw:whitespace-nowrap tw:text-right tw:text-[11.5px]"
      :class="[`tr-left--${tone}`, tone === 'soon' ? 'tw:text-(--warning)' : tone === 'last' ? 'tw:text-danger' : 'tw:text-content-muted']"
    >
      {{ t('workspace.trash.daysLeft', { days: daysLeft }) }}
    </span>
  </div>
</template>
