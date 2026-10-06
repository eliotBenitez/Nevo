<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import NvNoteIcon from '../../../ui/primitives/NvNoteIcon.vue'
import type { WorkspaceHomeItem } from '../../composables/useWorkspaceHome'

defineProps<{
  favoriteItems: WorkspaceHomeItem[]
  isWorkspaceEmpty: boolean
}>()
const emit = defineEmits<{
  'open-item': [item: WorkspaceHomeItem]
  'manage-favorites': []
}>()
const { t } = useI18n()

function itemType(item: WorkspaceHomeItem) {
  return item.typeLabel
}
</script>

<template>
  <section v-if="favoriteItems.length" class="workspace-home__section tw:mt-0 tw:max-[767px]:mt-[30px]">
    <div class="workspace-home__section-head tw:flex tw:min-h-8 tw:items-center tw:justify-between tw:gap-4 tw:mb-3 tw:max-[719px]:mb-2.5">
      <div>
        <h2 class="tw:m-0 tw:text-[15px] tw:font-[650] tw:tracking-normal">{{ t('workspace.home.favorites.title') }}</h2>
      </div>
      <button
        type="button"
        class="workspace-home__manage tw:min-h-8 tw:p-0 tw:border-0 tw:text-content-muted tw:bg-transparent tw:text-[13px] tw:font-medium tw:cursor-pointer tw:hover:text-content-primary tw:focus-visible:outline-2 tw:focus-visible:outline-accent tw:focus-visible:outline-offset-2 tw:max-[719px]:min-w-11"
        @click="emit('manage-favorites')"
      >
        <span>{{ t('workspace.home.favorites.manage') }}</span>
      </button>
    </div>

    <div class="workspace-home__favorite-grid tw:grid tw:grid-cols-2 tw:gap-2">
      <template v-for="item in favoriteItems" :key="item.key">
        <div
          v-if="item.loading"
          class="workspace-home__favorite workspace-home__favorite--loading tw:flex tw:min-w-0 tw:min-h-[94px] tw:flex-col tw:items-stretch tw:gap-2 tw:p-3 tw:pl-3.5 tw:border tw:border-solid tw:border-transparent tw:rounded-[14px] tw:text-content-primary tw:bg-(--frame-bg) tw:text-left tw:overflow-hidden tw:max-[719px]:min-h-[94px] tw:max-[719px]:p-3"
          role="status"
          :aria-label="item.title"
        >
          <span class="workspace-home__skeleton workspace-home__skeleton--icon tw:w-5 tw:h-5 tw:rounded-[9px]" />
          <span class="workspace-home__skeleton workspace-home__skeleton--text tw:w-[55%] tw:h-3 tw:rounded-[9px]" />
        </div>
        <button
          v-else
          type="button"
          class="workspace-home__favorite tw:flex tw:min-w-0 tw:min-h-[94px] tw:flex-col tw:items-stretch tw:gap-2 tw:p-3 tw:pl-3.5 tw:border tw:border-solid tw:border-transparent tw:rounded-[14px] tw:text-content-primary tw:bg-(--frame-bg) tw:text-left tw:transition-colors tw:duration-[var(--dur-base)] tw:hover:bg-[color-mix(in_oklab,var(--frame-bg)_88%,var(--text-primary))] tw:active:scale-[0.99] tw:focus-visible:outline-2 tw:focus-visible:outline-accent tw:focus-visible:outline-offset-2 tw:max-[719px]:min-h-[94px] tw:max-[719px]:p-3"
          @click="emit('open-item', item)"
        >
          <span class="workspace-home__favorite-icon tw:grid tw:w-5 tw:h-5 tw:flex-none tw:place-items-center tw:text-accent">
            <NvNoteIcon :value="item.icon" :size="16" />
          </span>
          <span class="workspace-home__favorite-copy tw:flex tw:min-w-0 tw:flex-1 tw:flex-col tw:gap-[3px]">
            <strong class="tw:overflow-hidden tw:text-ellipsis tw:whitespace-nowrap tw:text-sm tw:font-[550]">{{ item.title }}</strong>
            <span class="tw:overflow-hidden tw:text-ellipsis tw:whitespace-nowrap tw:text-content-muted tw:text-[12.5px]">{{ itemType(item) }}</span>
          </span>
        </button>
      </template>
    </div>
  </section>

  <section v-else-if="!isWorkspaceEmpty" class="workspace-home__favorite-prompt tw:@container tw:w-full tw:min-h-[112px] tw:mt-0 tw:max-[767px]:mt-[42px] tw:p-5 tw:border tw:border-solid tw:border-transparent tw:rounded-[17px] tw:bg-surface-subtle tw:max-[719px]:mt-[30px] tw:max-[719px]:p-4">
    <div class="tw:flex tw:items-center tw:gap-4 tw:@max-[440px]:flex-wrap tw:@max-[440px]:items-start">
      <div class="tw:min-w-0 tw:flex-1">
        <span class="workspace-home__section-kicker tw:text-content-muted tw:font-nv-mono tw:text-[10.5px] tw:font-medium tw:tracking-[0.06em] tw:uppercase">{{ t('workspace.home.favorites.kicker') }}</span>
        <h2 class="tw:m-0 tw:text-[13px] tw:font-semibold">{{ t('workspace.home.favorites.emptyTitle') }}</h2>
        <p class="tw:mt-1.5 tw:mb-0 tw:text-content-muted tw:text-[13px]">{{ t('workspace.home.favorites.emptySubtitle') }}</p>
      </div>
      <button
        type="button"
        class="nv-btn tw:focus-visible:outline-2 tw:focus-visible:outline-accent tw:focus-visible:outline-offset-2 tw:@max-[440px]:w-full tw:max-[719px]:min-h-11"
        @click="emit('manage-favorites')"
      >
        {{ t('workspace.home.favorites.choose') }}
      </button>
    </div>
  </section>
</template>

<style scoped src="../../../styles/app/home/favorites.css"></style>
