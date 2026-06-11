<script setup lang="ts">
import { RotateCcw } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'
import type { EdgeKind } from '../../../types/graph'

interface Props {
  nodeCount: number
  edgeCount: number
  showLabels: boolean
  filters: Set<EdgeKind>
  zoom: number
  focusedNodeTitle?: string | null
  experimentalEnabled?: boolean
  showArrows?: boolean
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

const { t } = useI18n()

const KINDS: { id: EdgeKind; label: string }[] = [
  { id: 'link', label: '⟶' },
  { id: 'embed', label: '⊞' },
  { id: 'mention', label: '@' },
  { id: 'parent', label: '↑' },
]
</script>

<template>
  <div class="graph-controls">
    <div class="gc-panel">
      <!-- Zoom row -->
      <div class="gc-zoom">
        <button class="gc-zoom__btn" @click="emit('zoom-out')">−</button>
        <span class="gc-zoom__pct">{{ Math.round(zoom * 100) }}%</span>
        <button class="gc-zoom__btn" @click="emit('zoom-in')">+</button>
        <div class="gc-divider" />
        <button class="gc-zoom__btn gc-zoom__reset" :title="t('graph.resetView')" @click="emit('reset')">
          <RotateCcw :size="11" />
        </button>
      </div>

      <div class="gc-sep" />

      <!-- Filters -->
      <div class="gc-filters">
        <button
          v-if="focusedNodeTitle"
          class="gc-chip gc-chip--on gc-chip--focus"
          :title="t('graph.clearFocus')"
          :aria-label="t('graph.clearFocus')"
          @click="emit('reset-focus')"
        >
          <span class="gc-chip__dot gc-chip__dot--focus" />
          <span class="gc-chip__label">{{ focusedNodeTitle }}</span>
        </button>
        <button
          v-for="k in KINDS"
          :key="k.id"
          class="gc-chip"
          :class="{ 'gc-chip--on': filters.has(k.id) }"
          :title="t(`graph.kind.${k.id}`)"
          @click="emit('toggle-filter', k.id)"
        >
          <span class="gc-chip__dot" :class="`gc-chip__dot--${k.id}`" />
          {{ t(`graph.kind.${k.id}`) }}
        </button>
        <button
          class="gc-chip"
          :class="{ 'gc-chip--on': showLabels }"
          @click="emit('toggle-labels')"
        >
          <span class="gc-chip__dot gc-chip__dot--label" />
          {{ t('graph.showLabels') }}
        </button>
        <button
          v-if="experimentalEnabled"
          class="gc-chip"
          :class="{ 'gc-chip--on': showArrows }"
          @click="emit('toggle-arrows')"
        >
          <span class="gc-chip__dot gc-chip__dot--arrow" />
          {{ t('graph.showArrows') }}
        </button>
      </div>

      <div class="gc-sep" />

      <!-- Stats -->
      <div class="gc-stats">
        <span>{{ nodeCount }}</span>
        <span class="gc-stats__label">{{ t('graph.nodes') }}</span>
        <span class="gc-stats__dot">·</span>
        <span>{{ edgeCount }}</span>
        <span class="gc-stats__label">{{ t('graph.edges') }}</span>
      </div>
    </div>
  </div>
</template>
