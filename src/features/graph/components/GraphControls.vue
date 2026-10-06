<script setup lang="ts">
import { RotateCcw } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import { pluralChoice } from '../../../utils/plural-index'
import type { EdgeKind } from '../../../types/graph'
import { useFirstUseHint } from '../../onboarding/hints/useFirstUseHint'

interface Props {
  nodeCount: number
  edgeCount: number
  showLabels: boolean
  filters: Set<EdgeKind>
  zoom: number
  focusedNodeTitle?: string | null
  experimentalEnabled?: boolean
  showArrows?: boolean
  mobileFiltersOpen?: boolean
}

defineProps<Props>()
const emit = defineEmits<{
  'zoom-in': []
  'zoom-out': []
  'reset': []
  'reset-focus': []
  'toggle-labels': []
  'toggle-arrows': []
  'toggle-filter': [kind: EdgeKind]
}>()

const { t, locale } = useI18n()

useFirstUseHint('graphFilters')

const KINDS: { id: EdgeKind; label: string }[] = [
  { id: 'link', label: '⟶' },
  { id: 'embed', label: '⊞' },
  { id: 'mention', label: '@' },
  { id: 'parent', label: '↑' },
]

const KIND_DOT_CLASSES: Record<EdgeKind, string> = {
  link: 'tw:bg-[oklch(0.68_0.14_220)]',
  embed: 'tw:bg-[oklch(0.68_0.14_120)]',
  mention: 'tw:bg-[oklch(0.68_0.14_45)]',
  parent: 'tw:bg-[oklch(0.68_0.14_300)]',
}
</script>

<template>
  <div
    class="graph-controls tw:group tw:pointer-events-none tw:absolute tw:right-4 tw:bottom-4 tw:max-[719px]:right-[calc(14px_+_max(var(--safe-area-right),0px))] tw:max-[719px]:bottom-[calc(18px_+_max(var(--safe-area-bottom),0px))] tw:max-[719px]:data-[open=true]:left-[calc(14px_+_max(var(--safe-area-left),0px))]"
    :class="{ 'graph-controls--filters-open': mobileFiltersOpen }"
    :data-open="mobileFiltersOpen"
  >
    <div class="gc-panel tw:pointer-events-auto tw:flex tw:min-w-[180px] tw:flex-col tw:gap-2 tw:rounded-[calc(14px*var(--radius-scale,1))] tw:border tw:border-solid tw:border-transparent tw:bg-(--menu-bg) tw:p-2.5 tw:shadow-(--shadow-overlay) tw:max-[719px]:max-h-[min(46vh,320px)] tw:max-[719px]:w-auto tw:max-[719px]:min-w-0 tw:max-[719px]:max-w-[calc(100vw_-_28px_-_max(var(--safe-area-right),0px)_-_max(var(--safe-area-left),0px))] tw:max-[719px]:gap-1.5 tw:max-[719px]:p-2 tw:max-[719px]:group-data-[open=true]:w-full">
      <!-- Zoom row -->
      <div class="gc-zoom tw:flex tw:items-center tw:gap-0.5">
        <button
          class="gc-zoom__btn tw:grid tw:size-7 tw:cursor-pointer tw:place-items-center tw:rounded-[calc(8px*var(--radius-scale,1))] tw:border-none tw:bg-transparent tw:text-base tw:leading-none tw:font-light tw:text-content-secondary tw:transition-colors tw:duration-100 tw:hover:bg-(--hover-strong) tw:hover:text-content-primary tw:max-[719px]:size-11 tw:max-[719px]:touch-manipulation"
          :title="t('graph.zoomOut')"
          :aria-label="t('graph.zoomOut')"
          @click="emit('zoom-out')"
        >−</button>
        <span class="gc-zoom__pct tw:flex-1 tw:select-none tw:text-center tw:font-nv-mono tw:text-xs tw:text-content-muted">{{ Math.round(zoom * 100) }}%</span>
        <button
          class="gc-zoom__btn tw:grid tw:size-7 tw:cursor-pointer tw:place-items-center tw:rounded-[calc(8px*var(--radius-scale,1))] tw:border-none tw:bg-transparent tw:text-base tw:leading-none tw:font-light tw:text-content-secondary tw:transition-colors tw:duration-100 tw:hover:bg-(--hover-strong) tw:hover:text-content-primary tw:max-[719px]:size-11 tw:max-[719px]:touch-manipulation"
          :title="t('graph.zoomIn')"
          :aria-label="t('graph.zoomIn')"
          @click="emit('zoom-in')"
        >+</button>
        <div class="gc-divider tw:mx-0.5 tw:h-4 tw:w-px tw:bg-line-default" />
        <button class="gc-zoom__btn gc-zoom__reset tw:grid tw:size-7 tw:cursor-pointer tw:place-items-center tw:rounded-[calc(8px*var(--radius-scale,1))] tw:border-none tw:bg-transparent tw:text-base tw:leading-none tw:font-light tw:text-content-muted tw:transition-colors tw:duration-100 tw:hover:bg-(--hover-strong) tw:hover:text-content-primary tw:max-[719px]:size-11 tw:max-[719px]:touch-manipulation" :title="t('graph.resetView')" :aria-label="t('graph.resetView')" @click="emit('reset')">
          <RotateCcw :size="11" />
        </button>
      </div>

      <div class="gc-sep tw:mx-[-2px] tw:h-px tw:bg-(--border-subtle) tw:max-[719px]:hidden tw:max-[719px]:group-data-[open=true]:flex" />

      <!-- Filters -->
      <div data-hint="graphFilters" class="gc-filters tw:flex tw:flex-wrap tw:gap-1 tw:max-[719px]:hidden tw:max-[719px]:flex-nowrap tw:max-[719px]:gap-1 tw:max-[719px]:overflow-x-auto tw:max-[719px]:overscroll-x-contain tw:max-[719px]:pb-0.5 tw:max-[719px]:[scrollbar-width:none] tw:max-[719px]:[&::-webkit-scrollbar]:hidden tw:max-[719px]:group-data-[open=true]:flex">
        <button
          v-if="focusedNodeTitle"
          class="gc-chip gc-chip--on gc-chip--focus tw:flex tw:h-6 tw:max-w-36 tw:cursor-pointer tw:items-center tw:gap-[5px] tw:whitespace-nowrap tw:rounded-[calc(20px*var(--radius-scale,1))] tw:border tw:border-solid tw:border-transparent tw:bg-[color-mix(in_oklab,var(--accent)_10%,transparent)] tw:px-2 tw:text-[11.5px] tw:text-accent tw:transition-colors tw:duration-120 tw:hover:bg-[color-mix(in_oklab,var(--accent)_10%,transparent)] tw:max-[719px]:min-h-11 tw:max-[719px]:shrink-0 tw:max-[719px]:touch-manipulation"
          :title="t('graph.clearFocus')"
          :aria-label="t('graph.clearFocus')"
          @click="emit('reset-focus')"
        >
          <span class="gc-chip__dot gc-chip__dot--focus tw:size-1.5 tw:shrink-0 tw:rounded-full tw:bg-accent tw:opacity-70" />
          <span class="gc-chip__label tw:truncate">{{ focusedNodeTitle }}</span>
        </button>
        <button
          v-for="k in KINDS"
          :key="k.id"
          class="gc-chip tw:flex tw:h-6 tw:cursor-pointer tw:items-center tw:gap-[5px] tw:whitespace-nowrap tw:rounded-[calc(20px*var(--radius-scale,1))] tw:border tw:border-solid tw:border-transparent tw:bg-surface-subtle tw:px-2 tw:text-[11.5px] tw:text-content-muted tw:transition-colors tw:duration-120 tw:hover:bg-(--hover) tw:hover:text-content-secondary tw:aria-pressed:bg-[color-mix(in_oklab,var(--accent)_10%,transparent)] tw:aria-pressed:text-accent tw:aria-pressed:hover:bg-[color-mix(in_oklab,var(--accent)_10%,transparent)] tw:aria-pressed:hover:text-accent tw:max-[719px]:min-h-11 tw:max-[719px]:shrink-0 tw:max-[719px]:touch-manipulation"
          :class="{ 'gc-chip--on': filters.has(k.id) }"
          :aria-pressed="filters.has(k.id)"
          :title="t(`graph.kind.${k.id}`)"
          @click="emit('toggle-filter', k.id)"
        >
          <span class="gc-chip__dot tw:size-1.5 tw:shrink-0 tw:rounded-full tw:opacity-70" :class="[`gc-chip__dot--${k.id}`, KIND_DOT_CLASSES[k.id]]" />
          {{ t(`graph.kind.${k.id}`) }}
        </button>
        <button
          class="gc-chip tw:flex tw:h-6 tw:cursor-pointer tw:items-center tw:gap-[5px] tw:whitespace-nowrap tw:rounded-[calc(20px*var(--radius-scale,1))] tw:border tw:border-solid tw:border-transparent tw:bg-surface-subtle tw:px-2 tw:text-[11.5px] tw:text-content-muted tw:transition-colors tw:duration-120 tw:hover:bg-(--hover) tw:hover:text-content-secondary tw:aria-pressed:bg-[color-mix(in_oklab,var(--accent)_10%,transparent)] tw:aria-pressed:text-accent tw:aria-pressed:hover:bg-[color-mix(in_oklab,var(--accent)_10%,transparent)] tw:aria-pressed:hover:text-accent tw:max-[719px]:min-h-11 tw:max-[719px]:shrink-0 tw:max-[719px]:touch-manipulation"
          :class="{ 'gc-chip--on': showLabels }"
          :aria-pressed="showLabels"
          @click="emit('toggle-labels')"
        >
          <span class="gc-chip__dot gc-chip__dot--label tw:size-1.5 tw:shrink-0 tw:rounded-full tw:bg-content-muted tw:opacity-70" />
          {{ t('graph.showLabels') }}
        </button>
        <button
          v-if="experimentalEnabled"
          class="gc-chip tw:flex tw:h-6 tw:cursor-pointer tw:items-center tw:gap-[5px] tw:whitespace-nowrap tw:rounded-[calc(20px*var(--radius-scale,1))] tw:border tw:border-solid tw:border-transparent tw:bg-surface-subtle tw:px-2 tw:text-[11.5px] tw:text-content-muted tw:transition-colors tw:duration-120 tw:hover:bg-(--hover) tw:hover:text-content-secondary tw:aria-pressed:bg-[color-mix(in_oklab,var(--accent)_10%,transparent)] tw:aria-pressed:text-accent tw:aria-pressed:hover:bg-[color-mix(in_oklab,var(--accent)_10%,transparent)] tw:aria-pressed:hover:text-accent tw:max-[719px]:min-h-11 tw:max-[719px]:shrink-0 tw:max-[719px]:touch-manipulation"
          :class="{ 'gc-chip--on': showArrows }"
          :aria-pressed="showArrows"
          @click="emit('toggle-arrows')"
        >
          <span class="gc-chip__dot gc-chip__dot--arrow tw:size-1.5 tw:shrink-0 tw:rounded-full tw:bg-[oklch(0.68_0.14_170)] tw:opacity-70" />
          {{ t('graph.showArrows') }}
        </button>
      </div>

      <div class="gc-sep tw:mx-[-2px] tw:h-px tw:bg-(--border-subtle) tw:max-[719px]:hidden tw:max-[719px]:group-data-[open=true]:flex" />

      <!-- Stats -->
      <div class="gc-stats tw:flex tw:items-center tw:gap-1 tw:px-0.5 tw:font-nv-mono tw:text-[11px] tw:text-content-muted tw:max-[719px]:hidden tw:max-[719px]:min-h-5 tw:max-[719px]:group-data-[open=true]:flex">
        <span>{{ t('graph.nodeCount', pluralChoice(String(locale), nodeCount), { named: { total: nodeCount } }) }}</span>
        <span class="gc-stats__dot tw:opacity-40">·</span>
        <span>{{ t('graph.edgeCount', pluralChoice(String(locale), edgeCount), { named: { total: edgeCount } }) }}</span>
      </div>
    </div>
  </div>
</template>
