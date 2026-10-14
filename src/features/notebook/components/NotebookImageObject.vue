<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { notebookImageMatrix } from '../../../core/notebook/image'
import type { NotebookImageV1 } from '../../../core/notebook/types'
import { workspaceAssetUrl } from '../../../utils/workspaceAssetUrl'

const props = defineProps<{ image: NotebookImageV1; selected?: boolean }>()

const failed = ref(false)
const href = computed(() => {
  try {
    return workspaceAssetUrl(props.image.src)
  } catch {
    return null
  }
})
watch(href, () => { failed.value = false })

const matrix = computed(() => `matrix(${notebookImageMatrix(props.image.points).join(' ')})`)
const outline = computed(() => props.image.points.map(point => `${point.x},${point.y}`).join(' '))
const showPlaceholder = computed(() => !href.value || failed.value)
</script>

<template>
  <g class="notebook-image tw:pointer-events-none" aria-hidden="true">
    <polygon v-if="showPlaceholder" class="notebook-image__placeholder tw:fill-[#eee] tw:stroke-[#b5b5b5] tw:stroke-1 tw:[vector-effect:non-scaling-stroke]" :points="outline" :opacity="image.opacity" />
    <image
      v-else
      :href="href ?? undefined"
      width="1"
      height="1"
      preserveAspectRatio="none"
      :transform="matrix"
      :opacity="image.opacity"
      @error="failed = true"
    />
    <polygon v-if="selected" class="notebook-image__outline tw:fill-none tw:stroke-accent tw:stroke-[1.4] tw:[vector-effect:non-scaling-stroke]" :points="outline" />
  </g>
</template>
