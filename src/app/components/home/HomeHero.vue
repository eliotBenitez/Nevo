<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { Search, Sparkles } from '@lucide/vue'
import { formatBytes } from '../../../utils/format-bytes'
import { pluralChoice } from '../../../utils/plural-index'

const props = defineProps<{
  workspaceName: string
  searchShortcut: string
  noteCount?: number
  workspaceBytes?: number
}>()

const emit = defineEmits<{ search: [] }>()
const { t, locale } = useI18n()
const meta = computed(() => {
  if (props.noteCount === undefined || props.workspaceBytes === undefined) return null
  const choice = pluralChoice(String(locale.value), props.noteCount)
  return t('workspace.home.meta', choice, {
    named: { notes: props.noteCount, size: formatBytes(props.workspaceBytes) },
  })
})
</script>

<template>
  <header class="workspace-home__hero tw:grid tw:w-[min(var(--home-width,1040px),100%)] tw:mx-auto tw:grid-cols-[minmax(0,1fr)_minmax(240px,320px)] tw:items-end tw:gap-8 tw:text-left tw:max-[899px]:grid-cols-[minmax(0,1fr)] tw:max-[899px]:items-stretch">
    <div class="workspace-home__hero-copy tw:min-w-0">
      <div class="workspace-home__eyebrow tw:inline-flex tw:items-center tw:gap-1.5 tw:text-content-muted tw:font-nv-mono tw:text-[10.5px] tw:font-medium tw:tracking-[0.06em] tw:uppercase tw:max-[719px]:text-[10px]">
        <Sparkles :size="14" aria-hidden="true" />
        <span>{{ t('workspace.home.eyebrow') }}</span>
      </div>
      <h1 class="tw:max-w-[22ch] tw:mt-2 tw:mb-0 tw:text-[28px] tw:font-semibold tw:tracking-[-0.02em] tw:leading-[1.15] tw:text-balance">{{ workspaceName }}</h1>
      <p v-if="meta !== null" class="workspace-home__meta tw:mt-1.5 tw:mb-0 tw:text-content-muted tw:font-nv-mono tw:text-xs tw:[font-variant-numeric:tabular-nums]">{{ meta }}</p>
    </div>
    <button
      type="button"
      class="workspace-home__search tw:flex tw:w-full tw:min-w-0 tw:min-h-9 tw:items-center tw:gap-2 tw:py-0 tw:pr-1.5 tw:pl-3 tw:border tw:border-solid tw:border-transparent tw:rounded-[calc(8px*var(--radius-scale,1))] tw:text-content-muted tw:text-[13px] tw:bg-[color-mix(in_oklab,var(--island-bg)_91%,var(--text-primary))] tw:text-left tw:transition-colors tw:duration-[var(--dur-base)] tw:hover:bg-[color-mix(in_oklab,var(--island-bg)_86%,var(--text-primary))] tw:focus-visible:outline-2 tw:focus-visible:outline-accent tw:focus-visible:outline-offset-2 tw:max-[719px]:min-h-11 tw:max-[719px]:rounded-[calc(10px*var(--radius-scale,1))] tw:max-[719px]:shadow-none"
      @click="emit('search')"
    >
      <Search :size="15" aria-hidden="true" />
      <span class="tw:min-w-0 tw:flex-1 tw:overflow-hidden tw:text-ellipsis tw:whitespace-nowrap">{{ t('workspace.home.search') }}</span>
      <kbd class="tw:py-0.5 tw:px-[5px] tw:border-0 tw:rounded tw:text-content-muted tw:font-nv-mono tw:text-[10.5px] tw:bg-[color-mix(in_oklab,var(--island-bg)_84%,var(--text-primary))] tw:max-[719px]:hidden tw:[@media(hover:none)_and_(pointer:coarse)]:hidden">{{ searchShortcut }}</kbd>
    </button>
  </header>
</template>

<style scoped src="../../../styles/app/home/hero.css"></style>
