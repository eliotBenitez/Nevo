<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { diffWords } from '../../utils/text-diff'
import type { HistoryBlockChangeKind } from '../../utils/noteHistory'

/**
 * One "changed" diff row rendered as a single block with an inline word-level
 * diff, instead of a full "removed" block stacked on a full "added" block
 * (see HistoryDiffPane.vue). Sibling to HistoryDiffRow.vue, which still
 * renders whole added/removed blocks.
 *
 * `changes`/`changedAttrs`/`beforeType`/`afterType` explain a change that
 * doesn't show up in the text itself — same text, different formatting,
 * block type, attributes, or nested structure (see detectBlockChanges in
 * noteHistoryCanonical.ts). Without this, an identical-looking "Changed" row
 * reads as a false positive.
 */
interface Props {
  before: string
  after: string
  changes?: HistoryBlockChangeKind[]
  changedAttrs?: string[]
  beforeType?: string
  afterType?: string
}

const props = defineProps<Props>()
const { t } = useI18n()

const parts = computed(() => diffWords(props.before, props.after))

const extraChangeLines = computed(() => {
  if (!props.changes || props.changes.includes('text')) return []
  return props.changes
    .filter((kind): kind is Exclude<HistoryBlockChangeKind, 'text'> => kind !== 'text')
    .map(describeChange)
})

function describeChange(kind: Exclude<HistoryBlockChangeKind, 'text'>): string {
  switch (kind) {
    case 'type':
      return t('workspace.history.change.type', { from: props.beforeType ?? '', to: props.afterType ?? '' })
    case 'attrs':
      return t('workspace.history.change.attrs', { attrs: (props.changedAttrs ?? []).join(', ') })
    case 'marks':
      return t('workspace.history.change.marks')
    case 'structure':
      return t('workspace.history.change.structure')
  }
}
</script>

<template>
  <article class="history-diff-row-changed tw:min-w-0 tw:rounded-nv-md tw:border tw:border-solid tw:border-transparent tw:bg-[color-mix(in_oklab,var(--accent)_7%,var(--island-bg))] tw:px-[26px] tw:py-[22px] tw:[font-family:var(--font-serif)] tw:text-xl tw:leading-[1.55] tw:font-normal tw:text-content-secondary">
    <p class="history-diff-row-changed__content tw:m-0 tw:whitespace-pre-wrap tw:wrap-anywhere tw:text-content-primary">
      <template v-for="(part, index) in parts" :key="index">
        <span v-if="part.kind === 'removed'" class="history-diff-row-changed__removed tw:rounded-[2px] tw:bg-(--danger-soft) tw:text-content-muted tw:line-through tw:decoration-[color-mix(in_oklab,var(--danger)_60%,transparent)]">{{ part.text }}</span>
        <span v-else-if="part.kind === 'added'" class="history-diff-row-changed__added tw:rounded-[2px] tw:bg-(--success-soft) tw:text-content-primary">{{ part.text }}</span>
        <template v-else>{{ part.text }}</template>
      </template>
    </p>
    <div v-if="extraChangeLines.length" class="history-diff-row-changed__meta tw:mt-2 tw:flex tw:flex-col tw:gap-1 tw:font-nv-ui tw:text-xs tw:text-content-muted">
      <p v-for="(line, index) in extraChangeLines" :key="index" class="tw:m-0">{{ line }}</p>
    </div>
    <div class="history-diff-row-changed__footer tw:mt-3.5 tw:flex tw:items-center">
      <span class="history-diff-row-changed__badge tw:inline-flex tw:items-center tw:rounded-full tw:border tw:border-solid tw:border-transparent tw:bg-[color-mix(in_oklab,var(--accent-soft)_78%,transparent)] tw:px-[7px] tw:py-px tw:text-[10px] tw:font-semibold tw:tracking-[0.05em] tw:text-accent tw:uppercase">{{ t('workspace.history.row.changed') }}</span>
    </div>
  </article>
</template>
