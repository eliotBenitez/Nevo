<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  ArrowLeft,
  Check,
  ChevronRight,
} from 'lucide-vue-next'
import { useMobileBackButton } from '../../../composables/useMobileBackButton'

type WorkspaceTemplate = 'empty' | 'researcher' | 'pm' | 'writer'

const props = defineProps<{
  name: string
  selectedGlyph: number
  selectedGradient: number
  selectedTemplate: WorkspaceTemplate
  glyphs: readonly string[]
  gradients: readonly string[]
  templates: readonly WorkspaceTemplate[]
  isCreating: boolean
  creationError: string
}>()

const emit = defineEmits<{
  changeName: [value: string]
  changeGlyph: [value: number]
  changeGradient: [value: number]
  changeTemplate: [value: WorkspaceTemplate]
  back: []
  create: []
}>()

const { t } = useI18n()
const currentStep = ref(1)
const TOTAL_STEPS = 2

const trimmedName = computed(() => props.name.trim())
const nameModel = computed({
  get: () => props.name,
  set: value => emit('changeName', value),
})
const workspaceGlyph = computed(() => trimmedName.value.charAt(0).toLocaleUpperCase() || 'N')
const selectedGlyphValue = computed(() =>
  props.selectedGlyph === 0 ? workspaceGlyph.value : props.glyphs[props.selectedGlyph],
)

function glyphAt(index: number) {
  return index === 0 ? workspaceGlyph.value : props.glyphs[index]
}

function goForward() {
  if (currentStep.value === 1 && !trimmedName.value) return
  if (currentStep.value < TOTAL_STEPS) {
    currentStep.value += 1
    return
  }
  emit('create')
}

function goBack() {
  if (currentStep.value > 1) {
    currentStep.value -= 1
    return
  }
  emit('back')
}

function editIdentity() {
  currentStep.value = 1
}

useMobileBackButton(goBack, computed(() => true))
</script>

<template>
  <div class="mobile-create tw:relative tw:z-0 tw:flex tw:min-h-0 tw:w-full tw:min-w-0 tw:flex-1 tw:flex-col tw:overflow-hidden tw:bg-surface-canvas tw:text-content-primary">
    <header class="mobile-create__header tw:relative tw:z-2 tw:grid tw:grid-cols-[44px_minmax(0,1fr)_44px] tw:items-end tw:bg-surface-canvas tw:border-b-0 tw:min-h-[calc(56px_+_max(var(--safe-area-top),0px))] tw:pt-[max(var(--safe-area-top),0px)] tw:pr-[calc(16px_+_max(var(--safe-area-right),0px))] tw:pb-[6px] tw:pl-[calc(16px_+_max(var(--safe-area-left),0px))]">
      <button
        class="mobile-create__icon-button tw:grid tw:h-11 tw:w-11 tw:touch-manipulation tw:place-items-center tw:rounded-[calc(13px*var(--radius-scale,1))] tw:border-0 tw:bg-transparent tw:p-0 tw:text-content-secondary tw:active:bg-[var(--hover-strong)]"
        type="button"
        :aria-label="t('onboarding.create.back')"
        @click="goBack"
      >
        <ArrowLeft :size="22" />
      </button>
      <strong class="tw:self-center tw:truncate tw:text-center tw:text-sm tw:font-[620] tw:text-content-secondary">{{ t('onboarding.create.mobile.titlebar') }}</strong>
      <span aria-hidden="true" />
    </header>

    <main class="mobile-create__scroll tw:relative tw:z-1 tw:min-h-0 tw:flex-1 tw:overflow-x-hidden tw:overflow-y-auto tw:overscroll-contain tw:pt-[22px] tw:pr-[calc(20px_+_max(var(--safe-area-right),0px))] tw:pb-8 tw:pl-[calc(20px_+_max(var(--safe-area-left),0px))]">
      <div class="mobile-create__progress tw:mt-0.5 tw:mb-[22px] tw:flex tw:gap-1.5" aria-hidden="true">
        <span
          v-for="step in TOTAL_STEPS"
          :key="step"
          class="tw:h-[3px] tw:rounded-full tw:transition-[width,background] tw:duration-[160ms] tw:ease tw:motion-reduce:transition-none"
          :class="currentStep === step ? 'is-active tw:w-[42px] tw:bg-accent' : currentStep > step ? 'is-done tw:w-6 tw:bg-[color-mix(in_oklab,var(--accent)_58%,var(--border-default))]' : 'tw:w-6 tw:bg-line-default'"
        />
      </div>

      <p class="mobile-create__step tw:mt-0 tw:mb-2 tw:text-[10.5px] tw:font-[680] tw:tracking-[0.09em] tw:uppercase tw:text-accent">
        {{ t('onboarding.create.step', { n: currentStep, total: TOTAL_STEPS }) }}
      </p>

      <section v-if="currentStep === 1" class="mobile-create__step-content">
        <h1 class="tw:m-0 tw:max-w-[340px] tw:[font-family:var(--font-serif)] tw:text-[clamp(30px,9vw,36px)] tw:leading-[1.06] tw:font-normal tw:tracking-[-0.025em] tw:text-content-primary">{{ t('onboarding.create.mobile.identityTitle') }}</h1>
        <p class="mobile-create__subtitle tw:mt-2.5 tw:mb-6 tw:max-w-[340px] tw:text-[13px] tw:leading-[1.55] tw:text-content-muted">
          {{ t('onboarding.create.mobile.identitySubtitle') }}
        </p>

        <label class="mobile-create__label tw:mx-0.5 tw:mt-[22px] tw:mb-2 tw:block tw:text-[10.5px] tw:font-[680] tw:tracking-[0.09em] tw:uppercase tw:text-content-muted" for="mobile-workspace-name">
          {{ t('onboarding.create.nameLabel') }}
        </label>
        <input
          id="mobile-workspace-name"
          v-model="nameModel"
          class="mobile-create__input tw:min-h-[50px] tw:w-full tw:rounded-[calc(14px*var(--radius-scale,1))] tw:border tw:border-transparent tw:bg-surface-subtle tw:px-3.5 tw:font-nv-ui tw:text-base tw:font-medium tw:text-content-primary tw:outline-none tw:focus:bg-[var(--surface-raised)] tw:focus:shadow-[0_0_0_2px_var(--accent)]"
          type="text"
          autocomplete="off"
          enterkeyhint="next"
          :placeholder="t('onboarding.create.namePlaceholder')"
          autofocus
          @keydown.enter.prevent="goForward"
        />

        <div class="mobile-create__preview tw:mt-4 tw:flex tw:min-w-0 tw:items-center tw:gap-3 tw:rounded-[calc(18px*var(--radius-scale,1))] tw:border-0 tw:bg-surface-subtle tw:p-[13px]">
          <span
            class="mobile-create__workspace-glyph tw:grid tw:h-11 tw:w-11 tw:shrink-0 tw:place-items-center tw:rounded-[calc(14px*var(--radius-scale,1))] tw:border-0 tw:[font-family:var(--font-serif)] tw:text-[19px] tw:text-white"
            :style="{ background: gradients[selectedGradient] }"
          >
            {{ selectedGlyphValue }}
          </span>
          <span class="tw:flex tw:min-w-0 tw:flex-1 tw:flex-col tw:gap-[3px]">
            <strong class="tw:truncate tw:text-sm tw:text-content-primary">{{ trimmedName || t('onboarding.create.namePlaceholder') }}</strong>
            <small class="tw:text-[11px] tw:text-content-muted">{{ t('onboarding.create.mobile.localWorkspace') }}</small>
          </span>
        </div>

        <div class="mobile-create__option-group tw:min-w-0">
          <p id="mobile-workspace-glyph-label" class="mobile-create__group-label tw:mx-0.5 tw:mt-[22px] tw:mb-2 tw:block tw:text-[10.5px] tw:font-[680] tw:tracking-[0.09em] tw:uppercase tw:text-content-muted">
            {{ t('onboarding.create.glyphLabel') }}
          </p>
          <div
            class="mobile-create__options tw:flex tw:max-w-full tw:gap-2.5 tw:overflow-x-auto tw:p-[3px] tw:[scrollbar-width:none] tw:[&::-webkit-scrollbar]:hidden"
            role="group"
            aria-labelledby="mobile-workspace-glyph-label"
          >
            <button
              v-for="(_, index) in glyphs"
              :key="index"
              class="mobile-create__glyph tw:relative tw:grid tw:h-12 tw:w-12 tw:shrink-0 tw:touch-manipulation tw:place-items-center tw:rounded-[calc(15px*var(--radius-scale,1))] tw:border tw:border-transparent tw:p-0 tw:[font-family:var(--font-serif)] tw:text-[17px]"
              :class="selectedGlyph === index ? 'is-selected tw:bg-(--surface-raised) tw:text-content-primary tw:shadow-[0_0_0_2px_var(--accent)]' : 'tw:bg-surface-subtle tw:text-content-secondary'"
              type="button"
              :aria-label="glyphAt(index)"
              :aria-pressed="selectedGlyph === index"
              @click="emit('changeGlyph', index)"
            >
              {{ glyphAt(index) }}
            </button>
          </div>
        </div>

        <div class="mobile-create__option-group tw:min-w-0">
          <p id="mobile-workspace-colour-label" class="mobile-create__group-label tw:mx-0.5 tw:mt-[22px] tw:mb-2 tw:block tw:text-[10.5px] tw:font-[680] tw:tracking-[0.09em] tw:uppercase tw:text-content-muted">
            {{ t('onboarding.create.colourLabel') }}
          </p>
          <div
            class="mobile-create__options tw:flex tw:max-w-full tw:gap-2.5 tw:overflow-x-auto tw:p-[3px] tw:[scrollbar-width:none] tw:[&::-webkit-scrollbar]:hidden"
            role="group"
            aria-labelledby="mobile-workspace-colour-label"
          >
            <button
              v-for="gradient, index in gradients"
              :key="gradient"
              class="mobile-create__swatch tw:relative tw:grid tw:h-12 tw:w-12 tw:shrink-0 tw:touch-manipulation tw:place-items-center tw:overflow-hidden tw:rounded-[calc(15px*var(--radius-scale,1))] tw:border tw:border-transparent tw:bg-surface-subtle tw:p-0 tw:[font-family:var(--font-serif)] tw:text-[17px] tw:text-content-secondary"
              :class="selectedGradient === index ? 'is-selected tw:shadow-[0_0_0_2px_var(--accent)]' : ''"
              type="button"
              :style="{ background: gradient }"
              :aria-label="`${t('onboarding.create.colourLabel')} ${index + 1}`"
              :aria-pressed="selectedGradient === index"
              @click="emit('changeGradient', index)"
            />
          </div>
        </div>
      </section>

      <section v-else class="mobile-create__step-content">
        <h1 class="tw:m-0 tw:max-w-[340px] tw:[font-family:var(--font-serif)] tw:text-[clamp(30px,9vw,36px)] tw:leading-[1.06] tw:font-normal tw:tracking-[-0.025em] tw:text-content-primary">{{ t('onboarding.create.mobile.templateTitle') }}</h1>
        <p class="mobile-create__subtitle tw:mt-2.5 tw:mb-6 tw:max-w-[340px] tw:text-[13px] tw:leading-[1.55] tw:text-content-muted">
          {{ t('onboarding.create.mobile.templateSubtitle') }}
        </p>

        <div class="mobile-create__templates tw:flex tw:flex-col tw:gap-[9px]">
          <button
            v-for="template in templates"
            :key="template"
            class="mobile-create__template tw:mb-0 tw:flex tw:min-h-[68px] tw:w-full tw:touch-manipulation tw:items-center tw:gap-3 tw:rounded-[calc(18px*var(--radius-scale,1))] tw:border tw:border-transparent tw:px-3 tw:py-2.5 tw:text-left tw:text-content-secondary"
            :class="selectedTemplate === template ? 'is-selected tw:bg-(--surface-raised) tw:shadow-[0_0_0_2px_var(--accent)]' : 'tw:bg-surface-subtle'"
            type="button"
            :aria-pressed="selectedTemplate === template"
            @click="emit('changeTemplate', template)"
          >
            <span class="mobile-create__template-mark tw:grid tw:h-10 tw:w-10 tw:shrink-0 tw:place-items-center tw:rounded-[calc(12px*var(--radius-scale,1))] tw:bg-surface-navigation tw:[font-family:var(--font-serif)] tw:text-base tw:font-bold tw:text-accent">
              {{ template === 'empty' ? '+' : template === 'researcher' ? 'R' : template === 'pm' ? 'P' : 'W' }}
            </span>
            <span class="mobile-create__choice-copy tw:flex tw:min-w-0 tw:flex-1 tw:flex-col tw:gap-1">
              <strong class="tw:text-[14px] tw:font-[620] tw:text-content-primary">{{ t(`onboarding.create.templates.${template}.name`) }}</strong>
              <small class="tw:text-[11px] tw:leading-[1.35] tw:text-content-muted">{{ t(`onboarding.create.templates.${template}.sub`) }}</small>
            </span>
            <Check v-if="selectedTemplate === template" :size="20" class="tw:shrink-0 tw:text-accent" />
            <ChevronRight v-else :size="20" class="tw:shrink-0 tw:text-content-muted" />
          </button>
        </div>

        <div class="mobile-create__summary tw:mt-[18px] tw:flex tw:min-w-0 tw:items-center tw:gap-3 tw:rounded-[calc(18px*var(--radius-scale,1))] tw:border-0 tw:bg-surface-subtle tw:p-[13px]">
          <span
            class="mobile-create__workspace-glyph tw:grid tw:h-11 tw:w-11 tw:shrink-0 tw:place-items-center tw:rounded-[calc(14px*var(--radius-scale,1))] tw:border-0 tw:[font-family:var(--font-serif)] tw:text-[19px] tw:text-white"
            :style="{ background: gradients[selectedGradient] }"
          >
            {{ selectedGlyphValue }}
          </span>
          <span class="tw:flex tw:min-w-0 tw:flex-1 tw:flex-col tw:gap-[3px]">
            <strong class="tw:truncate tw:text-sm tw:text-content-primary">{{ trimmedName }}</strong>
            <small class="tw:text-[11px] tw:text-content-muted">
              {{ t('onboarding.create.mobile.summary', {
                template: t(`onboarding.create.templates.${selectedTemplate}.name`),
              }) }}
            </small>
          </span>
          <button type="button" class="mobile-create__summary-edit tw:min-w-11 tw:min-h-11 tw:border-0 tw:bg-transparent tw:px-1 tw:text-[11px] tw:text-accent" @click="editIdentity">
            {{ t('onboarding.create.mobile.edit') }}
          </button>
        </div>
      </section>
    </main>

    <footer class="mobile-create__footer tw:relative tw:z-3 tw:bg-surface-canvas tw:border-t-0 tw:pt-3 tw:pr-[calc(20px_+_max(var(--safe-area-right),0px))] tw:pb-[calc(12px_+_max(var(--safe-area-bottom),0px))] tw:pl-[calc(20px_+_max(var(--safe-area-left),0px))]">
      <p v-if="creationError" class="mobile-create__error tw:mt-0 tw:mb-2 tw:text-center tw:text-xs tw:text-danger" role="alert">
        {{ creationError }}
      </p>
      <button
        class="mobile-create__primary tw:flex tw:min-h-[50px] tw:w-full tw:touch-manipulation tw:items-center tw:justify-center tw:gap-2 tw:rounded-[calc(15px*var(--radius-scale,1))] tw:border-0 tw:bg-accent tw:px-[18px] tw:text-sm tw:font-[680] tw:text-content-on-accent tw:disabled:cursor-default tw:disabled:opacity-50"
        type="button"
        :disabled="isCreating || (currentStep === 1 && !trimmedName)"
        @click="goForward"
      >
        <span v-if="isCreating" class="nv-btn__spinner" aria-hidden="true" />
        <template v-else-if="currentStep < TOTAL_STEPS">
          {{ t('onboarding.create.mobile.continue') }}
        </template>
        <template v-else>
          {{ t('onboarding.create.mobile.createNamed', { name: trimmedName }) }}
        </template>
      </button>
    </footer>
  </div>
</template>

<style src="../../../styles/onboarding-mobile-create.css"></style>
