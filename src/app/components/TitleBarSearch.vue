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
  <div class="titlebar-search">
    <button
      type="button"
      class="titlebar-search__field titlebar-search__field--trigger"
      :aria-label="t('workspace.titlebarSearch.placeholder')"
      @click="emit('open')"
    >
      <Search :size="13" class="titlebar-search__icon" />
      <span class="titlebar-search__label">{{ t('workspace.titlebarSearch.placeholder') }}</span>
      <div v-if="shortcutSegments.length" class="titlebar-search__hints">
        <div class="titlebar-search__hint-group">
          <kbd
            v-for="segment in shortcutSegments"
            :key="`shortcut-${segment}`"
            class="nv-kbd titlebar-search__hint-key"
          >
            {{ hintLabel(segment) }}
          </kbd>
        </div>
      </div>
    </button>
  </div>
</template>
