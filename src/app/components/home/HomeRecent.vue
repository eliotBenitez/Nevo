<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import NvNoteIcon from '../../../ui/primitives/NvNoteIcon.vue'
import type { WorkspaceHomeItem } from '../../composables/useWorkspaceHome'

defineProps<{
  recentItems: WorkspaceHomeItem[]
  /** Highlights the row for the onboarding starter note with `data-tour="starter"`. */
  starterNoteId?: string | null
}>()
const emit = defineEmits<{ 'open-item': [item: WorkspaceHomeItem] }>()
const { t, locale } = useI18n()

function itemType(item: WorkspaceHomeItem) {
  return item.typeLabel
}

function formatDate(value: string | null) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat(String(locale.value), {
    day: 'numeric',
    month: 'short',
  }).format(date)
}
</script>

<template>
  <section v-if="recentItems.length" class="workspace-home__section workspace-home__section--recent tw:w-full tw:m-0">
    <div class="workspace-home__section-head tw:flex tw:min-h-8 tw:items-center tw:justify-between tw:gap-4 tw:mb-3 tw:max-[719px]:mb-2.5">
      <div>
        <h2 class="tw:m-0 tw:text-[15px] tw:font-[650] tw:tracking-normal">{{ t('workspace.home.recent.title') }}</h2>
      </div>
    </div>
    <div class="workspace-home__recent-list tw:overflow-hidden">
      <button
        v-for="item in recentItems"
        :key="item.key"
        type="button"
        :data-tour="item.favorite.kind === 'note' && item.favorite.id === starterNoteId ? 'starter' : undefined"
        class="workspace-home__recent tw:grid tw:w-full tw:min-h-[60px] tw:items-center tw:[grid-template-columns:20px_minmax(0,1fr)_auto] tw:[grid-template-areas:'icon_title_time'_'icon_kind_time'] tw:gap-x-3.5 tw:gap-y-0.5 tw:py-2 tw:border-0 tw:rounded-[calc(8px*var(--radius-scale,1))] tw:text-content-secondary tw:bg-transparent tw:text-left tw:transition-colors tw:duration-[var(--dur-base)] tw:hover:bg-[color-mix(in_oklab,var(--island-bg)_92%,var(--text-primary))] tw:active:translate-y-px tw:focus-visible:outline-2 tw:focus-visible:outline-accent tw:focus-visible:outline-offset-[-2px] tw:max-[719px]:min-h-16 tw:max-[719px]:gap-x-3"
        @click="emit('open-item', item)"
      >
        <span class="workspace-home__recent-icon tw:grid tw:[grid-area:icon] tw:w-5 tw:h-6 tw:flex-none tw:place-items-center tw:text-content-muted">
          <NvNoteIcon :value="item.icon" :size="15" />
        </span>
        <span class="workspace-home__recent-title tw:[grid-area:title] tw:self-end tw:overflow-hidden tw:text-content-primary tw:text-sm tw:font-[550] tw:text-ellipsis tw:whitespace-nowrap">{{ item.title }}</span>
        <span class="workspace-home__recent-kind tw:[grid-area:kind] tw:self-start tw:overflow-hidden tw:text-content-muted tw:text-[12.5px] tw:text-ellipsis tw:whitespace-nowrap">{{ itemType(item) }}</span>
        <time v-if="item.updatedAt" :datetime="item.updatedAt" class="tw:[grid-area:time] tw:text-content-muted tw:text-[12.5px] tw:font-nv-mono tw:[font-variant-numeric:tabular-nums]">{{ formatDate(item.updatedAt) }}</time>
      </button>
    </div>
  </section>
</template>

<style scoped src="../../../styles/app/home/recent.css"></style>
