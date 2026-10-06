<script setup lang="ts">
import { Check, ChevronDown } from '@lucide/vue'
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'

interface SelectOption {
  value: string
  label: string
  description?: string
}

interface Props {
  modelValue: string
  options: readonly SelectOption[]
  placeholder?: string
  disabled?: boolean
  minWidth?: number | string
  maxMenuHeight?: number
}

const props = withDefaults(defineProps<Props>(), {
  placeholder: 'Select…',
  disabled: false,
  minWidth: 188,
  maxMenuHeight: 280,
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const triggerRef = ref<HTMLButtonElement | null>(null)
const menuRef = ref<HTMLDivElement | null>(null)
const isOpen = ref(false)
const activeIndex = ref(-1)
const menuPosition = ref({
  top: 0,
  left: 0,
  width: 0,
  transformOrigin: 'top left',
})

const menuId = `nv-select-${Math.random().toString(36).slice(2, 10)}`
const menuZIndex = 2000

const selectedIndex = computed(() => props.options.findIndex(option => option.value === props.modelValue))
const selectedOption = computed(() => props.options[selectedIndex.value] ?? null)
const triggerMinWidth = computed(() => {
  return typeof props.minWidth === 'number' ? `${props.minWidth}px` : props.minWidth
})

function markBodyOpen() {
  const currentCount = Number(document.body.dataset.nvSelectOpenCount ?? '0')
  document.body.dataset.nvSelectOpenCount = `${currentCount + 1}`
  document.body.classList.add('nv-select-open')
}

function unmarkBodyOpen() {
  const currentCount = Number(document.body.dataset.nvSelectOpenCount ?? '0')
  const nextCount = Math.max(0, currentCount - 1)

  if (nextCount === 0) {
    delete document.body.dataset.nvSelectOpenCount
    document.body.classList.remove('nv-select-open')
    return
  }

  document.body.dataset.nvSelectOpenCount = `${nextCount}`
}

function attachListeners() {
  document.addEventListener('pointerdown', onDocumentPointerDown, true)
  window.addEventListener('resize', updateMenuPosition)
  window.addEventListener('scroll', updateMenuPosition, true)
}

function detachListeners() {
  document.removeEventListener('pointerdown', onDocumentPointerDown, true)
  window.removeEventListener('resize', updateMenuPosition)
  window.removeEventListener('scroll', updateMenuPosition, true)
}

function scrollActiveOptionIntoView() {
  const menu = menuRef.value
  if (!menu || activeIndex.value < 0) return

  const activeOption = menu.querySelector<HTMLElement>(`[data-index="${activeIndex.value}"]`)
  if (typeof activeOption?.scrollIntoView === 'function') {
    activeOption.scrollIntoView({ block: 'nearest' })
  }
}

function setActiveIndex(index: number) {
  if (props.options.length === 0) {
    activeIndex.value = -1
    return
  }

  const lastIndex = props.options.length - 1
  activeIndex.value = Math.max(0, Math.min(lastIndex, index))
  nextTick(() => {
    scrollActiveOptionIntoView()
  })
}

function moveActive(step: number) {
  if (props.options.length === 0) return
  if (activeIndex.value < 0) {
    setActiveIndex(step > 0 ? 0 : props.options.length - 1)
    return
  }

  const nextIndex = (activeIndex.value + step + props.options.length) % props.options.length
  setActiveIndex(nextIndex)
}

function updateMenuPosition() {
  const trigger = triggerRef.value
  const menu = menuRef.value
  if (!trigger || !menu) return

  const viewportPadding = 12
  const gap = 8
  const triggerRect = trigger.getBoundingClientRect()
  const menuRect = menu.getBoundingClientRect()
  const width = Math.max(triggerRect.width, menuRect.width)

  let left = triggerRect.left
  if (left + width > window.innerWidth - viewportPadding) {
    left = Math.max(viewportPadding, window.innerWidth - viewportPadding - width)
  }

  const availableBelow = window.innerHeight - triggerRect.bottom - viewportPadding - gap
  const availableAbove = triggerRect.top - viewportPadding - gap
  const shouldOpenUp = menuRect.height > availableBelow && availableAbove > availableBelow

  let top = shouldOpenUp ? triggerRect.top - gap - menuRect.height : triggerRect.bottom + gap
  top = Math.max(viewportPadding, Math.min(top, window.innerHeight - viewportPadding - menuRect.height))

  menuPosition.value = {
    top,
    left,
    width,
    transformOrigin: shouldOpenUp ? 'bottom left' : 'top left',
  }
}

async function openMenu() {
  if (props.disabled || isOpen.value || props.options.length === 0) return

  isOpen.value = true
  activeIndex.value = selectedIndex.value >= 0 ? selectedIndex.value : 0
  markBodyOpen()
  attachListeners()

  await nextTick()
  updateMenuPosition()
  menuRef.value?.focus()
  scrollActiveOptionIntoView()
}

function closeMenu(options?: { restoreFocus?: boolean }) {
  if (!isOpen.value) return

  isOpen.value = false
  detachListeners()
  unmarkBodyOpen()

  if (options?.restoreFocus) {
    nextTick(() => {
      triggerRef.value?.focus()
    })
  }
}

function selectValue(value: string) {
  emit('update:modelValue', value)
  closeMenu({ restoreFocus: true })
}

function onDocumentPointerDown(event: PointerEvent) {
  const target = event.target as Node | null
  if (!target) return
  if (triggerRef.value?.contains(target) || menuRef.value?.contains(target)) return
  closeMenu()
}

function onTriggerKeydown(event: KeyboardEvent) {
  if (props.disabled) return

  if (event.key === 'ArrowDown') {
    event.preventDefault()
    if (isOpen.value) {
      moveActive(1)
      return
    }
    void openMenu()
    return
  }

  if (event.key === 'ArrowUp') {
    event.preventDefault()
    if (isOpen.value) {
      moveActive(-1)
      return
    }
    void openMenu()
    return
  }

  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    if (isOpen.value) {
      const option = props.options[activeIndex.value]
      if (option) selectValue(option.value)
      return
    }
    void openMenu()
  }
}

function onMenuKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.preventDefault()
    event.stopPropagation()
    closeMenu({ restoreFocus: true })
    return
  }

  if (event.key === 'Tab') {
    closeMenu()
    return
  }

  if (event.key === 'ArrowDown') {
    event.preventDefault()
    moveActive(1)
    return
  }

  if (event.key === 'ArrowUp') {
    event.preventDefault()
    moveActive(-1)
    return
  }

  if (event.key === 'Home') {
    event.preventDefault()
    setActiveIndex(0)
    return
  }

  if (event.key === 'End') {
    event.preventDefault()
    setActiveIndex(props.options.length - 1)
    return
  }

  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    const option = props.options[activeIndex.value]
    if (option) selectValue(option.value)
  }
}

watch(
  () => props.modelValue,
  () => {
    if (!isOpen.value) return
    activeIndex.value = selectedIndex.value >= 0 ? selectedIndex.value : activeIndex.value
  },
)

function focus() {
  triggerRef.value?.focus()
}

defineExpose({ focus })

onBeforeUnmount(() => {
  detachListeners()
  if (isOpen.value) {
    unmarkBodyOpen()
  }
})
</script>

<template>
  <div class="nv-select tw:min-w-(--nv-select-min-width)" :style="{ '--nv-select-min-width': triggerMinWidth }">
    <button
      ref="triggerRef"
      type="button"
      class="nv-select__trigger tw:group tw:inline-flex tw:h-8 tw:w-full tw:cursor-pointer tw:items-center tw:justify-between tw:gap-2.5 tw:rounded-[calc(8px*var(--radius-scale,1))] tw:border tw:border-solid tw:border-transparent tw:pr-2.5 tw:pl-[11px] tw:font-nv-ui tw:text-[12.5px] tw:font-medium tw:text-content-primary tw:transition-[background-color,box-shadow,color] tw:duration-150 tw:focus-visible:bg-(--surface-raised) tw:focus-visible:shadow-[0_0_0_2px_var(--input-ring)] tw:focus-visible:outline-none tw:disabled:cursor-not-allowed tw:disabled:opacity-60"
      :class="[
        isOpen
          ? 'is-open tw:bg-(--surface-raised) tw:shadow-[0_0_0_2px_var(--input-ring)]'
          : 'tw:bg-(--input-bg) tw:hover:bg-[color-mix(in_oklab,var(--input-bg)_88%,var(--text-primary)_6%)]',
        disabled && 'is-disabled',
      ]"
      :disabled="disabled"
      :aria-controls="menuId"
      :aria-expanded="isOpen"
      aria-haspopup="listbox"
      @click="isOpen ? closeMenu() : openMenu()"
      @keydown="onTriggerKeydown"
    >
      <span class="nv-select__value tw:min-w-0 tw:truncate tw:text-left" :class="[!selectedOption && 'is-placeholder tw:text-content-muted']">
        {{ selectedOption?.label ?? placeholder }}
      </span>
      <ChevronDown :size="14" class="nv-select__chevron tw:shrink-0 tw:transition-[color,transform] tw:duration-150 tw:group-hover:text-accent" :class="isOpen ? 'tw:rotate-180 tw:text-accent' : 'tw:text-content-muted'" />
    </button>

    <Teleport to="body">
      <div
        v-if="isOpen"
        :id="menuId"
        ref="menuRef"
        class="nv-select__menu tw:fixed tw:min-w-[140px] tw:overflow-auto tw:rounded-[calc(12px*var(--radius-scale,1))] tw:border tw:border-solid tw:border-transparent tw:bg-(--menu-bg) tw:p-1 tw:shadow-(--menu-shadow) tw:focus:outline-none"
        tabindex="-1"
        role="listbox"
        :aria-activedescendant="activeIndex >= 0 ? `${menuId}-option-${activeIndex}` : undefined"
        :style="{
          top: `${menuPosition.top}px`,
          left: `${menuPosition.left}px`,
          width: `${menuPosition.width}px`,
          maxHeight: `${maxMenuHeight}px`,
          transformOrigin: menuPosition.transformOrigin,
          zIndex: `${menuZIndex}`,
        }"
        @keydown="onMenuKeydown"
      >
        <button
          v-for="(option, index) in options"
          :id="`${menuId}-option-${index}`"
          :key="option.value"
          type="button"
          class="nv-select__option tw:flex tw:min-h-[34px] tw:w-full tw:cursor-pointer tw:items-start tw:justify-between tw:gap-3 tw:rounded-[calc(8px*var(--radius-scale,1))] tw:border-0 tw:px-2.5 tw:py-2 tw:text-left tw:text-inherit"
          :class="[index === activeIndex ? 'is-active tw:bg-surface-subtle' : 'tw:bg-transparent', option.value === modelValue && 'is-selected']"
          role="option"
          :aria-selected="option.value === modelValue"
          :data-index="index"
          @mouseenter="setActiveIndex(index)"
          @click="selectValue(option.value)"
        >
          <span class="nv-select__option-copy tw:flex tw:min-w-0 tw:flex-col tw:gap-0.5">
            <span class="nv-select__option-label tw:font-nv-ui tw:text-[12.5px] tw:font-medium" :class="option.value === modelValue ? 'tw:text-content-primary' : 'tw:text-content-secondary'">{{ option.label }}</span>
            <span v-if="option.description" class="nv-select__option-description tw:text-[11px] tw:leading-[1.4] tw:text-content-muted">{{ option.description }}</span>
          </span>
          <Check v-if="option.value === modelValue" :size="14" class="nv-select__check tw:mt-px tw:shrink-0 tw:text-accent" />
        </button>
      </div>
    </Teleport>
  </div>
</template>
