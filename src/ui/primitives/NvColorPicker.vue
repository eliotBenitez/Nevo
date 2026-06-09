<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { ChevronDown } from 'lucide-vue-next'
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
  }>(),
  {
    allowNone: false,
    variant: 'default',
    hideCustom: false,
    modelValue: undefined,
    colors: undefined,
    display: undefined,
  },
)

const emit = defineEmits<{
  'update:modelValue': [value: string | null]
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
const triggerLabel = computed(() => {
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
  <div class="nv-color-picker" :class="[`nv-color-picker--${effectiveDisplay}`, `nv-color-picker--variant-${variant}`]">
    <button
      v-if="effectiveDisplay === 'popover'"
      ref="triggerRef"
      type="button"
      class="nv-color-picker__trigger"
      :class="{ 'is-open': isOpen, 'is-empty': !modelValue }"
      aria-haspopup="dialog"
      :aria-expanded="isOpen"
      @click="togglePopover"
    >
      <span class="nv-color-picker__trigger-swatch" :style="previewStyle" />
      <span class="nv-color-picker__trigger-label">{{ triggerLabel }}</span>
      <ChevronDown :size="13" class="nv-color-picker__trigger-caret" />
    </button>

    <Teleport to="body" :disabled="effectiveDisplay === 'inline'">
      <div
        v-if="effectiveDisplay === 'inline' || isOpen"
        ref="panelRef"
        class="nv-color-picker__panel"
        :class="{ 'nv-color-picker__panel--popover': effectiveDisplay === 'popover' }"
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
        <div class="nv-color-picker__grid" :aria-label="t('editor.colorPicker.presets')">
          <button
            v-for="opt in resolvedColors"
            :key="opt.color"
            type="button"
            class="nv-color-picker__swatch"
            :class="{ 'is-selected': colorsMatch(opt.color, modelValue ?? null) }"
            :style="{ background: opt.color }"
            :aria-label="opt.label ?? opt.color"
            :title="opt.label ?? opt.color"
            @click="selectPreset(opt.color)"
          />
        </div>

        <div v-if="!hideCustom && effectiveDisplay === 'popover'" class="nv-color-picker__custom">
          <div class="nv-color-picker__custom-head">
            <span class="nv-color-picker__preview" :style="{ background: activeHex }" aria-hidden="true" />
            <input
              v-model="hexInput"
              type="text"
              class="nv-color-picker__hex"
              :class="{ 'is-invalid': isHexInvalid }"
              maxlength="7"
              placeholder="#000000"
              spellcheck="false"
              :aria-label="t('editor.colorPicker.hex')"
              @input="markHexDirty"
              @blur="commitHex"
              @keydown="onHexKeydown"
            >
          </div>

          <div
            class="nv-color-picker__sv"
            :style="svBackground"
            role="slider"
            tabindex="0"
            :aria-label="t('editor.colorPicker.sv')"
            :aria-valuetext="activeHex"
            @pointerdown="onSvPointerDown"
            @pointermove="onSvPointerMove"
            @pointerup="onSvPointerUp"
            @pointercancel="onSvPointerUp"
          >
            <span class="nv-color-picker__sv-thumb" :style="svThumbStyle" />
          </div>

          <label class="nv-color-picker__hue">
            <span class="nv-color-picker__hue-label">{{ t('editor.colorPicker.hue') }}</span>
            <input
              type="range"
              min="0"
              max="360"
              step="1"
              :value="hue"
              :aria-label="t('editor.colorPicker.hue')"
              @input="onHueInput"
            >
          </label>
        </div>

        <button
          v-else-if="!hideCustom"
          ref="customTriggerRef"
          type="button"
          class="nv-color-picker__custom-trigger"
          :class="{ 'is-open': isCustomOpen, 'is-selected': selectedSolidHex && !selectedOption }"
          aria-haspopup="dialog"
          :aria-expanded="isCustomOpen"
          @click="toggleCustomPopover"
        >
          <span class="nv-color-picker__custom-trigger-swatch" :style="{ background: activeHex }" />
          <span class="nv-color-picker__custom-trigger-label">{{ activeHex.toUpperCase() }}</span>
          <ChevronDown :size="13" class="nv-color-picker__trigger-caret" />
        </button>

        <button v-if="allowNone" type="button" class="nv-color-picker__none" @click="clearValue">
          {{ t('editor.colorPicker.none') }}
        </button>
      </div>
    </Teleport>

    <Teleport to="body">
      <div
        v-if="effectiveDisplay === 'inline' && isCustomOpen"
        ref="customPanelRef"
        class="nv-color-picker__custom-popover"
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
        <div class="nv-color-picker__custom nv-color-picker__custom--popup">
          <div class="nv-color-picker__custom-head">
            <span class="nv-color-picker__preview" :style="{ background: activeHex }" aria-hidden="true" />
            <input
              v-model="hexInput"
              type="text"
              class="nv-color-picker__hex"
              :class="{ 'is-invalid': isHexInvalid }"
              maxlength="7"
              placeholder="#000000"
              spellcheck="false"
              :aria-label="t('editor.colorPicker.hex')"
              @input="markHexDirty"
              @blur="commitHex"
              @keydown="onHexKeydown"
            >
          </div>

          <div
            class="nv-color-picker__sv"
            :style="svBackground"
            role="slider"
            tabindex="0"
            :aria-label="t('editor.colorPicker.sv')"
            :aria-valuetext="activeHex"
            @pointerdown="onSvPointerDown"
            @pointermove="onSvPointerMove"
            @pointerup="onSvPointerUp"
            @pointercancel="onSvPointerUp"
          >
            <span class="nv-color-picker__sv-thumb" :style="svThumbStyle" />
          </div>

          <label class="nv-color-picker__hue">
            <span class="nv-color-picker__hue-label">{{ t('editor.colorPicker.hue') }}</span>
            <input
              type="range"
              min="0"
              max="360"
              step="1"
              :value="hue"
              :aria-label="t('editor.colorPicker.hue')"
              @input="onHueInput"
            >
          </label>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.nv-color-picker {
  min-width: 0;
}

.nv-color-picker--inline {
  width: 100%;
}

.nv-color-picker__trigger {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-width: 156px;
  height: 32px;
  padding: 0 9px;
  border: 1px solid var(--line-2);
  border-radius: 8px;
  background: var(--hover);
  color: var(--text-1);
  font: 500 12px var(--font-ui);
  cursor: pointer;
  transition: border-color 0.12s ease, background 0.12s ease, box-shadow 0.12s ease;
}

.nv-color-picker__trigger:hover,
.nv-color-picker__trigger.is-open {
  border-color: color-mix(in oklab, var(--accent) 42%, var(--line-2));
  background: var(--glass-3);
}

.nv-color-picker__trigger:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.nv-color-picker__trigger-swatch {
  width: 18px;
  height: 18px;
  flex: 0 0 auto;
  border: 1px solid color-mix(in oklab, var(--line-2) 70%, transparent);
  border-radius: 6px;
  background:
    linear-gradient(45deg, var(--line-1) 25%, transparent 25%),
    linear-gradient(-45deg, var(--line-1) 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, var(--line-1) 75%),
    linear-gradient(-45deg, transparent 75%, var(--line-1) 75%);
  background-size: 8px 8px;
  background-position: 0 0, 0 4px, 4px -4px, -4px 0;
  box-shadow: inset 0 0 0 1px color-mix(in oklab, var(--shadow) 12%, transparent);
}

.nv-color-picker__trigger-label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-align: left;
}

.nv-color-picker__trigger-caret {
  flex: 0 0 auto;
  color: var(--text-4);
}

.nv-color-picker__panel {
  width: 100%;
  max-width: 100%;
  min-width: 0;
}

.nv-color-picker--inline .nv-color-picker__panel {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
  align-items: start;
}

.nv-color-picker__panel--popover {
  position: fixed;
  z-index: 420;
  padding: 10px;
  border: 1px solid var(--line-2);
  border-radius: 10px;
  background: var(--glass-3);
  backdrop-filter: blur(32px) saturate(160%);
  -webkit-backdrop-filter: blur(32px) saturate(160%);
  box-shadow: 0 18px 44px color-mix(in oklab, var(--shadow) 24%, transparent);
}

.nv-color-picker__custom-popover {
  position: fixed;
  z-index: 430;
  padding: 10px;
  border: 1px solid var(--line-2);
  border-radius: 10px;
  background: var(--glass-3);
  backdrop-filter: blur(32px) saturate(160%);
  -webkit-backdrop-filter: blur(32px) saturate(160%);
  box-shadow: 0 18px 44px color-mix(in oklab, var(--shadow) 24%, transparent);
}

.nv-color-picker__panel:focus {
  outline: none;
}

.nv-color-picker__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(28px, 1fr));
  gap: 8px;
  width: 100%;
}

.nv-color-picker__panel--popover .nv-color-picker__grid {
  grid-template-columns: repeat(6, 1fr);
}

.nv-color-picker__swatch {
  width: 100%;
  min-width: 0;
  aspect-ratio: 1;
  border: 1px solid color-mix(in oklab, var(--line-2) 70%, transparent);
  border-radius: 8px;
  padding: 0;
  cursor: pointer;
  box-shadow: inset 0 0 0 1px color-mix(in oklab, var(--shadow) 10%, transparent);
  transition: border-color 0.12s ease, box-shadow 0.12s ease, transform 0.12s ease;
}

.nv-color-picker__swatch:hover {
  border-color: var(--line-strong);
  transform: translateY(-1px);
}

.nv-color-picker__swatch:focus-visible,
.nv-color-picker__custom-trigger:focus-visible,
.nv-color-picker__none:focus-visible,
.nv-color-picker__hex:focus-visible,
.nv-color-picker__sv:focus-visible,
.nv-color-picker__hue input:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.nv-color-picker__swatch.is-selected {
  border-color: color-mix(in oklab, var(--accent) 70%, white);
  box-shadow:
    inset 0 0 0 1px color-mix(in oklab, var(--shadow) 12%, transparent),
    0 0 0 2px var(--accent-soft);
}

.nv-color-picker__custom {
  display: grid;
  gap: 9px;
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid var(--line-1);
}

.nv-color-picker__custom--popup {
  margin-top: 0;
  padding-top: 0;
  border-top: none;
}

.nv-color-picker__custom-trigger {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  height: 28px;
  min-width: 118px;
  max-width: 138px;
  padding: 0 8px;
  border: 1px solid var(--line-2);
  border-radius: 8px;
  background: var(--hover);
  color: var(--text-2);
  font: 600 11px var(--font-mono);
  letter-spacing: 0;
  cursor: pointer;
  transition: border-color 0.12s ease, background 0.12s ease, color 0.12s ease;
}

.nv-color-picker__custom-trigger:hover,
.nv-color-picker__custom-trigger.is-open,
.nv-color-picker__custom-trigger.is-selected {
  border-color: color-mix(in oklab, var(--accent) 42%, var(--line-2));
  background: var(--glass-3);
  color: var(--text-1);
}

.nv-color-picker__custom-trigger.is-selected {
  box-shadow: 0 0 0 2px var(--accent-soft);
}

.nv-color-picker__custom-trigger-swatch {
  width: 16px;
  height: 16px;
  flex: 0 0 auto;
  border: 1px solid color-mix(in oklab, var(--line-2) 70%, transparent);
  border-radius: 5px;
  box-shadow: inset 0 0 0 1px color-mix(in oklab, var(--shadow) 10%, transparent);
}

.nv-color-picker__custom-trigger-label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.nv-color-picker__custom-head {
  display: grid;
  grid-template-columns: 30px minmax(0, 1fr);
  gap: 8px;
  align-items: center;
}

.nv-color-picker__preview {
  width: 30px;
  height: 30px;
  border: 1px solid var(--line-2);
  border-radius: 8px;
  box-shadow: inset 0 0 0 1px color-mix(in oklab, var(--shadow) 10%, transparent);
}

.nv-color-picker__hex {
  height: 30px;
  min-width: 0;
  padding: 0 9px;
  border: 1px solid var(--line-2);
  border-radius: 8px;
  background: var(--hover);
  color: var(--text-1);
  font: 600 12px var(--font-mono);
  letter-spacing: 0;
  text-transform: lowercase;
  transition: border-color 0.12s ease, background 0.12s ease;
}

.nv-color-picker__hex:focus {
  border-color: var(--accent);
}

.nv-color-picker__hex.is-invalid {
  border-color: color-mix(in oklab, #ef4444 70%, var(--line-2));
  background: color-mix(in oklab, #ef4444 10%, var(--hover));
}

.nv-color-picker__sv {
  position: relative;
  height: 92px;
  border: 1px solid var(--line-2);
  border-radius: 8px;
  overflow: hidden;
  cursor: crosshair;
  touch-action: none;
}

.nv-color-picker__sv-thumb {
  position: absolute;
  width: 14px;
  height: 14px;
  border: 2px solid white;
  border-radius: 999px;
  box-shadow: 0 0 0 1px color-mix(in oklab, black 45%, transparent), 0 2px 8px color-mix(in oklab, black 24%, transparent);
  transform: translate(-50%, -50%);
  pointer-events: none;
}

.nv-color-picker__hue {
  display: grid;
  grid-template-columns: 34px minmax(0, 1fr);
  gap: 8px;
  align-items: center;
}

.nv-color-picker__hue-label {
  color: var(--text-4);
  font-size: 11px;
  font-weight: 600;
}

.nv-color-picker__hue input {
  width: 100%;
  height: 16px;
  margin: 0;
  border-radius: 999px;
  background: linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00);
  cursor: pointer;
  appearance: none;
}

.nv-color-picker__hue input::-webkit-slider-thumb {
  width: 14px;
  height: 14px;
  border: 2px solid white;
  border-radius: 999px;
  background: transparent;
  box-shadow: 0 0 0 1px color-mix(in oklab, black 45%, transparent);
  appearance: none;
}

.nv-color-picker__hue input::-moz-range-thumb {
  width: 14px;
  height: 14px;
  border: 2px solid white;
  border-radius: 999px;
  background: transparent;
  box-shadow: 0 0 0 1px color-mix(in oklab, black 45%, transparent);
}

.nv-color-picker__none {
  justify-self: start;
  margin-top: 8px;
  padding: 4px 8px;
  border: 1px solid transparent;
  border-radius: 7px;
  background: transparent;
  color: var(--text-3);
  font: 600 11.5px var(--font-ui);
  cursor: pointer;
  transition: background 0.12s ease, color 0.12s ease, border-color 0.12s ease;
}

.nv-color-picker__none:hover {
  border-color: var(--line-2);
  background: var(--hover);
  color: var(--text-1);
}

@media (max-width: 560px) {
  .nv-color-picker--inline .nv-color-picker__panel {
    grid-template-columns: 1fr;
  }

  .nv-color-picker__custom-trigger {
    width: 100%;
    max-width: none;
    justify-content: flex-start;
  }

  .nv-color-picker__grid {
    grid-template-columns: repeat(auto-fill, minmax(24px, 1fr));
    gap: 7px;
  }

  .nv-color-picker__sv {
    height: 88px;
  }
}
</style>
