<script setup lang="ts">
import { computed, nextTick, ref, useId, watch } from 'vue'
import { X } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'
import { useFocusTrap } from '../composables/useFocusTrap'

interface Props {
  open: boolean
  title?: string
  description?: string
  size?: 'sm' | 'md' | 'lg' | 'full'
  closeOnBackdrop?: boolean
  dismissible?: boolean
  labelledBy?: string
  describedBy?: string
  /** Panel-level modifier for callers that tint the whole dialog, e.g. a danger confirm. */
  panelClass?: string
}

const props = withDefaults(defineProps<Props>(), {
  size: 'md',
  closeOnBackdrop: true,
  dismissible: true,
})

const emit = defineEmits<{ close: [] }>()

const panelSizeClasses = {
  sm: 'tw:max-w-[420px]',
  md: 'tw:max-w-[560px]',
  lg: 'tw:max-w-[880px]',
  full: 'tw:max-w-[1200px] tw:h-full',
} as const

const { t } = useI18n()

// Never hardcode these: two NvModal instances open at once (e.g. a confirm
// dialog on top of a settings modal) must not collide on id.
const titleId = useId()
const descriptionId = useId()
const labelledById = computed(() => props.labelledBy ?? titleId)
const describedById = computed(() => props.describedBy ?? (props.description ? descriptionId : undefined))

const panelRef = ref<HTMLElement | null>(null)
const open = computed(() => props.open)
const { activate, deactivate } = useFocusTrap(panelRef, open)

watch(() => props.open, (isOpen) => {
  if (isOpen) {
    void nextTick(() => activate())
  } else {
    deactivate()
  }
})

function onScrimClick() {
  if (props.closeOnBackdrop) emit('close')
}
</script>

<template>
  <Teleport to="body">
    <Transition name="nv-modal">
      <div v-if="open" class="nv-modal tw:fixed tw:inset-0 tw:z-nv-scrim tw:grid tw:place-items-center" :class="`nv-modal--${size}`">
        <div class="nv-modal__scrim tw:absolute tw:inset-0 tw:bg-scrim" @click="onScrimClick" />
        <div
          ref="panelRef"
          class="nv-modal__panel tw:relative tw:z-nv-modal tw:flex tw:min-h-0 tw:max-h-full tw:w-full tw:flex-col tw:rounded-[calc(16px*var(--radius-scale,1))] tw:border tw:border-solid tw:border-transparent tw:bg-modal tw:shadow-nv-modal tw:outline-none"
          :class="[panelSizeClasses[size], panelClass]"
          role="dialog"
          aria-modal="true"
          :aria-labelledby="labelledById"
          :aria-describedby="describedById"
          @keydown.escape.prevent.stop="emit('close')"
        >
          <header class="nv-modal__header tw:flex tw:items-start tw:gap-3 tw:px-5 tw:pt-[18px] tw:pb-[6px]">
            <slot v-if="$slots.header" name="header" />
            <div v-else class="nv-modal__heading tw:min-w-0 tw:flex-auto">
              <h2 :id="titleId" class="nv-modal__title tw:m-0 tw:text-balance tw:text-[15px] tw:font-[620] tw:tracking-[-0.01em]">{{ title }}</h2>
              <p v-if="description" :id="descriptionId" class="nv-modal__description tw:mt-[5px] tw:mb-0 tw:text-[12.5px] tw:text-content-secondary">{{ description }}</p>
            </div>
            <div v-if="$slots['header-actions'] || dismissible" class="nv-modal__header-actions tw:ml-auto tw:flex tw:items-center tw:gap-[6px]">
              <slot name="header-actions" />
              <button
                v-if="dismissible"
                type="button"
                class="nv-btn nv-btn--icon"
                :aria-label="t('common.close')"
                @click="emit('close')"
              >
                <X :size="16" :stroke-width="1.8" />
              </button>
            </div>
          </header>
          <div class="nv-modal__body tw:min-h-0 tw:flex-auto tw:overflow-auto tw:overscroll-contain tw:px-5 tw:pt-3 tw:pb-4">
            <slot />
          </div>
          <footer v-if="$slots.footer" class="nv-modal__footer tw:flex tw:justify-end tw:gap-2 tw:px-5 tw:pt-1 tw:pb-[18px]">
            <slot name="footer" />
          </footer>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
