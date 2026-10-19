<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { HeadingOutlineItem } from './headingOutline'

const props = defineProps<{
  items: readonly HeadingOutlineItem[]
  activeIndex: number
}>()

const emit = defineEmits<{ select: [index: number] }>()

const { t } = useI18n()

const DASH_WIDTH_BY_DEPTH = ['16px', '12px', '8px']

// Indent relative to the shallowest heading so an H2-only note is not shifted right.
const minLevel = computed(() => Math.min(...props.items.map((item) => item.level)))
const depthOf = (item: HeadingOutlineItem) => item.level - minLevel.value
</script>

<template>
  <!-- Collapsed: a column of dashes. Hover or keyboard focus opens the labelled outline card beside it. -->
  <nav
    class="editor-outline-rail tw:group tw:absolute tw:top-1/2 tw:right-3 tw:z-3 tw:-translate-y-1/2 tw:max-[900px]:hidden"
    :aria-label="t('workspace.outline.label')"
  >
    <div class="tw:flex tw:max-h-[60vh] tw:flex-col tw:items-end tw:gap-2 tw:overflow-hidden tw:px-1.5 tw:py-2" aria-hidden="true">
      <span
        v-for="(item, index) in items"
        :key="item.pos"
        class="tw:h-0.5 tw:shrink-0 tw:rounded-full tw:transition-colors tw:duration-140 tw:motion-reduce:transition-none"
        :class="index === activeIndex
          ? 'tw:bg-content-primary'
          : 'tw:bg-[color-mix(in_oklab,var(--text-secondary)_35%,transparent)]'"
        :style="{ width: DASH_WIDTH_BY_DEPTH[depthOf(item)] ?? '6px' }"
      />
    </div>

    <!-- The right padding bridges the gap to the rail so the pointer can cross without closing the card. -->
    <div class="tw:pointer-events-none tw:absolute tw:top-1/2 tw:right-full tw:-translate-y-1/2 tw:translate-x-1 tw:pr-2 tw:opacity-0 tw:transition-[opacity,translate] tw:duration-140 tw:group-hover:pointer-events-auto tw:group-hover:translate-x-0 tw:group-hover:opacity-100 tw:group-focus-within:pointer-events-auto tw:group-focus-within:translate-x-0 tw:group-focus-within:opacity-100 tw:motion-reduce:transition-none">
      <ul class="tw:m-0 tw:flex tw:max-h-[min(70vh,520px)] tw:w-[260px] tw:list-none tw:flex-col tw:gap-px tw:overflow-y-auto tw:rounded-[calc(12px*var(--radius-scale,1))] tw:border tw:border-solid tw:border-(--workspace-control-border) tw:bg-(--surface-raised) tw:p-1.5 tw:shadow-(--shadow-overlay)">
        <li v-for="(item, index) in items" :key="item.pos">
          <button
            type="button"
            class="tw:block tw:w-full tw:cursor-pointer tw:truncate tw:rounded-[calc(8px*var(--radius-scale,1))] tw:border-0 tw:py-1.5 tw:pr-2.5 tw:text-left tw:font-nv-ui tw:text-[13px] tw:leading-[1.35] tw:outline-none tw:transition-colors tw:duration-120 tw:hover:bg-surface-subtle tw:hover:text-content-primary tw:focus-visible:shadow-[0_0_0_2px_var(--input-ring)] tw:motion-reduce:transition-none"
            :class="[
              index === activeIndex ? 'tw:bg-surface-subtle tw:text-accent' : 'tw:bg-transparent tw:text-content-secondary',
              depthOf(item) === 0 ? 'tw:font-medium' : '',
            ]"
            :style="{ paddingLeft: `${10 + depthOf(item) * 14}px` }"
            :aria-current="index === activeIndex ? 'location' : undefined"
            @click="emit('select', index)"
          >{{ item.text || t('workspace.outline.emptyHeading') }}</button>
        </li>
      </ul>
    </div>
  </nav>
</template>
