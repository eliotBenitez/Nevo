<script setup lang="ts">
import { computed, type Component } from 'vue'
import * as LucideIcons from 'lucide-vue-next'
import { lucideExportNameFromToken } from '../../utils/noteIcon'
import { isGlyphToken } from '../../utils/workspaceGlyphs'
import NvGlyph from './NvGlyph.vue'

interface Props {
  value: string
  size?: number
}

const props = withDefaults(defineProps<Props>(), {
  size: 16,
})

const iconSize = computed(() => `${props.size}px`)

const isGlyph = computed(() => isGlyphToken(props.value))

const lucideComponent = computed<Component | null>(() => {
  const exportName = lucideExportNameFromToken(props.value)
  if (!exportName) return null

  const candidate = (LucideIcons as Record<string, unknown>)[exportName]
  if (!candidate) return null
  if (typeof candidate !== 'object' && typeof candidate !== 'function') return null
  return candidate as Component
})

const emojiFallback = computed(() => {
  const value = props.value?.trim()
  return value || '📄'
})
</script>

<template>
  <span class="nv-note-icon" :style="{ fontSize: iconSize }">
    <NvGlyph v-if="isGlyph" :id="value" :size="size" />
    <component :is="lucideComponent" v-else-if="lucideComponent" :size="size" />
    <span v-else class="nv-note-icon__emoji">{{ emojiFallback }}</span>
  </span>
</template>
