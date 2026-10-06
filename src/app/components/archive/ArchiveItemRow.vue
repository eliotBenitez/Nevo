<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { FileText, Folder, RotateCcw, Trash2 } from '@lucide/vue'
import type { TrashedItem } from '../../../types/workspace'
import type { RetentionTone } from '../../../utils/archive/retention'

const props = defineProps<{
  item: TrashedItem
  parentLabel: string
  deletedLabel: string
  daysLeft: number | null
  tone: RetentionTone
  focused: boolean
}>()

const emit = defineEmits<{
  restore: []
  delete: []
  focus: []
}>()

const { t } = useI18n()

const displayTitle = computed(() => props.item.title || t('editor.titlePlaceholder'))
</script>

<template>
  <li
    role="listitem"
    class="archive-row tw:grid tw:min-h-[52px] tw:grid-cols-[30px_minmax(0,1fr)_56px_auto] tw:cursor-pointer tw:items-center tw:gap-3 tw:rounded-[calc(10px*var(--radius-scale,1))] tw:border tw:border-solid tw:border-transparent tw:px-2.5 tw:py-1.5 tw:text-content-primary tw:outline-none tw:transition-colors tw:duration-100 tw:focus-visible:bg-(--surface-raised) tw:focus-visible:shadow-[var(--shadow-raised),0_0_0_2px_var(--focus-ring)]"
    :class="focused
      ? 'is-focused tw:bg-(--surface-raised) tw:shadow-[var(--shadow-raised),0_0_0_2px_var(--focus-ring)] tw:hover:bg-(--surface-raised)'
      : 'tw:hover:bg-(--hover)'"
    :tabindex="focused ? 0 : -1"
    @click="emit('focus')"
    @focus="emit('focus')"
  >
    <span class="archive-row__icon tw:grid tw:size-[30px] tw:place-items-center tw:rounded-[calc(8px*var(--radius-scale,1))] tw:bg-surface-subtle tw:text-sm tw:text-content-muted" aria-hidden="true">
      <span v-if="item.icon" class="archive-row__custom-icon">{{ item.icon }}</span>
      <Folder v-else-if="item.type === 'folder'" :size="16" />
      <FileText v-else :size="16" />
    </span>

    <div class="archive-row__copy tw:flex tw:min-w-0 tw:flex-col tw:gap-0.5">
      <div class="archive-row__title-wrap tw:flex tw:min-w-0 tw:items-center tw:gap-1.5">
        <strong class="archive-row__title tw:truncate tw:text-[13px] tw:font-medium tw:text-content-primary" :title="displayTitle">{{ displayTitle }}</strong>
        <span v-if="item.type === 'folder'" class="archive-row__chip tw:inline-flex tw:h-[18px] tw:shrink-0 tw:items-center tw:rounded-[calc(4px*var(--radius-scale,1))] tw:bg-surface-subtle tw:px-1.5 tw:text-[10.5px] tw:font-medium tw:text-content-muted">
          {{ t('workspace.trash.folderType') }}
        </span>
      </div>
      <div class="archive-row__meta tw:truncate tw:text-[11.5px] tw:text-content-muted">
        {{ parentLabel }} · {{ deletedLabel }}
      </div>
    </div>

    <span
      v-if="daysLeft !== null"
      class="archive-row__days tw:whitespace-nowrap tw:text-right tw:font-nv-mono tw:text-[11.5px]"
      :class="[`archive-row__days--${tone}`, tone === 'soon' ? 'tw:text-(--warning)' : tone === 'last' ? 'tw:text-danger' : 'tw:text-content-muted']"
    >
      {{ t('workspace.trash.daysLeft', { days: daysLeft }) }}
    </span>
    <span v-else class="archive-row__days-spacer tw:block" />

    <div
      class="archive-row__actions tw:flex tw:items-center tw:gap-1"
      role="group"
      :aria-label="t('workspace.trash.itemActions', { title: displayTitle })"
    >
      <button
        type="button"
        class="nv-btn nv-btn--xs archive-action-restore"
        :aria-label="t('workspace.trash.restoreItem', { title: displayTitle })"
        @click.stop="emit('restore')"
      >
        <RotateCcw :size="12" aria-hidden="true" />
        <span>{{ t('workspace.trash.restore') }}</span>
      </button>

      <button
        type="button"
        class="nv-btn nv-btn--xs nv-btn--icon nv-btn--ghost archive-row__delete-btn archive-action-delete tw:text-danger tw:hover:bg-(--surface-danger)"
        :aria-label="t('workspace.trash.deleteItem', { title: displayTitle })"
        :title="t('workspace.trash.deleteItem', { title: displayTitle })"
        @click.stop="emit('delete')"
      >
        <Trash2 :size="13" aria-hidden="true" />
      </button>
    </div>
  </li>
</template>
