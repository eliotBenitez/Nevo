<script setup lang="ts">
import { computed } from 'vue'
import { getGlyphDef } from '../../utils/workspaceGlyphs'

interface Props {
  id: string
  size?: number
}

const props = withDefaults(defineProps<Props>(), {
  size: 16,
})

const def = computed(() => getGlyphDef(props.id))
</script>

<template>
  <svg
    v-if="def"
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path v-for="(d, i) in def.paths" :key="i" :d="d" />
  </svg>
</template>
