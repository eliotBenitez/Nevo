<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { SimNode } from '../composables/useGraphSimulation'
import type { CameraState } from '../composables/useGraphCamera'
import NvNoteIcon from '../../../ui/primitives/NvNoteIcon.vue'

interface Props {
  node: SimNode | null
  camera: CameraState
}

const props = defineProps<Props>()
const { t } = useI18n()

const style = computed(() => {
  if (!props.node) return {}
  const { scale, tx, ty } = props.camera
  const sx = props.node.x * scale + tx
  const sy = props.node.y * scale + ty
  return { left: `${sx + 14}px`, top: `${sy - 20}px` }
})
</script>

<template>
  <Transition name="tip">
    <div v-if="node" class="graph-tip tw:pointer-events-none tw:absolute tw:z-10 tw:flex tw:max-w-60 tw:items-center tw:gap-2.5 tw:rounded-[calc(12px*var(--radius-scale,1))] tw:border tw:border-solid tw:border-transparent tw:bg-(--menu-bg) tw:pt-[9px] tw:pr-[13px] tw:pb-[9px] tw:pl-2.5 tw:shadow-(--shadow-overlay)" :style="style">
      <div class="graph-tip__icon tw:grid tw:size-7 tw:shrink-0 tw:place-items-center tw:rounded-[calc(8px*var(--radius-scale,1))] tw:bg-(--hover-strong)">
        <NvNoteIcon :value="node.icon" :size="18" />
      </div>
      <div class="graph-tip__body">
        <div class="graph-tip__title tw:max-w-[180px] tw:truncate tw:text-[13px] tw:font-[520] tw:text-content-primary">{{ node.title || t('graph.untitled') }}</div>
        <div class="graph-tip__meta tw:mt-px tw:font-nv-mono tw:text-[11px] tw:text-content-muted">
          {{ node.degree }} {{ t('graph.connections') }}
        </div>
      </div>
    </div>
  </Transition>
</template>
