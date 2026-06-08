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
    <div v-if="node" class="graph-tip" :style="style">
      <div class="graph-tip__icon">
        <NvNoteIcon :value="node.icon" :size="18" />
      </div>
      <div class="graph-tip__body">
        <div class="graph-tip__title">{{ node.title || t('graph.untitled') }}</div>
        <div class="graph-tip__meta">
          {{ node.degree }} {{ t('graph.connections') }}
        </div>
      </div>
    </div>
  </Transition>
</template>
