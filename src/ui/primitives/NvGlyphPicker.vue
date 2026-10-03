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

// Idle vs. selected are mutually exclusive, but `:hover` must keep winning
// over either branch — the original CSS's `:hover` (specificity 0,2,0)
// always beat `.is-selected` (0,1,0) regardless of source order, so both
// branches carry the same `hover:` utilities.
function itemClass(selected: boolean) {
  return selected
    ? 'is-selected tw:border-accent tw:bg-(--accent-soft) tw:text-content-primary tw:hover:bg-(--hover) tw:hover:text-content-primary'
    : 'tw:border-transparent tw:bg-transparent tw:text-content-secondary tw:hover:bg-(--hover) tw:hover:text-content-primary'
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
  <div class="nv-glyph-picker tw:flex tw:w-[min(360px,calc(100vw-24px))] tw:max-[900px]:w-[calc(100vw-24px)] tw:flex-col tw:gap-2.5 tw:rounded-[calc(12px*var(--radius-scale,1))] tw:border tw:border-solid tw:border-transparent tw:bg-(--menu-bg) tw:p-2.5 tw:shadow-(--menu-shadow)">
    <h4 class="nv-glyph-picker__title tw:m-0 tw:font-nv-mono tw:text-[10.5px] tw:tracking-[0.05em] tw:text-content-muted tw:uppercase">{{ t('settings.workspace.identity.glyphPickerTitle') }}</h4>
    <div class="nv-glyph-picker__grid tw:grid tw:grid-cols-6 tw:gap-1.5 tw:max-[900px]:grid-cols-5">
      <button
        v-for="glyph in WORKSPACE_GLYPHS"
        :key="glyph.id"
        type="button"
        class="nv-glyph-picker__item tw:inline-flex tw:h-9 tw:cursor-pointer tw:items-center tw:justify-center tw:rounded-[calc(8px*var(--radius-scale,1))] tw:border tw:border-solid tw:transition-[border-color,background-color,color] tw:duration-150"
        :class="itemClass(value === glyphToken(glyph.id))"
        :title="glyph.label"
        :aria-label="glyph.label"
        @click="onSelect(glyph.id)"
      >
        <NvGlyph :id="glyph.id" :size="20" />
      </button>
    </div>
  </div>
</template>
