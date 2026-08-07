<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  ArrowLeft,
  Check,
  ChevronRight,
  Cloud,
  HardDrive,
  ShieldCheck,
  X,
} from 'lucide-vue-next'
import AmbientBackdrop from '../../../ui/glass/AmbientBackdrop.vue'
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
const storageInfoOpen = ref(false)

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
  if (currentStep.value < 3) {
    currentStep.value += 1
    return
  }
  emit('create')
}

function goBack() {
  if (storageInfoOpen.value) {
    storageInfoOpen.value = false
    return
  }
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
  <div class="mobile-create">
    <AmbientBackdrop />

    <header class="mobile-create__header">
      <button
        class="mobile-create__icon-button"
        type="button"
        :aria-label="t('onboarding.create.back')"
        @click="goBack"
      >
        <ArrowLeft :size="22" />
      </button>
      <strong>{{ t('onboarding.create.mobile.titlebar') }}</strong>
      <span aria-hidden="true" />
    </header>

    <main class="mobile-create__scroll">
      <div class="mobile-create__progress" aria-hidden="true">
        <span
          v-for="step in 3"
          :key="step"
          :class="{
            'is-active': currentStep === step,
            'is-done': currentStep > step,
          }"
        />
      </div>

      <p class="mobile-create__step">
        {{ t('onboarding.create.step', { n: currentStep, total: 3 }) }}
      </p>

      <section v-if="currentStep === 1" class="mobile-create__step-content">
        <h1>{{ t('onboarding.create.mobile.identityTitle') }}</h1>
        <p class="mobile-create__subtitle">
          {{ t('onboarding.create.mobile.identitySubtitle') }}
        </p>

        <label class="mobile-create__label" for="mobile-workspace-name">
          {{ t('onboarding.create.nameLabel') }}
        </label>
        <input
          id="mobile-workspace-name"
          v-model="nameModel"
          class="mobile-create__input"
          type="text"
          autocomplete="off"
          enterkeyhint="next"
          :placeholder="t('onboarding.create.namePlaceholder')"
          autofocus
          @keydown.enter.prevent="goForward"
        />

        <div class="mobile-create__preview">
          <span
            class="mobile-create__workspace-glyph"
            :style="{ background: gradients[selectedGradient] }"
          >
            {{ selectedGlyphValue }}
          </span>
          <span>
            <strong>{{ trimmedName || t('onboarding.create.namePlaceholder') }}</strong>
            <small>{{ t('onboarding.create.mobile.localWorkspace') }}</small>
          </span>
        </div>

        <div class="mobile-create__option-group">
          <p id="mobile-workspace-glyph-label" class="mobile-create__group-label">
            {{ t('onboarding.create.glyphLabel') }}
          </p>
          <div
            class="mobile-create__options"
            role="group"
            aria-labelledby="mobile-workspace-glyph-label"
          >
            <button
              v-for="(_, index) in glyphs"
              :key="index"
              class="mobile-create__glyph"
              :class="{ 'is-selected': selectedGlyph === index }"
              type="button"
              :aria-label="glyphAt(index)"
              :aria-pressed="selectedGlyph === index"
              @click="emit('changeGlyph', index)"
            >
              {{ glyphAt(index) }}
            </button>
          </div>
        </div>

        <div class="mobile-create__option-group">
          <p id="mobile-workspace-colour-label" class="mobile-create__group-label">
            {{ t('onboarding.create.colourLabel') }}
          </p>
          <div
            class="mobile-create__options"
            role="group"
            aria-labelledby="mobile-workspace-colour-label"
          >
            <button
              v-for="gradient, index in gradients"
              :key="gradient"
              class="mobile-create__swatch"
              :class="{ 'is-selected': selectedGradient === index }"
              type="button"
              :style="{ background: gradient }"
              :aria-label="`${t('onboarding.create.colourLabel')} ${index + 1}`"
              :aria-pressed="selectedGradient === index"
              @click="emit('changeGradient', index)"
            />
          </div>
        </div>
      </section>

      <section v-else-if="currentStep === 2" class="mobile-create__step-content">
        <h1>{{ t('onboarding.create.mobile.storageTitle') }}</h1>
        <p class="mobile-create__subtitle">
          {{ t('onboarding.create.mobile.storageSubtitle') }}
        </p>

        <button class="mobile-create__choice is-selected" type="button" aria-pressed="true">
          <span class="mobile-create__choice-icon"><HardDrive :size="20" /></span>
          <span class="mobile-create__choice-copy">
            <strong>{{ t('onboarding.create.mobile.deviceTitle') }}</strong>
            <small>{{ t('onboarding.create.mobile.deviceSubtitle') }}</small>
          </span>
          <Check class="mobile-create__choice-check" :size="20" />
        </button>

        <button
          class="mobile-create__choice"
          type="button"
          disabled
          :title="t('onboarding.create.mobile.cloudUnavailable')"
        >
          <span class="mobile-create__choice-icon"><Cloud :size="20" /></span>
          <span class="mobile-create__choice-copy">
            <strong>{{ t('onboarding.create.mobile.cloudTitle') }}</strong>
            <small>{{ t('onboarding.create.mobile.cloudSubtitle') }}</small>
          </span>
          <span class="mobile-create__badge">{{ t('onboarding.create.mobile.signIn') }}</span>
        </button>

        <div class="mobile-create__privacy">
          <span class="mobile-create__privacy-icon"><ShieldCheck :size="19" /></span>
          <span>
            <strong>{{ t('onboarding.create.mobile.privacyTitle') }}</strong>
            <p>{{ t('onboarding.create.mobile.privacyBody') }}</p>
          </span>
        </div>

        <button
          class="mobile-create__text-action"
          type="button"
          @click="storageInfoOpen = true"
        >
          {{ t('onboarding.create.mobile.storageInfoAction') }}
        </button>
      </section>

      <section v-else class="mobile-create__step-content">
        <h1>{{ t('onboarding.create.mobile.templateTitle') }}</h1>
        <p class="mobile-create__subtitle">
          {{ t('onboarding.create.mobile.templateSubtitle') }}
        </p>

        <div class="mobile-create__templates">
          <button
            v-for="template in templates"
            :key="template"
            class="mobile-create__template"
            :class="{ 'is-selected': selectedTemplate === template }"
            type="button"
            :aria-pressed="selectedTemplate === template"
            @click="emit('changeTemplate', template)"
          >
            <span class="mobile-create__template-mark">
              {{ template === 'empty' ? '+' : template === 'researcher' ? 'R' : template === 'pm' ? 'P' : 'W' }}
            </span>
            <span class="mobile-create__choice-copy">
              <strong>{{ t(`onboarding.create.templates.${template}.name`) }}</strong>
              <small>{{ t(`onboarding.create.templates.${template}.sub`) }}</small>
            </span>
            <Check v-if="selectedTemplate === template" :size="20" />
            <ChevronRight v-else :size="20" />
          </button>
        </div>

        <div class="mobile-create__summary">
          <span
            class="mobile-create__workspace-glyph"
            :style="{ background: gradients[selectedGradient] }"
          >
            {{ selectedGlyphValue }}
          </span>
          <span>
            <strong>{{ trimmedName }}</strong>
            <small>
              {{ t('onboarding.create.mobile.summary', {
                template: t(`onboarding.create.templates.${selectedTemplate}.name`),
              }) }}
            </small>
          </span>
          <button type="button" @click="editIdentity">
            {{ t('onboarding.create.mobile.edit') }}
          </button>
        </div>
      </section>
    </main>

    <footer v-if="!storageInfoOpen" class="mobile-create__footer">
      <p v-if="creationError" class="mobile-create__error" role="alert">
        {{ creationError }}
      </p>
      <button
        class="mobile-create__primary"
        type="button"
        :disabled="isCreating || (currentStep === 1 && !trimmedName)"
        @click="goForward"
      >
        <span v-if="isCreating" class="nv-btn__spinner" aria-hidden="true" />
        <template v-else-if="currentStep < 3">
          {{ t('onboarding.create.mobile.continue') }}
        </template>
        <template v-else>
          {{ t('onboarding.create.mobile.createNamed', { name: trimmedName }) }}
        </template>
      </button>
    </footer>

    <div
      v-if="storageInfoOpen"
      class="mobile-create__sheet-backdrop"
      role="presentation"
      @click.self="storageInfoOpen = false"
    >
      <section
        class="mobile-create__sheet"
        role="dialog"
        aria-modal="true"
        :aria-label="t('onboarding.create.mobile.storageInfoTitle')"
      >
        <button
          class="mobile-create__icon-button mobile-create__sheet-close"
          type="button"
          :aria-label="t('onboarding.create.mobile.close')"
          @click="storageInfoOpen = false"
        >
          <X :size="20" />
        </button>
        <span class="mobile-create__privacy-icon"><ShieldCheck :size="20" /></span>
        <h2>{{ t('onboarding.create.mobile.storageInfoTitle') }}</h2>
        <p>{{ t('onboarding.create.mobile.storageInfoBody') }}</p>
      </section>
    </div>
  </div>
</template>

<style src="../../../styles/onboarding-mobile-create.css"></style>
<style src="../../../styles/onboarding-mobile-create-actions.css"></style>
