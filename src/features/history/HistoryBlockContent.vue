<script setup lang="ts">
import { computed } from 'vue'
import type { HistoryComparableBlock } from '../../utils/noteHistory'
import { useHistoryBlockType } from './historyBlockType'

interface Props {
  block: HistoryComparableBlock
}

const props = defineProps<Props>()
const { placeholder } = useHistoryBlockType()

// Font-family/size utilities are mutually exclusive per block type — a
// "special" type (list/table/callout) must not carry the default serif/xl
// utilities alongside its own, since both would target the same properties
// at equal specificity in `@layer utilities`.
const SPECIAL_TYPES = new Set(['callout', 'task_list', 'bullet_list', 'ordered_list', 'table'])

const paragraphTypeClass = computed(() => {
  const kind = `history-block-content--${props.block.type.replace(/_/g, '-')}`
  return SPECIAL_TYPES.has(props.block.type)
    ? `${kind} tw:font-nv-ui tw:text-base tw:max-[719px]:text-base`
    : `${kind} tw:[font-family:var(--font-serif)] tw:text-xl tw:max-[719px]:text-[17px]`
})
</script>

<template>
  <p v-if="!block.text" class="history-block-content history-block-content--empty tw:m-0 tw:font-nv-ui tw:text-sm tw:italic tw:text-content-muted">
    {{ placeholder(block.type) }}
  </p>
  <h2 v-else-if="block.type === 'heading'" class="history-block-content history-block-content--heading tw:m-0 tw:whitespace-pre-wrap tw:wrap-anywhere tw:[font-family:var(--font-serif)] tw:text-[clamp(28px,2.4vw,38px)] tw:leading-[1.15] tw:font-semibold tw:tracking-[-0.015em] tw:text-content-primary tw:max-[719px]:text-[27px]">
    {{ block.text }}
  </h2>
  <blockquote v-else-if="block.type === 'blockquote'" class="history-block-content history-block-content--quote tw:m-0 tw:whitespace-pre-wrap tw:wrap-anywhere tw:border-l-2 tw:border-l-(--accent-line) tw:pl-5 tw:[font-family:var(--font-serif)] tw:text-[22px] tw:leading-[1.55] tw:font-normal tw:text-content-secondary tw:max-[719px]:text-lg">
    {{ block.text }}
  </blockquote>
  <pre v-else-if="block.type === 'code_block'" class="history-block-content history-block-content--code tw:m-0 tw:overflow-x-auto tw:whitespace-pre-wrap tw:wrap-anywhere tw:rounded-nv-sm tw:border tw:border-solid tw:border-transparent tw:bg-(--hover) tw:px-4 tw:py-3.5 tw:font-nv-mono tw:text-[12.5px] tw:leading-[1.55] tw:text-content-secondary"><code>{{ block.text }}</code></pre>
  <p
    v-else
    class="history-block-content tw:m-0 tw:whitespace-pre-wrap tw:wrap-anywhere tw:leading-[1.55] tw:font-normal tw:text-content-secondary"
    :class="paragraphTypeClass"
  >
    {{ block.text }}
  </p>
</template>
