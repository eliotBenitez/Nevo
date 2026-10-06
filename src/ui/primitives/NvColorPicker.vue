<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { ChevronDown } from '@lucide/vue'
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { HIGHLIGHT_COLORS, TEXT_COLORS } from '../../utils/editorColors'
import {
  DEFAULT_CUSTOM,
  NEUTRAL_COLORS,
  colorsMatch,
  hsvToHex,
  normalizeHex,
  rgbToHsv,
  type ColorOption,
} from '../../utils/colorConversion'
import { usePopupPosition } from '../composables/usePopupPosition'
import type { Placement } from './menu-types'
import ColorSwatchGrid from './color-picker/ColorSwatchGrid.vue'
import ColorCustomEditor from './color-picker/ColorCustomEditor.vue'

type DisplayMode = 'popover' | 'inline'

const DEFAULT_COLORS: ColorOption[] = [...HIGHLIGHT_COLORS, ...TEXT_COLORS, ...NEUTRAL_COLORS]

const props = withDefaults(
  defineProps<{
    modelValue?: string | null
    colors?: ColorOption[]
    allowNone?: boolean
    variant?: 'default' | 'inline'
    display?: DisplayMode
    hideCustom?: boolean
    /** `swatch` renders a compact square color button; pair it with `triggerLabel`. */
    trigger?: 'default' | 'swatch'
    triggerLabel?: string
    /** Disables the `swatch` trigger. */
    disabled?: boolean
  }>(),
  {
    allowNone: false,
    variant: 'default',
    hideCustom: false,
    trigger: 'default',
    triggerLabel: undefined,
    disabled: false,
    modelValue: undefined,
    colors: undefined,
    display: undefined,
  },
)

const emit = defineEmits<{
  'update:modelValue': [value: string | null]
}>()

defineSlots<{
  /** Extra popover sections rendered between the swatch grid and the custom editor. */
  sections?: (props: { select: (color: string) => void }) => unknown
}>()

const { t } = useI18n()

const resolvedColors = computed(() => props.colors ?? DEFAULT_COLORS)
const effectiveDisplay = computed<DisplayMode>(() => props.display ?? (props.variant === 'inline' ? 'inline' : 'popover'))

const triggerRef = ref<HTMLButtonElement | null>(null)
const panelRef = ref<HTMLDivElement | null>(null)
const customTriggerRef = ref<HTMLButtonElement | null>(null)
const customPanelRef = ref<HTMLDivElement | null>(null)
const isOpen = ref(false)
const isCustomOpen = ref(false)
const POPOVER_WIDTH = 280
const CUSTOM_POPOVER_WIDTH = 236
const popoverPlacement = ref<Placement>('auto')
const popoverOffset = ref<[number, number]>([0, 8])
const { position: popoverPos, reposition: updatePopoverPosition } = usePopupPosition({
  anchorRef: triggerRef,
  popupRef: panelRef,
  placement: popoverPlacement,
  offset: popoverOffset,
  viewportPadding: 12,
})
const { position: customPopoverPos, reposition: updateCustomPopoverPosition } = usePopupPosition({
  anchorRef: customTriggerRef,
  popupRef: customPanelRef,
  placement: popoverPlacement,
  offset: popoverOffset,
  viewportPadding: 12,
})

const customHex = ref(normalizeHex(props.modelValue) ?? DEFAULT_CUSTOM)
const hexInput = ref(customHex.value)
const isHexInvalid = ref(false)
const isHexDirty = ref(false)
const hue = ref(0)
const saturation = ref(0)
const value = ref(0)
const isDraggingSv = ref(false)

const selectedOption = computed(() => {
  return resolvedColors.value.find(option => colorsMatch(option.color, props.modelValue ?? null)) ?? null
})

const selectedSolidHex = computed(() => normalizeHex(props.modelValue))
const activeHex = computed(() => selectedSolidHex.value ?? customHex.value)
const defaultTriggerLabel = computed(() => {
  if (!props.modelValue) return props.allowNone ? t('editor.colorPicker.none') : t('editor.colorPicker.color')
  if (selectedOption.value?.label) return selectedOption.value.label
  return selectedSolidHex.value?.toUpperCase() ?? t('editor.colorPicker.presets')
})

const svBackground = computed(() => {
  const hueColor = hsvToHex(hue.value, 100, 100)
  return {
    background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, ${hueColor})`,
  }
})

const svThumbStyle = computed(() => ({
  left: `${saturation.value}%`,
  top: `${100 - value.value}%`,
  background: activeHex.value,
}))

const previewStyle = computed(() => {
  if (!props.modelValue) return {}
  return { background: props.modelValue }
})

syncFromHex(activeHex.value)

watch(
  () => props.modelValue,
  (nextValue) => {
    const normalized = normalizeHex(nextValue)
    if (!normalized) return
    customHex.value = normalized
    hexInput.value = normalized
    isHexInvalid.value = false
    isHexDirty.value = false
    syncFromHex(normalized)
  },
)

watch(effectiveDisplay, (mode) => {
  if (mode === 'inline') closePopover()
  else closeCustomPopover()
})

function syncFromHex(hex: string) {
  const hsv = rgbToHsv(hex)
  hue.value = hsv.h
  saturation.value = hsv.s
  value.value = hsv.v
}

function applyCustomHex(hex: string) {
  customHex.value = hex
  hexInput.value = hex
  isHexInvalid.value = false
  isHexDirty.value = false
  syncFromHex(hex)
  emit('update:modelValue', hex)
}

function selectPreset(color: string) {
  const normalized = normalizeHex(color)
  if (normalized) {
    customHex.value = normalized
    hexInput.value = normalized
    syncFromHex(normalized)
  }
  isHexInvalid.value = false
  emit('update:modelValue', color)
  if (effectiveDisplay.value === 'popover') closePopover({ restoreFocus: true })
  else closeCustomPopover()
}

function clearValue() {
  emit('update:modelValue', null)
  if (effectiveDisplay.value === 'popover') closePopover({ restoreFocus: true })
  else closeCustomPopover({ restoreFocus: true })
}

function commitHex() {
  if (!isHexDirty.value) return
  const normalized = normalizeHex(hexInput.value)
  if (!normalized) {
    isHexInvalid.value = true
    hexInput.value = activeHex.value
    isHexDirty.value = false
    return
  }
  applyCustomHex(normalized)
}

function markHexDirty() {
  isHexDirty.value = true
}

function onHexKeydown(event: KeyboardEvent) {
  if (event.key !== 'Enter') return
  event.preventDefault()
  commitHex()
}

function onHueInput(event: Event) {
  hue.value = Number((event.target as HTMLInputElement).value)
  applyCustomHex(hsvToHex(hue.value, saturation.value, value.value))
}

function updateSvFromEvent(event: PointerEvent) {
  const area = event.currentTarget as HTMLElement
  const rect = area.getBoundingClientRect()
  const width = rect.width || 1
  const height = rect.height || 1
  const x = Math.min(Math.max(event.clientX - rect.left, 0), width)
  const y = Math.min(Math.max(event.clientY - rect.top, 0), height)
  saturation.value = (x / width) * 100
  value.value = 100 - (y / height) * 100
  applyCustomHex(hsvToHex(hue.value, saturation.value, value.value))
}

function onSvPointerDown(event: PointerEvent) {
  isDraggingSv.value = true
  const area = event.currentTarget as HTMLElement
  area.setPointerCapture?.(event.pointerId)
  updateSvFromEvent(event)
}

function onSvPointerMove(event: PointerEvent) {
  if (!isDraggingSv.value) return
  updateSvFromEvent(event)
}

function onSvPointerUp(event: PointerEvent) {
  isDraggingSv.value = false
  const area = event.currentTarget as HTMLElement
  area.releasePointerCapture?.(event.pointerId)
}

function attachPopoverListeners() {
  document.addEventListener('pointerdown', onDocumentPointerDown, true)
  document.addEventListener('keydown', onDocumentKeydown)
  window.addEventListener('resize', updatePopoverPosition)
  window.addEventListener('scroll', updatePopoverPosition, true)
}

function detachPopoverListeners() {
  document.removeEventListener('pointerdown', onDocumentPointerDown, true)
  document.removeEventListener('keydown', onDocumentKeydown)
  window.removeEventListener('resize', updatePopoverPosition)
  window.removeEventListener('scroll', updatePopoverPosition, true)
}

function attachCustomPopoverListeners() {
  document.addEventListener('pointerdown', onCustomDocumentPointerDown, true)
  document.addEventListener('keydown', onCustomDocumentKeydown)
  window.addEventListener('resize', updateCustomPopoverPosition)
  window.addEventListener('scroll', updateCustomPopoverPosition, true)
}

function detachCustomPopoverListeners() {
  document.removeEventListener('pointerdown', onCustomDocumentPointerDown, true)
  document.removeEventListener('keydown', onCustomDocumentKeydown)
  window.removeEventListener('resize', updateCustomPopoverPosition)
  window.removeEventListener('scroll', updateCustomPopoverPosition, true)
}

async function openPopover() {
  if (effectiveDisplay.value !== 'popover' || isOpen.value) return
  isOpen.value = true
  attachPopoverListeners()
  await nextTick()
  updatePopoverPosition()
  panelRef.value?.focus()
}

function closePopover(options?: { restoreFocus?: boolean }) {
  if (!isOpen.value) return
  isOpen.value = false
  detachPopoverListeners()
  if (options?.restoreFocus) {
    nextTick(() => triggerRef.value?.focus())
  }
}

function togglePopover() {
  if (isOpen.value) closePopover({ restoreFocus: true })
  else void openPopover()
}

async function openCustomPopover() {
  if (effectiveDisplay.value !== 'inline' || props.hideCustom || isCustomOpen.value) return
  isCustomOpen.value = true
  attachCustomPopoverListeners()
  await nextTick()
  updateCustomPopoverPosition()
  customPanelRef.value?.focus()
}

function closeCustomPopover(options?: { restoreFocus?: boolean }) {
  if (!isCustomOpen.value) return
  isCustomOpen.value = false
  detachCustomPopoverListeners()
  if (options?.restoreFocus) {
    nextTick(() => customTriggerRef.value?.focus())
  }
}

function toggleCustomPopover() {
  if (isCustomOpen.value) closeCustomPopover({ restoreFocus: true })
  else void openCustomPopover()
}

function onDocumentPointerDown(event: PointerEvent) {
  const target = event.target as Node | null
  if (!target) return
  if (triggerRef.value?.contains(target) || panelRef.value?.contains(target)) return
  if (!props.hideCustom) commitHex()
  closePopover()
}

function onDocumentKeydown(event: KeyboardEvent) {
  if (event.key !== 'Escape') return
  event.preventDefault()
  closePopover({ restoreFocus: true })
}

function onCustomDocumentPointerDown(event: PointerEvent) {
  const target = event.target as Node | null
  if (!target) return
  if (customTriggerRef.value?.contains(target) || customPanelRef.value?.contains(target)) return
  commitHex()
  closeCustomPopover()
}

function onCustomDocumentKeydown(event: KeyboardEvent) {
  if (event.key !== 'Escape') return
  event.preventDefault()
  closeCustomPopover({ restoreFocus: true })
}

onBeforeUnmount(() => {
  detachPopoverListeners()
  detachCustomPopoverListeners()
})
</script>

<template>
  <div
    class="nv-color-picker tw:min-w-0"
    :class="[`nv-color-picker--${effectiveDisplay}`, `nv-color-picker--variant-${variant}`, effectiveDisplay === 'inline' && 'tw:w-full']"
  >
    <button
      v-if="effectiveDisplay === 'popover' && trigger === 'swatch'"
      ref="triggerRef"
      type="button"
      class="nv-color-picker__trigger nv-color-picker__trigger--swatch tw:cursor-pointer tw:rounded-[calc(7px*var(--radius-scale,1))] tw:border tw:border-solid tw:p-0 tw:transition-[border-color,box-shadow] tw:duration-[120ms] tw:hover:border-[color-mix(in_oklab,var(--accent)_42%,var(--border-default))] tw:focus-visible:outline-2 tw:focus-visible:outline-accent tw:focus-visible:outline-offset-2"
      :class="[{ 'is-open': isOpen, 'is-empty': !modelValue }, isOpen ? 'tw:border-[color-mix(in_oklab,var(--accent)_42%,var(--border-default))]' : 'tw:border-line-default']"
      :style="previewStyle"
      :aria-label="triggerLabel ?? defaultTriggerLabel"
      :title="triggerLabel ?? defaultTriggerLabel"
      aria-haspopup="dialog"
      :aria-expanded="isOpen"
      :disabled="disabled"
      @click="togglePopover"
    />
    <button
      v-else-if="effectiveDisplay === 'popover'"
      ref="triggerRef"
      type="button"
      class="nv-color-picker__trigger tw:inline-flex tw:h-8 tw:min-w-[156px] tw:cursor-pointer tw:items-center tw:gap-2 tw:rounded-[calc(8px*var(--radius-scale,1))] tw:border tw:border-solid tw:px-[9px] tw:font-nv-ui tw:text-xs tw:font-medium tw:text-content-primary tw:transition-[border-color,background-color,box-shadow] tw:duration-[120ms] tw:hover:border-[color-mix(in_oklab,var(--accent)_42%,var(--border-default))] tw:hover:bg-(--surface-overlay) tw:focus-visible:outline-2 tw:focus-visible:outline-accent tw:focus-visible:outline-offset-2"
      :class="[
        { 'is-open': isOpen, 'is-empty': !modelValue },
        isOpen
          ? 'tw:border-[color-mix(in_oklab,var(--accent)_42%,var(--border-default))] tw:bg-(--surface-overlay)'
          : 'tw:border-line-default tw:bg-(--hover)',
      ]"
      aria-haspopup="dialog"
      :aria-expanded="isOpen"
      @click="togglePopover"
    >
      <span class="nv-color-picker__trigger-swatch tw:h-[18px] tw:w-[18px] tw:shrink-0 tw:rounded-[calc(6px*var(--radius-scale,1))] tw:border tw:border-solid tw:border-[color-mix(in_oklab,var(--border-default)_70%,transparent)] tw:shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--shadow)_12%,transparent)]" :style="previewStyle" />
      <span class="nv-color-picker__trigger-label tw:min-w-0 tw:flex-1 tw:overflow-hidden tw:text-left tw:text-ellipsis tw:whitespace-nowrap">{{ defaultTriggerLabel }}</span>
      <ChevronDown :size="13" class="nv-color-picker__trigger-caret tw:shrink-0 tw:text-content-muted" />
    </button>

    <Teleport to="body" :disabled="effectiveDisplay === 'inline'">
      <div
        v-if="effectiveDisplay === 'inline' || isOpen"
        ref="panelRef"
        class="nv-color-picker__panel tw:w-full tw:max-w-full tw:min-w-0 tw:focus:outline-none"
        :class="[
          { 'nv-color-picker__panel--popover': effectiveDisplay === 'popover' },
          effectiveDisplay === 'inline' && 'tw:grid tw:grid-cols-[minmax(0,1fr)_auto] tw:items-start tw:gap-2 tw:max-[560px]:grid-cols-1',
          effectiveDisplay === 'popover' && 'tw:fixed tw:z-[420] tw:rounded-[calc(12px*var(--radius-scale,1))] tw:border tw:border-solid tw:border-transparent tw:bg-(--menu-bg) tw:p-2.5 tw:shadow-(--menu-shadow)',
        ]"
        :style="effectiveDisplay === 'popover'
          ? {
            top: `${popoverPos.top}px`,
            left: `${popoverPos.left}px`,
            width: `${POPOVER_WIDTH}px`,
            transformOrigin: popoverPos.transformOrigin,
          }
          : undefined"
        role="dialog"
        :aria-label="t('editor.colorPicker.picker')"
        tabindex="-1"
      >
        <ColorSwatchGrid
          :colors="resolvedColors"
          :model-value="modelValue ?? null"
          :popover="effectiveDisplay === 'popover'"
          :grid-label="t('editor.colorPicker.presets')"
          @select="selectPreset"
        />

        <slot name="sections" :select="selectPreset" />

        <ColorCustomEditor
          v-if="!hideCustom && effectiveDisplay === 'popover'"
          v-model:hex-input="hexInput"
          :active-hex="activeHex"
          :hex-invalid="isHexInvalid"
          :sv-background="svBackground"
          :sv-thumb-style="svThumbStyle"
          :hue="hue"
          @hex-input="markHexDirty"
          @hex-blur="commitHex"
          @hex-keydown="onHexKeydown"
          @sv-pointerdown="onSvPointerDown"
          @sv-pointermove="onSvPointerMove"
          @sv-pointerup="onSvPointerUp"
          @hue-input="onHueInput"
        />

        <button
          v-else-if="!hideCustom"
          ref="customTriggerRef"
          type="button"
          class="nv-color-picker__custom-trigger tw:inline-flex tw:h-7 tw:min-w-[118px] tw:max-w-[138px] tw:max-[560px]:w-full tw:max-[560px]:max-w-none tw:max-[560px]:justify-start tw:cursor-pointer tw:items-center tw:gap-[7px] tw:rounded-[calc(8px*var(--radius-scale,1))] tw:border tw:border-solid tw:px-2 tw:font-nv-mono tw:text-[11px] tw:font-semibold tw:tracking-normal tw:transition-[border-color,background-color,color] tw:duration-[120ms] tw:hover:border-[color-mix(in_oklab,var(--accent)_42%,var(--border-default))] tw:hover:bg-(--surface-overlay) tw:hover:text-content-primary tw:focus-visible:outline-2 tw:focus-visible:outline-accent tw:focus-visible:outline-offset-2"
          :class="[
            { 'is-open': isCustomOpen, 'is-selected': selectedSolidHex && !selectedOption },
            (isCustomOpen || (selectedSolidHex && !selectedOption))
              ? 'tw:border-[color-mix(in_oklab,var(--accent)_42%,var(--border-default))] tw:bg-(--surface-overlay) tw:text-content-primary'
              : 'tw:border-line-default tw:bg-(--hover) tw:text-content-secondary',
            selectedSolidHex && !selectedOption && 'tw:shadow-[0_0_0_2px_var(--accent-soft)]',
          ]"
          aria-haspopup="dialog"
          :aria-expanded="isCustomOpen"
          @click="toggleCustomPopover"
        >
          <span class="nv-color-picker__custom-trigger-swatch tw:h-4 tw:w-4 tw:shrink-0 tw:rounded-[calc(5px*var(--radius-scale,1))] tw:border tw:border-solid tw:border-[color-mix(in_oklab,var(--border-default)_70%,transparent)] tw:shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--shadow)_10%,transparent)]" :style="{ background: activeHex }" />
          <span class="nv-color-picker__custom-trigger-label tw:min-w-0 tw:overflow-hidden tw:text-ellipsis tw:whitespace-nowrap">{{ activeHex.toUpperCase() }}</span>
          <ChevronDown :size="13" class="nv-color-picker__trigger-caret tw:shrink-0 tw:text-content-muted" />
        </button>

        <button
          v-if="allowNone"
          type="button"
          class="nv-color-picker__none tw:mt-2 tw:cursor-pointer tw:justify-self-start tw:rounded-[calc(7px*var(--radius-scale,1))] tw:border tw:border-solid tw:border-transparent tw:bg-transparent tw:px-2 tw:py-1 tw:font-nv-ui tw:text-[11.5px] tw:font-semibold tw:text-content-muted tw:transition-[background-color,color,border-color] tw:duration-[120ms] tw:hover:border-line-default tw:hover:bg-(--hover) tw:hover:text-content-primary tw:focus-visible:outline-2 tw:focus-visible:outline-accent tw:focus-visible:outline-offset-2"
          @click="clearValue"
        >
          {{ t('editor.colorPicker.none') }}
        </button>
      </div>
    </Teleport>

    <Teleport to="body">
      <div
        v-if="effectiveDisplay === 'inline' && isCustomOpen"
        ref="customPanelRef"
        class="nv-color-picker__custom-popover tw:fixed tw:z-[430] tw:rounded-[calc(12px*var(--radius-scale,1))] tw:border tw:border-solid tw:border-transparent tw:bg-(--menu-bg) tw:p-2.5 tw:shadow-(--menu-shadow)"
        :style="{
          top: `${customPopoverPos.top}px`,
          left: `${customPopoverPos.left}px`,
          width: `${CUSTOM_POPOVER_WIDTH}px`,
          transformOrigin: customPopoverPos.transformOrigin,
        }"
        role="dialog"
        :aria-label="t('editor.colorPicker.custom')"
        tabindex="-1"
      >
        <ColorCustomEditor
          v-model:hex-input="hexInput"
          popup
          :active-hex="activeHex"
          :hex-invalid="isHexInvalid"
          :sv-background="svBackground"
          :sv-thumb-style="svThumbStyle"
          :hue="hue"
          @hex-input="markHexDirty"
          @hex-blur="commitHex"
          @hex-keydown="onHexKeydown"
          @sv-pointerdown="onSvPointerDown"
          @sv-pointermove="onSvPointerMove"
          @sv-pointerup="onSvPointerUp"
          @hue-input="onHueInput"
        />
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.nv-color-picker__trigger--swatch:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

.nv-color-picker__trigger--swatch {
  width: 28px;
  height: 28px;
  box-shadow: inset 0 0 0 2px var(--menu-bg, transparent);
}

@media (pointer: coarse) {
  .nv-color-picker__trigger--swatch {
    width: 44px;
    height: 44px;
  }
}

/* Transparency checkerboard behind the trigger swatch when no color is selected;
   the dynamic preview color is applied as an inline style that overrides this. */
.nv-color-picker__trigger-swatch {
  background:
    linear-gradient(45deg, var(--border-subtle) 25%, transparent 25%),
    linear-gradient(-45deg, var(--border-subtle) 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, var(--border-subtle) 75%),
    linear-gradient(-45deg, transparent 75%, var(--border-subtle) 75%);
  background-size: 8px 8px;
  background-position: 0 0, 0 4px, 4px -4px, -4px 0;
}
</style>
