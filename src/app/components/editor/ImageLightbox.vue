<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { ChevronLeft, ChevronRight, X } from '../../../ui/icons'
import { useFocusTrap } from '../../../ui/composables/useFocusTrap'
import type { LightboxImage } from '../../composables/editor/useImageLightbox'

const props = defineProps<{
  open: boolean
  images: LightboxImage[]
  index: number
}>()

const emit = defineEmits<{
  close: []
  next: []
  previous: []
}>()

const { t } = useI18n()

const dialogRef = ref<HTMLElement | null>(null)
const open = computed(() => props.open)
const { activate, deactivate } = useFocusTrap(dialogRef, open)

const zoomed = ref(false)
const current = computed(() => props.images[props.index] ?? null)
const hasPrevious = computed(() => props.index > 0)
const hasNext = computed(() => props.index < props.images.length - 1)

watch(() => props.open, (isOpen) => {
  zoomed.value = false
  if (isOpen) void nextTick(() => activate())
  else deactivate()
})

watch(() => props.index, () => { zoomed.value = false })

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') emit('close')
  else if (event.key === 'ArrowLeft' && hasPrevious.value) emit('previous')
  else if (event.key === 'ArrowRight' && hasNext.value) emit('next')
  else return
  event.preventDefault()
  event.stopPropagation()
}

const navButton =
  'tw:inline-flex tw:size-10 tw:shrink-0 tw:cursor-pointer tw:items-center tw:justify-center tw:rounded-full tw:border-0 tw:bg-white/10 tw:p-0 tw:text-white tw:transition-colors tw:duration-120 tw:motion-reduce:transition-none tw:enabled:hover:bg-white/20 tw:disabled:cursor-default tw:disabled:opacity-30 tw:focus-visible:outline-2 tw:focus-visible:outline-offset-2 tw:focus-visible:outline-white'
</script>

<template>
  <Teleport to="body">
    <Transition name="nv-modal">
      <!-- The viewer stays dark in both themes, like any photo viewer. -->
      <div
        v-if="open && current"
        ref="dialogRef"
        class="image-lightbox tw:fixed tw:inset-0 tw:z-(--z-modal) tw:flex tw:flex-col tw:bg-black/90 tw:text-white tw:outline-none"
        role="dialog"
        aria-modal="true"
        tabindex="-1"
        :aria-label="t('image.lightbox.title')"
        @keydown="onKeydown"
      >
        <header class="tw:flex tw:items-center tw:justify-between tw:gap-3 tw:px-4 tw:py-3">
          <span class="image-lightbox__counter tw:font-nv-mono tw:text-[12px] tw:tabular-nums tw:text-white/70" aria-live="polite">
            {{ t('image.lightbox.counter', { current: index + 1, total: images.length }) }}
          </span>
          <button
            type="button"
            :class="navButton"
            :aria-label="t('common.close')"
            :title="t('common.close')"
            @click="emit('close')"
          >
            <X :size="18" />
          </button>
        </header>

        <div class="tw:flex tw:min-h-0 tw:flex-1 tw:items-center tw:gap-1 tw:px-1 tw:sm:gap-3 tw:sm:px-4">
          <button
            type="button"
            :class="navButton"
            :disabled="!hasPrevious"
            :aria-label="t('image.lightbox.previous')"
            :title="t('image.lightbox.previous')"
            @click="emit('previous')"
          >
            <ChevronLeft :size="20" />
          </button>

          <div
            class="image-lightbox__stage tw:flex tw:h-full tw:min-w-0 tw:flex-1"
            :class="zoomed ? 'tw:overflow-auto' : 'tw:items-center tw:justify-center tw:overflow-hidden'"
            @click.self="emit('close')"
          >
            <img
              :key="current.src"
              :src="current.src"
              :alt="current.alt"
              class="image-lightbox__image tw:select-none"
              :class="zoomed ? 'tw:m-auto tw:max-w-none tw:cursor-zoom-out' : 'tw:max-h-full tw:max-w-full tw:cursor-zoom-in tw:object-contain'"
              draggable="false"
              @click="zoomed = !zoomed"
            >
          </div>

          <button
            type="button"
            :class="navButton"
            :disabled="!hasNext"
            :aria-label="t('image.lightbox.next')"
            :title="t('image.lightbox.next')"
            @click="emit('next')"
          >
            <ChevronRight :size="20" />
          </button>
        </div>

        <p class="image-lightbox__caption tw:m-0 tw:min-h-11 tw:px-6 tw:py-3 tw:text-center tw:text-[13px] tw:text-white/80">
          {{ current.caption || current.alt }}
        </p>
      </div>
    </Transition>
  </Teleport>
</template>
