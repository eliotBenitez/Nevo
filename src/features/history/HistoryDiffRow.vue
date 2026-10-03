<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { HistoryComparableBlock } from '../../utils/noteHistory'
import HistoryBlockContent from './HistoryBlockContent.vue'

interface Props {
  block: HistoryComparableBlock
  tone: 'added' | 'removed' | 'neutral'
  caption: string
  /** Only the "new" side of a changed pair carries this — see HistoryDiffPane. */
  badge?: boolean
}

const props = defineProps<Props>()
const { t } = useI18n()

// Border, background and padding utilities are mutually exclusive per tone —
// each branch must own the full set of properties it touches so no idle
// utility (e.g. the transparent border) coexists with a tone override at
// equal specificity.
const toneClass = computed(() => {
  switch (props.tone) {
    case 'added':
      return 'history-diff-row--added tw:border tw:border-solid tw:border-transparent tw:border-l-[3px] tw:border-l-(--success) tw:bg-(--surface-success) tw:px-[26px] tw:py-[22px]'
    case 'removed':
      return 'history-diff-row--removed tw:border tw:border-solid tw:border-transparent tw:border-l-[3px] tw:border-l-(--danger-line) tw:bg-(--surface-danger) tw:px-[26px] tw:py-[22px]'
    default:
      return 'history-diff-row--neutral tw:border tw:border-solid tw:border-transparent tw:bg-transparent tw:px-0 tw:py-3'
  }
})

const captionToneClass = computed(() => (props.tone === 'added' ? 'tw:text-(--success)' : 'tw:text-danger'))
</script>

<template>
  <article class="history-diff-row tw:min-w-0 tw:rounded-nv-md tw:text-content-secondary" :class="toneClass">
    <HistoryBlockContent :block="block" />
    <div v-if="tone !== 'neutral'" class="history-diff-row__footer tw:mt-3.5 tw:flex tw:items-center tw:gap-2">
      <span v-if="badge" class="history-diff-row__badge tw:inline-flex tw:items-center tw:rounded-full tw:border tw:border-solid tw:border-transparent tw:bg-[color-mix(in_oklab,var(--accent-soft)_78%,transparent)] tw:px-[7px] tw:py-px tw:text-[10px] tw:font-semibold tw:tracking-[0.05em] tw:text-accent tw:uppercase">{{ t('workspace.history.row.changed') }}</span>
      <span
        v-else
        class="history-diff-row__caption tw:font-nv-mono tw:text-[10.5px] tw:tracking-[0.06em] tw:uppercase"
        :class="captionToneClass"
      >{{ caption }}</span>
    </div>
  </article>
</template>

<style scoped src="../../styles/features/history/history-diff-row.css"></style>
