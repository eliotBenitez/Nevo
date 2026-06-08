<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { Image as ImageIcon } from 'lucide-vue-next'
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
  <div ref="containerRef" class="doc-appearance">
    <div v-if="noteCoverStyle" class="doc-cover" :style="noteCoverStyle">
      <div class="doc-appearance-actions doc-appearance-actions--on-cover">
        <NvButton icon class="doc-appearance-btn" @click="openIconPicker">
          <NvNoteIcon :value="noteIcon" :size="14" />
        </NvButton>
        <NvButton class="doc-appearance-btn" @click="openCoverPanel">
          <ImageIcon :size="13" />
          <span>{{ t('workspace.cover') }}</span>
        </NvButton>
        <NvButton
          v-if="cover"
          variant="danger"
          class="doc-appearance-btn"
          @click="emit('removeCover')"
        >
          <span>{{ t('workspace.removeCover') }}</span>
        </NvButton>
      </div>
    </div>
    <div v-else class="doc-appearance-actions">
      <NvButton icon class="doc-appearance-btn" @click="openIconPicker">
        <NvNoteIcon :value="noteIcon" :size="14" />
      </NvButton>
      <NvButton class="doc-appearance-btn" @click="openCoverPanel">
        <ImageIcon :size="13" />
        <span>{{ t('workspace.cover') }}</span>
      </NvButton>
    </div>
    <NvIconPicker
      v-if="iconPickerOpen"
      class="doc-icon-picker-popover"
      :value="noteIcon"
      @close="closeIconPicker"
      @select="selectNoteIcon"
    />
    <div v-if="coverPanelOpen" class="doc-cover-panel">
      <div class="doc-cover-panel__group">
        <p class="doc-cover-panel__label">{{ t('workspace.coverGradients') }}</p>
        <div class="doc-cover-grid">
          <button
            v-for="gradient in coverGradientOptions"
            :key="gradient"
            type="button"
            class="doc-cover-swatch"
            :class="{ 'doc-cover-swatch--active': cover === `gradient:${gradient}` }"
            :style="{ background: gradient }"
            @click="emit('applyGradient', gradient)"
          />
        </div>
      </div>
      <div class="doc-cover-panel__group">
        <p class="doc-cover-panel__label">{{ t('workspace.coverPastel') }}</p>
        <div class="doc-cover-grid">
          <button
            v-for="pastel in coverPastelOptions"
            :key="pastel"
            type="button"
            class="doc-cover-swatch"
            :class="{ 'doc-cover-swatch--active': cover === `color:${pastel}` }"
            :style="{ background: pastel }"
            @click="emit('applyPastel', pastel)"
          />
        </div>
      </div>
      <NvButton class="doc-cover-upload" @click="emit('requestCoverImage')">
        {{ t('workspace.coverUpload') }}
      </NvButton>
    </div>
  </div>
</template>
