<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { WORKSPACE_GLYPHS, glyphToken } from '../../utils/workspaceGlyphs'
import NvGlyph from './NvGlyph.vue'

interface Props {
  value: string
}

defineProps<Props>()
const emit = defineEmits<{
  select: [value: string]
  close: []
}>()

const { t } = useI18n()

function onSelect(id: string) {
  emit('select', glyphToken(id))
}

function onDocumentKeyDown(event: KeyboardEvent) {
  if (event.key !== 'Escape') return
  event.stopPropagation()
  emit('close')
}

onMounted(() => {
  document.addEventListener('keydown', onDocumentKeyDown)
})

onBeforeUnmount(() => {
  document.removeEventListener('keydown', onDocumentKeyDown)
})
</script>

<template>
  <div class="nv-glyph-picker">
    <h4 class="nv-glyph-picker__title">{{ t('settings.workspace.identity.glyphPickerTitle') }}</h4>
    <div class="nv-glyph-picker__grid">
      <button
        v-for="glyph in WORKSPACE_GLYPHS"
        :key="glyph.id"
        type="button"
        class="nv-glyph-picker__item"
        :class="{ 'is-selected': value === glyphToken(glyph.id) }"
        :title="glyph.label"
        :aria-label="glyph.label"
        @click="onSelect(glyph.id)"
      >
        <NvGlyph :id="glyph.id" :size="20" />
      </button>
    </div>
  </div>
</template>
