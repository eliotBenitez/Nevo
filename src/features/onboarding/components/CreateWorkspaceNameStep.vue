<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { nextRovingIndex } from '../rovingIndex'

const props = defineProps<{
  name: string
  error: string
  glyphs: readonly string[]
  gradients: readonly string[]
  colourNames: readonly string[]
  selectedGlyph: number
  selectedGradient: number
}>()

const emit = defineEmits<{
  'update:name': [value: string]
  'update:selectedGlyph': [value: number]
  'update:selectedGradient': [value: number]
  submit: []
}>()

const { t } = useI18n()
const inputEl = ref<HTMLInputElement | null>(null)
const glyphButtons = ref<(HTMLButtonElement | null)[]>([])
const gradientButtons = ref<(HTMLButtonElement | null)[]>([])

const nameDescribedBy = computed(() =>
  props.error ? 'workspace-name-hint workspace-name-error' : 'workspace-name-hint'
)

function onGlyphKeydown(event: KeyboardEvent, index: number) {
  const next = nextRovingIndex(event.key, index, props.glyphs.length)
  if (next === null) return
  event.preventDefault()
  emit('update:selectedGlyph', next)
  requestAnimationFrame(() => glyphButtons.value[next]?.focus())
}

function onGradientKeydown(event: KeyboardEvent, index: number) {
  const next = nextRovingIndex(event.key, index, props.gradients.length)
  if (next === null) return
  event.preventDefault()
  emit('update:selectedGradient', next)
  requestAnimationFrame(() => gradientButtons.value[next]?.focus())
}

defineExpose({
  focus: () => inputEl.value?.focus(),
})
</script>

<template>
  <div class="cw-field tw:flex tw:min-w-0 tw:flex-col tw:gap-1.5 tw:min-[1200px]:gap-2">
    <label for="workspace-name" class="tw:text-[12.5px] tw:font-semibold tw:text-content-primary tw:min-[1200px]:text-sm tw:min-[1600px]:text-[15px]">{{ t('onboarding.create.nameLabel') }}</label>
    <input
      id="workspace-name"
      ref="inputEl"
      class="cw-input tw:h-[34px] tw:w-full tw:rounded-lg tw:border-0 tw:px-2.5 tw:font-nv-ui tw:text-[13px] tw:text-content-primary tw:outline-none tw:placeholder:text-content-muted tw:min-[1200px]:h-11 tw:min-[1200px]:rounded-[10px] tw:min-[1200px]:px-3.5 tw:min-[1200px]:text-[15px] tw:min-[1600px]:h-12 tw:min-[1600px]:px-4 tw:min-[1600px]:text-base"
      :class="error ? 'is-invalid tw:bg-(--surface-danger) tw:shadow-[0_0_0_2px_var(--danger)]' : 'tw:bg-(--input-bg) tw:focus:bg-(--surface-raised) tw:focus:shadow-[0_0_0_2px_var(--accent)]'"
      :value="name"
      :placeholder="t('onboarding.create.namePlaceholder')"
      :aria-invalid="Boolean(error)"
      :aria-describedby="nameDescribedBy"
      autofocus
      @input="emit('update:name', ($event.target as HTMLInputElement).value)"
      @keydown.enter.prevent="emit('submit')"
    />
    <p id="workspace-name-hint" class="cw-help tw:m-0 tw:text-[11.5px] tw:text-content-muted tw:min-[1200px]:text-[13px] tw:min-[1200px]:leading-[1.5] tw:min-[1600px]:text-sm">{{ t('onboarding.create.nameHint') }}</p>
    <p v-if="error" id="workspace-name-error" class="cw-error tw:m-0 tw:text-[11.5px] tw:text-danger tw:min-[1200px]:text-[13px] tw:min-[1200px]:leading-[1.5] tw:min-[1600px]:text-sm" role="alert">{{ error }}</p>
  </div>

  <div class="cw-field tw:flex tw:min-w-0 tw:flex-col tw:gap-1.5 tw:min-[1200px]:gap-2">
    <span class="cw-flabel tw:text-[12.5px] tw:font-semibold tw:text-content-primary tw:min-[1200px]:text-sm tw:min-[1600px]:text-[15px]">{{ t('onboarding.create.iconLabel') }}</span>
    <div class="cw-glyphs tw:flex tw:flex-wrap tw:gap-2 tw:min-[1200px]:gap-2.5" role="radiogroup" :aria-label="t('onboarding.create.glyphLabel')">
      <button
        v-for="(g, i) in glyphs"
        :key="i"
        :ref="el => (glyphButtons[i] = el as HTMLButtonElement | null)"
        type="button"
        role="radio"
        class="cw-glyph tw:grid tw:h-9 tw:w-9 tw:cursor-pointer tw:place-items-center tw:rounded-[calc(9px*var(--radius-scale,1))] tw:border-0 tw:font-semibold tw:focus-visible:outline-2 tw:focus-visible:outline-offset-2 tw:focus-visible:outline-focus-ring tw:min-[1200px]:size-[46px] tw:min-[1200px]:rounded-[11px] tw:min-[1200px]:text-[17px] tw:min-[1600px]:size-[52px] tw:min-[1600px]:rounded-[12px] tw:min-[1600px]:text-[19px] tw:max-[719px]:size-11"
        :class="selectedGlyph === i ? 'is-selected tw:bg-accent tw:text-content-on-accent' : 'tw:bg-surface-subtle tw:text-content-secondary tw:hover:bg-[color-mix(in_oklab,var(--surface-subtle)_85%,var(--text-primary)_8%)]'"
        :aria-checked="selectedGlyph === i"
        :aria-label="t('onboarding.create.glyphOption', { n: i + 1 })"
        :tabindex="selectedGlyph === i ? 0 : -1"
        @click="emit('update:selectedGlyph', i)"
        @keydown="onGlyphKeydown($event, i)"
      >{{ g }}</button>
    </div>
    <div class="cw-colors tw:mt-2 tw:mb-1 tw:flex tw:flex-wrap tw:gap-3 tw:pl-0.5 tw:min-[1200px]:mt-2.5 tw:min-[1200px]:mb-1.5 tw:min-[1200px]:gap-3.5" role="radiogroup" :aria-label="t('onboarding.create.colourLabel')">
      <button
        v-for="(g, i) in gradients"
        :key="i"
        :ref="el => (gradientButtons[i] = el as HTMLButtonElement | null)"
        type="button"
        role="radio"
        class="gradient-swatch tw:h-[22px] tw:w-[22px] tw:cursor-pointer tw:rounded-full tw:border-0 tw:p-0 tw:focus-visible:outline-2 tw:focus-visible:outline-offset-2 tw:focus-visible:outline-focus-ring tw:min-[1200px]:size-[30px] tw:min-[1600px]:size-[34px] tw:max-[719px]:size-[30px]"
        :class="selectedGradient === i ? 'is-selected tw:shadow-[0_0_0_2px_var(--island-bg),0_0_0_4px_var(--text-primary)] tw:min-[1200px]:shadow-[0_0_0_3px_var(--island-bg),0_0_0_5px_var(--text-primary)]' : ''"
        :style="{ background: g }"
        :aria-checked="selectedGradient === i"
        :aria-label="t(`onboarding.create.colourNames.${colourNames[i]}`)"
        :tabindex="selectedGradient === i ? 0 : -1"
        @click="emit('update:selectedGradient', i)"
        @keydown="onGradientKeydown($event, i)"
      />
    </div>
    <p class="cw-help tw:m-0 tw:text-[11.5px] tw:text-content-muted tw:min-[1200px]:text-[13px] tw:min-[1200px]:leading-[1.5] tw:min-[1600px]:text-sm">{{ t('onboarding.create.iconHint') }}</p>
  </div>
</template>
