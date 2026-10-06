<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { Image as ImageIcon } from '@lucide/vue'
import NvButton from '../../../ui/primitives/NvButton.vue'
import NvIconPicker from '../../../ui/primitives/NvIconPicker.vue'
import NvNoteIcon from '../../../ui/primitives/NvNoteIcon.vue'
import { COVER_GRADIENTS, COVER_PASTEL_COLORS } from '../../../utils/workspaceGradients'

defineProps<{
  noteIcon: string
  noteCoverStyle: Record<string, string> | null
  cover: string | undefined
}>()

const emit = defineEmits<{
  selectIcon: [icon: string]
  applyGradient: [gradient: string]
  applyPastel: [color: string]
  removeCover: []
  requestCoverImage: []
}>()

const { t } = useI18n()

const containerRef = ref<HTMLDivElement | null>(null)
const iconPickerOpen = ref(false)
const coverPanelOpen = ref(false)

const coverGradientOptions = COVER_GRADIENTS
const coverPastelOptions = COVER_PASTEL_COLORS

const appearanceButtonClass = 'tw:inline-flex tw:h-[30px] tw:cursor-pointer tw:items-center tw:gap-1.5 tw:rounded-[calc(8px*var(--radius-scale,1))] tw:border tw:border-solid tw:border-transparent tw:bg-surface-subtle tw:px-2.5 tw:text-xs tw:font-medium tw:text-content-secondary tw:shadow-(--shadow-raised) tw:transition-[background-color,border-color,color,transform] tw:duration-140 tw:hover:bg-(--hover) tw:hover:text-content-primary tw:active:scale-[0.96]'
const coverButtonClass = 'tw:bg-[oklch(0.18_0.02_258/0.66)] tw:border-[oklch(1_0_0/0.3)] tw:text-[oklch(0.96_0.01_258)] tw:hover:bg-[oklch(0.22_0.03_258/0.8)] tw:hover:text-white'

function openIconPicker() {
  iconPickerOpen.value = !iconPickerOpen.value
  if (iconPickerOpen.value) coverPanelOpen.value = false
}

function openCoverPanel() {
  coverPanelOpen.value = !coverPanelOpen.value
  if (coverPanelOpen.value) iconPickerOpen.value = false
}

function selectNoteIcon(icon: string) {
  emit('selectIcon', icon)
  iconPickerOpen.value = false
}

function closeIconPicker() {
  iconPickerOpen.value = false
}

function onDocumentMouseDown(event: MouseEvent) {
  const target = event.target as Node | null
  if (!target) return
  if ((iconPickerOpen.value || coverPanelOpen.value) && !(containerRef.value?.contains(target) ?? false)) {
    iconPickerOpen.value = false
    coverPanelOpen.value = false
  }
}

onMounted(() => { document.addEventListener('mousedown', onDocumentMouseDown) })
onBeforeUnmount(() => { document.removeEventListener('mousedown', onDocumentMouseDown) })

defineExpose({ openIconPicker })
</script>

<template>
  <div ref="containerRef" class="doc-appearance tw:relative tw:flex tw:w-full tw:flex-col tw:gap-2.5" :class="{ 'doc-appearance--covered': noteCoverStyle }">
    <div v-if="noteCoverStyle" class="doc-cover tw:relative tw:mx-6 tw:h-[170px] tw:w-[calc(100%-48px)] tw:overflow-hidden tw:rounded-[calc(22px*var(--radius-scale,1))] tw:border tw:border-solid tw:border-transparent tw:shadow-none tw:max-[900px]:h-[152px]" :style="noteCoverStyle">
      <div class="doc-appearance-actions doc-appearance-actions--on-cover tw:absolute tw:top-3.5 tw:right-3.5 tw:left-3.5 tw:z-2 tw:flex tw:flex-wrap tw:justify-end tw:gap-2">
        <NvButton class="doc-appearance-btn" :class="[appearanceButtonClass, coverButtonClass]" @click="openCoverPanel">
          <ImageIcon :size="13" />
          <span>{{ t('workspace.cover') }}</span>
        </NvButton>
        <NvButton
          v-if="cover"
          variant="danger"
          class="doc-appearance-btn" :class="[appearanceButtonClass, coverButtonClass]"
          @click="emit('removeCover')"
        >
          <span>{{ t('workspace.removeCover') }}</span>
        </NvButton>
      </div>
    </div>
    <div v-else class="doc-appearance-actions tw:flex tw:flex-wrap tw:gap-2 tw:px-5 tw:max-[900px]:px-3">
      <NvButton icon class="doc-appearance-btn tw:w-8 tw:min-w-0 tw:justify-center tw:p-0" :class="appearanceButtonClass" @click="openIconPicker">
        <NvNoteIcon :value="noteIcon" :size="14" />
      </NvButton>
      <NvButton class="doc-appearance-btn" :class="appearanceButtonClass" @click="openCoverPanel">
        <ImageIcon :size="13" />
        <span>{{ t('workspace.cover') }}</span>
      </NvButton>
    </div>
    <NvIconPicker
      v-if="iconPickerOpen"
      class="doc-icon-picker-popover tw:absolute tw:top-[calc(100%+8px)] tw:left-5 tw:z-20 tw:m-0 tw:max-[900px]:left-3 tw:max-[900px]:w-[min(400px,calc(100vw-24px))]"
      :value="noteIcon"
      @close="closeIconPicker"
      @select="selectNoteIcon"
    />
    <div v-if="coverPanelOpen" class="doc-cover-panel tw:absolute tw:top-[calc(100%+8px)] tw:left-5 tw:z-20 tw:m-0 tw:flex tw:w-[min(430px,calc(100vw-40px))] tw:flex-col tw:gap-2.5 tw:rounded-[calc(10px*var(--radius-scale,1))] tw:border tw:border-solid tw:border-transparent tw:bg-(--menu-bg) tw:p-2.5 tw:max-[900px]:left-3 tw:max-[900px]:w-[min(400px,calc(100vw-24px))]">
      <div class="doc-cover-panel__group tw:flex tw:flex-col tw:gap-1.5">
        <p class="doc-cover-panel__label tw:m-0 tw:font-nv-mono tw:text-[11px] tw:tracking-[0.06em] tw:text-content-muted tw:uppercase">{{ t('workspace.coverGradients') }}</p>
        <div class="doc-cover-grid tw:grid tw:grid-cols-4 tw:gap-2 tw:max-[900px]:grid-cols-3">
          <button
            v-for="gradient in coverGradientOptions"
            :key="gradient"
            type="button"
            class="doc-cover-swatch tw:h-[34px] tw:cursor-pointer tw:rounded-[calc(8px*var(--radius-scale,1))] tw:border tw:border-solid"
            :class="cover === `gradient:${gradient}` ? 'doc-cover-swatch--active tw:border-accent tw:shadow-[0_0_0_2px_var(--accent-soft)]' : 'tw:border-line-default'"
            :style="{ background: gradient }"
            @click="emit('applyGradient', gradient)"
          />
        </div>
      </div>
      <div class="doc-cover-panel__group tw:flex tw:flex-col tw:gap-1.5">
        <p class="doc-cover-panel__label tw:m-0 tw:font-nv-mono tw:text-[11px] tw:tracking-[0.06em] tw:text-content-muted tw:uppercase">{{ t('workspace.coverPastel') }}</p>
        <div class="doc-cover-grid tw:grid tw:grid-cols-4 tw:gap-2 tw:max-[900px]:grid-cols-3">
          <button
            v-for="pastel in coverPastelOptions"
            :key="pastel"
            type="button"
            class="doc-cover-swatch tw:h-[34px] tw:cursor-pointer tw:rounded-[calc(8px*var(--radius-scale,1))] tw:border tw:border-solid"
            :class="cover === `color:${pastel}` ? 'doc-cover-swatch--active tw:border-accent tw:shadow-[0_0_0_2px_var(--accent-soft)]' : 'tw:border-line-default'"
            :style="{ background: pastel }"
            @click="emit('applyPastel', pastel)"
          />
        </div>
      </div>
      <NvButton class="doc-cover-upload tw:h-[30px] tw:cursor-pointer tw:rounded-[calc(8px*var(--radius-scale,1))] tw:border tw:border-solid tw:border-transparent tw:bg-surface-subtle tw:px-2.5 tw:text-left tw:text-xs tw:text-content-secondary tw:hover:bg-(--hover) tw:hover:text-content-primary" @click="emit('requestCoverImage')">
        {{ t('workspace.coverUpload') }}
      </NvButton>
    </div>
  </div>
</template>
