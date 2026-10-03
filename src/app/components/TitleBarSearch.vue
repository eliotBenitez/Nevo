<script setup lang="ts">
import { computed } from 'vue'
import { Search } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'

interface Props {
  searchShortcut?: string
}

const props = defineProps<Props>()
const emit = defineEmits<{
  open: []
}>()

const { t } = useI18n()

const shortcutSegments = computed(() => {
  const shortcut = props.searchShortcut?.trim()
  if (!shortcut) return []
  return shortcut
    .split('+')
    .map(segment => segment.trim())
    .filter(Boolean)
})

function hintLabel(segment: string): string {
  if (segment === 'Space') return t('settings.hotkeys.keys.space')
  return segment
}
</script>

<template>
  <div class="titlebar-search tw:relative tw:w-full tw:min-w-0 tw:[-webkit-app-region:no-drag]">
    <button
      type="button"
      data-tour="search"
      class="titlebar-search__field titlebar-search__field--trigger tw:flex tw:w-full tw:h-7 tw:min-h-7 tw:items-center tw:gap-2 tw:py-0 tw:pr-1 tw:pl-2.5 tw:border tw:border-solid tw:border-transparent tw:rounded-[calc(8px*var(--radius-scale,1))] tw:bg-[color-mix(in_oklab,var(--frame-bg)_93%,var(--text-primary))] tw:text-inherit tw:[font:inherit] tw:cursor-pointer tw:focus-visible:outline-none tw:focus-visible:shadow-[0_0_0_2px_var(--accent)]"
      :aria-label="t('workspace.titlebarSearch.placeholder')"
      @click="emit('open')"
    >
      <Search :size="14" class="titlebar-search__icon tw:shrink-0 tw:text-content-muted" aria-hidden="true" />
      <span class="titlebar-search__label tw:overflow-hidden tw:w-full tw:min-w-0 tw:text-content-muted tw:text-[12.5px] tw:text-left tw:text-ellipsis tw:whitespace-nowrap">{{ t('workspace.titlebarSearch.placeholder') }}</span>
      <div v-if="shortcutSegments.length" class="titlebar-search__hints tw:inline-flex tw:items-center tw:gap-2 tw:flex-none tw:pl-1 tw:border-l-0">
        <div class="titlebar-search__hint-group tw:inline-flex tw:items-center tw:gap-0.5">
          <kbd
            v-for="segment in shortcutSegments"
            :key="`shortcut-${segment}`"
            class="nv-kbd titlebar-search__hint-key tw:min-w-0 tw:h-[18px] tw:py-0 tw:px-1 tw:border-0 tw:rounded-[4px] tw:bg-[color-mix(in_oklab,var(--frame-bg)_86%,var(--text-primary))] tw:text-content-muted tw:text-[10.5px] tw:leading-[18px]"
          >
            {{ hintLabel(segment) }}
          </kbd>
        </div>
      </div>
    </button>
  </div>
</template>
