<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { storeToRefs } from 'pinia'
import { ChevronRight, Search, SearchX } from 'lucide-vue-next'
import { useWorkspaceStore } from '../../../stores/workspace'
import type { SettingsSectionId } from '../../../types/workspace'
import type { WorkspaceSettingSearchItem } from '../../../types/search'
import type { MobileSectionGroup } from '../../composables/useSettingsSections'

interface Props {
  groups: MobileSectionGroup[]
  searchQuery: string
  searchResults: WorkspaceSettingSearchItem[]
}

defineProps<Props>()
const emit = defineEmits<{
  select: [sectionId: SettingsSectionId]
  'select-result': [result: WorkspaceSettingSearchItem]
  'update:search': [value: string]
}>()

const { t } = useI18n()
const workspaceStore = useWorkspaceStore()
const { appMetadata } = storeToRefs(workspaceStore)
</script>

<template>
  <main class="mobile-settings__home tw:max-[719px]:pt-4 tw:max-[719px]:pr-[calc(16px+max(var(--safe-area-right),0px))] tw:max-[719px]:pb-[calc(28px+max(var(--safe-area-bottom),0px))] tw:max-[719px]:pl-[calc(16px+max(var(--safe-area-left),0px))] tw:min-h-0 tw:flex-1 tw:overflow-x-hidden tw:overflow-y-auto tw:overscroll-y-contain">
    <label class="mobile-settings__search tw:max-[719px]:bg-[color-mix(in_oklab,var(--frame-bg)_93%,var(--text-primary))] tw:max-[719px]:focus-within:bg-(--surface-raised) tw:max-[719px]:focus-within:shadow-[0_0_0_2px_var(--input-ring)] tw:flex tw:min-h-12 tw:items-center tw:gap-[10px] tw:rounded-[calc(12px*var(--radius-scale,1))] tw:border tw:border-transparent tw:px-[14px] tw:text-content-muted">
      <Search :size="18" aria-hidden="true" />
      <input
        :value="searchQuery"
        type="search"
        class="tw:h-[46px] tw:min-w-0 tw:w-full tw:border-0 tw:bg-transparent tw:font-nv-ui tw:text-[15px] tw:text-content-primary tw:outline-none tw:placeholder:text-content-muted"
        :placeholder="t('settings.search.placeholder')"
        :aria-label="t('settings.search.label')"
        autocomplete="off"
        @input="emit('update:search', ($event.target as HTMLInputElement).value)"
      >
    </label>

    <section v-if="searchQuery" class="mobile-settings__group tw:mt-6">
      <div class="mobile-settings__group-label tw:mx-1 tw:mt-0 tw:mb-2 tw:font-nv-mono tw:text-[10.5px] tw:font-medium tw:tracking-[0.06em] tw:text-content-muted tw:uppercase">
        {{ t('settings.search.resultsCount', { count: searchResults.length }) }}
      </div>
      <div class="mobile-settings__list tw:overflow-hidden tw:rounded-[calc(16px*var(--radius-scale,1))] tw:border tw:border-transparent tw:bg-[var(--island-bg)]">
        <button
          v-for="result in searchResults"
          :key="result.id"
          type="button"
          class="mobile-settings__row tw:max-[719px]:min-h-[68px] tw:[font-family:inherit] tw:flex tw:w-full tw:items-center tw:gap-3 tw:border-0 tw:bg-transparent tw:px-3 tw:py-[10px] tw:text-left tw:text-inherit tw:touch-manipulation tw:active:bg-[var(--hover)] tw:focus-visible:outline-2 tw:focus-visible:-outline-offset-2 tw:focus-visible:outline-accent"
          @click="emit('select-result', result)"
        >
          <span class="mobile-settings__row-copy tw:grid tw:min-w-0 tw:flex-1 tw:gap-[3px]">
            <strong class="tw:truncate tw:text-sm tw:leading-[1.25] tw:font-semibold tw:text-content-primary">{{ result.title }}</strong>
            <small class="tw:line-clamp-2 tw:overflow-hidden tw:text-xs tw:leading-[1.35] tw:text-content-muted">{{ result.sectionLabel }} · {{ result.description }}</small>
          </span>
          <ChevronRight :size="18" class="tw:flex-none tw:text-content-muted" aria-hidden="true" />
        </button>
        <div v-if="searchResults.length === 0" class="mobile-settings__empty tw:grid tw:justify-items-center tw:gap-2 tw:px-5 tw:py-8 tw:text-center tw:text-content-muted">
          <SearchX :size="24" aria-hidden="true" />
          <strong class="tw:text-sm tw:text-content-secondary">{{ t('settings.search.emptyTitle') }}</strong>
          <span class="tw:max-w-[260px] tw:text-xs tw:leading-[1.45]">{{ t('settings.search.emptyDescription') }}</span>
        </div>
      </div>
    </section>

    <template v-else>
      <section
        v-for="group in groups"
        :key="group.label"
        class="mobile-settings__group tw:mt-6"
      >
        <div class="mobile-settings__group-label tw:mx-1 tw:mt-0 tw:mb-2 tw:font-nv-mono tw:text-[10.5px] tw:font-medium tw:tracking-[0.06em] tw:text-content-muted tw:uppercase">{{ group.label }}</div>
        <div class="mobile-settings__list tw:overflow-hidden tw:rounded-[calc(16px*var(--radius-scale,1))] tw:border tw:border-transparent tw:bg-[var(--island-bg)]">
          <button
            v-for="item in group.items"
            :key="item.id"
            type="button"
            class="mobile-settings__row tw:max-[719px]:min-h-[68px] tw:[font-family:inherit] tw:flex tw:w-full tw:items-center tw:gap-3 tw:border-0 tw:bg-transparent tw:px-3 tw:py-[10px] tw:text-left tw:text-inherit tw:touch-manipulation tw:active:bg-[var(--hover)] tw:focus-visible:outline-2 tw:focus-visible:-outline-offset-2 tw:focus-visible:outline-accent"
            @click="emit('select', item.id)"
          >
            <span class="mobile-settings__icon tw:grid tw:size-10 tw:flex-[0_0_40px] tw:place-items-center tw:rounded-[calc(12px*var(--radius-scale,1))] tw:border tw:border-transparent tw:bg-[var(--accent-soft)] tw:text-accent">
              <component :is="item.section.icon" :size="19" />
            </span>
            <span class="mobile-settings__row-copy tw:grid tw:min-w-0 tw:flex-1 tw:gap-[3px]">
              <strong class="tw:truncate tw:text-sm tw:leading-[1.25] tw:font-semibold tw:text-content-primary">{{ item.section.label }}</strong>
              <small class="tw:line-clamp-2 tw:overflow-hidden tw:text-xs tw:leading-[1.35] tw:text-content-muted">{{ item.description }}</small>
            </span>
            <span v-if="item.section.count" class="mobile-settings__count tw:grid tw:h-[22px] tw:min-w-[22px] tw:place-items-center tw:rounded-full tw:bg-[var(--accent-soft)] tw:px-[6px] tw:text-[11px] tw:font-[650] tw:tabular-nums tw:text-accent">{{ item.section.count }}</span>
            <ChevronRight :size="18" class="tw:flex-none tw:text-content-muted" aria-hidden="true" />
          </button>
        </div>
      </section>
    </template>

    <div class="mobile-settings__version tw:mt-6 tw:font-nv-mono tw:text-[11px] tw:text-center tw:text-content-muted">
      Nevo · v{{ appMetadata?.version ?? '0.1.0' }}
    </div>
  </main>
</template>
