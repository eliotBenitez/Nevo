<script setup lang="ts">
import { ref, computed, nextTick, onMounted, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'
import MobileCreateWorkspaceFlow from './MobileCreateWorkspaceFlow.vue'
import CreateWorkspaceSteps from './CreateWorkspaceSteps.vue'
import CreateWorkspacePreview from './CreateWorkspacePreview.vue'
import CreateWorkspaceNameStep from './CreateWorkspaceNameStep.vue'
import CreateWorkspaceLocationStep from './CreateWorkspaceLocationStep.vue'
import CreateWorkspaceTemplateStep from './CreateWorkspaceTemplateStep.vue'
import { useWorkspaceStore } from '../../../stores/workspace'
import { useTreeStore } from '../../../stores/tree'
import { useOnboardingStore } from '../../../stores/onboarding'
import type { WorkspaceConfig } from '../../../types/workspace'
import { appLogger } from '../../../utils/logger'
import { resolveRuntimeCapabilities } from '../../../utils/runtime'
import { WORKSPACE_GRADIENTS } from '../../../utils/workspaceGradients'
import { formatWorkspacePath } from '../../../utils/workspacePath'
import { systemCommands } from '../../../tauri/commands'
import { WORKSPACE_TEMPLATES, WORKSPACE_TEMPLATE_STARTERS } from '../workspaceTemplates'
import { buildStarterNoteContent, STARTER_NOTE_ICON } from '../starterNote'

const emit = defineEmits<{ back: []; done: [] }>()

const { t } = useI18n()
const workspaceStore = useWorkspaceStore()
const onboardingStore = useOnboardingStore()
const { appMetadata } = storeToRefs(workspaceStore)
const runtime = computed(() => resolveRuntimeCapabilities(appMetadata.value))

const GRADIENTS = WORKSPACE_GRADIENTS
// Accessible names for WORKSPACE_GRADIENTS, index-aligned.
const COLOUR_NAMES = ['violet', 'coral', 'sage', 'amber', 'slate', 'sky'] as const
const GLYPHS = ['N', '◐', '✦', '◇', '◑', '⌘']
// Passed through to the (unmodified) mobile flow, which owns its own steps.
const TEMPLATES = WORKSPACE_TEMPLATES

const name = ref('Atelier')
const nameStepEl = ref<{ focus: () => void } | null>(null)
const nameError = ref('')
const selectedGlyph = ref(0)
const selectedGradient = ref(0)
const selectedTemplate = ref<typeof WORKSPACE_TEMPLATES[number]>('empty')
const hasInteractedWithTemplates = ref(false)
const location = ref('~/Documents/Nevo/')
const creationError = ref('')
const isCreating = ref(false)

watch(name, () => { nameError.value = '' })

const selectedGlyphValue = computed(() => {
  if (runtime.value.isMobileRuntime && selectedGlyph.value === 0) {
    return name.value.trim().charAt(0).toLocaleUpperCase() || 'N'
  }
  return GLYPHS[selectedGlyph.value]
})

const locationBaseWithSeparator = computed(() => {
  const loc = formatWorkspacePath(location.value, appMetadata.value?.platform)
  if (!loc) return ''
  const sep = resolveRuntimeCapabilities(appMetadata.value).platform === 'windows' ? '\\' : '/'
  return loc.endsWith(sep) ? loc : loc + sep
})

const workspaceFullPath = computed(() => locationBaseWithSeparator.value + name.value.trim())
const displayName = computed(() => name.value.trim() || t('onboarding.create.namePlaceholder'))

// --- Step wizard -------------------------------------------------------

const STEP_KEYS = ['name', 'location', 'template'] as const
const currentStep = ref(0)
const activePanelEl = ref<HTMLElement | null>(null)

const steps = computed(() => STEP_KEYS.map(key => ({ key, label: t(`onboarding.create.steps.${key}`) })))
// Steps beyond the first require a name; once there is one, the rest of the
// wizard is optional and can be jumped to directly from the tablist.
const reachableStep = computed(() => (name.value.trim() ? STEP_KEYS.length - 1 : 0))

function setStep(index: number) {
  currentStep.value = Math.min(STEP_KEYS.length - 1, Math.max(0, index))
}

function next() {
  if (currentStep.value === 0 && !name.value.trim()) {
    creationError.value = ''
    nameError.value = t('onboarding.create.nameRequired')
    nameStepEl.value?.focus()
    return
  }
  if (currentStep.value >= STEP_KEYS.length - 1) {
    create()
    return
  }
  setStep(currentStep.value + 1)
}

function back() {
  setStep(currentStep.value - 1)
}

// Moves focus into the newly visible panel so tab/keyboard navigation lands
// on a real control instead of on a now-hidden one.
watch(currentStep, () => {
  nextTick(() => {
    const panel = activePanelEl.value
    if (!panel) return
    // A plain input (name, location) wins if present; otherwise the roving
    // radiogroup's current item (tabindex 0) — whichever comes first in the
    // panel's DOM order, so the wizard never focuses a non-current radio.
    const target = panel.querySelector<HTMLElement>('input, [tabindex="0"]')
    target?.focus()
  })
})

function selectTemplate(template: typeof WORKSPACE_TEMPLATES[number]) {
  selectedTemplate.value = template
  hasInteractedWithTemplates.value = true
}

// Mobile sandboxes block raw file I/O to shared storage (~/Documents), so the
// default workspace location must live inside the app's writable data dir.
onMounted(async () => {
  try {
    const { appLocalDataDir, documentDir, join } = await import('@tauri-apps/api/path')
    const base = runtime.value.isMobileRuntime ? await appLocalDataDir() : await documentDir()
    location.value = await join(base, 'Nevo')
  } catch (error) {
    await appLogger.error({
      source: 'frontend.onboarding',
      event: 'resolve_default_workspace_location',
      message: 'Failed to resolve default workspace location',
      error,
    })
  }
})

async function resolveWorkspacePath(): Promise<string> {
  try {
    const { join } = await import('@tauri-apps/api/path')
    return await join(location.value, name.value.trim())
  } catch {
    return workspaceFullPath.value
  }
}

async function browsePath() {
  try {
    const selected = await systemCommands.pickWorkspaceDirectory()
    if (selected) location.value = selected
  } catch {
    // dev/web fallback — no-op
  }
}

async function create() {
  if (isCreating.value) return
  if (!name.value.trim()) {
    creationError.value = ''
    nameError.value = t('onboarding.create.nameRequired')
    setStep(0)
    nameStepEl.value?.focus()
    return
  }
  creationError.value = ''
  isCreating.value = true
  try {
    const path = await resolveWorkspacePath()
    const config: WorkspaceConfig = {
      name: name.value.trim(),
      glyph: selectedGlyphValue.value,
      gradient: GRADIENTS[selectedGradient.value],
      path,
      template: selectedTemplate.value,
    }
    await workspaceStore.createWorkspace(config)

    const treeStore = useTreeStore()

    // "Getting started" note, created first so it sits above any template
    // starters in the sidebar and on Home. Failure here must not block
    // workspace creation — the workspace is already usable without it.
    try {
      const starterNote = await treeStore.createNote(null, t('onboarding.starterNote.title'), STARTER_NOTE_ICON)
      if (starterNote && workspaceStore.backend) {
        await workspaceStore.backend.saveNote({
          ...starterNote,
          content: buildStarterNoteContent(t),
          updatedAt: new Date().toISOString(),
        })
        onboardingStore.setStarterNoteId(starterNote.id)
      }
    } catch (error) {
      await appLogger.warn({
        source: 'frontend.onboarding',
        event: 'create_starter_note',
        message: 'Failed to create the starter note; continuing workspace creation',
        error,
      })
    }

    // Populate templates
    const starters = WORKSPACE_TEMPLATE_STARTERS[selectedTemplate.value]
    if (starters.length) {
      const tPath = `onboarding.create.templates.${selectedTemplate.value}.starter`
      for (const item of starters) {
        if (item.kind === 'folder') {
          await treeStore.createFolder(null, t(`${tPath}.${item.key}`), item.emoji)
        } else {
          await treeStore.createNote(null, t(`${tPath}.${item.key}`), item.emoji)
        }
      }
    }

    emit('done')
  } catch (error) {
    creationError.value = t('onboarding.create.mobile.createError')
    await appLogger.error({
      source: 'frontend.onboarding',
      event: 'create_workspace',
      message: 'Failed to create workspace from onboarding',
      workspacePath: workspaceFullPath.value,
      error,
    })
  } finally {
    isCreating.value = false
  }
}
</script>

<template>
  <MobileCreateWorkspaceFlow
    v-if="runtime.isMobileRuntime"
    :name="name"
    :selected-glyph="selectedGlyph"
    :selected-gradient="selectedGradient"
    :selected-template="selectedTemplate"
    :glyphs="GLYPHS"
    :gradients="GRADIENTS"
    :templates="TEMPLATES"
    :is-creating="isCreating"
    :creation-error="creationError"
    @change-name="name = $event"
    @change-glyph="selectedGlyph = $event"
    @change-gradient="selectedGradient = $event"
    @change-template="selectedTemplate = $event"
    @back="emit('back')"
    @create="create"
  />

  <div v-else class="cw-root tw:flex tw:min-h-0 tw:flex-1 tw:overflow-hidden tw:bg-[var(--frame-bg)] tw:pt-0 tw:px-[var(--island-inset)] tw:pb-[var(--island-inset)] tw:max-[959px]:flex-col tw:max-[959px]:overflow-y-auto tw:max-[959px]:pb-[var(--island-inset)]">
    <div class="cw-island tw:flex tw:min-h-0 tw:min-w-0 tw:flex-1 tw:overflow-hidden tw:rounded-[var(--island-radius)] tw:border tw:border-transparent tw:bg-[var(--island-bg)] tw:max-[959px]:flex-none">
      <div class="cw-main tw:flex tw:min-h-0 tw:max-w-[620px] tw:flex-1 tw:flex-col tw:gap-5 tw:overflow-y-auto tw:pt-8 tw:px-11 tw:pb-7 tw:min-[1200px]:max-w-[780px] tw:min-[1200px]:gap-7 tw:min-[1200px]:px-16 tw:min-[1200px]:pt-12 tw:min-[1200px]:pb-10 tw:min-[1600px]:max-w-[900px] tw:min-[1600px]:gap-8 tw:min-[1600px]:px-20 tw:min-[1600px]:pt-14 tw:min-[1600px]:pb-12 tw:max-[719px]:px-5 tw:max-[719px]:pt-[max(var(--safe-area-top),20px)] tw:max-[719px]:pb-[calc(20px+max(var(--safe-area-bottom),0px))]">
        <CreateWorkspaceSteps
          :steps="steps"
          :current="currentStep"
          :reachable="reachableStep"
          :tablist-label="t('onboarding.create.stepsLabel')"
          @select="setStep"
        />

        <div class="cw-heading tw:flex tw:flex-col tw:gap-1 tw:min-[1200px]:gap-1.5">
          <h1 class="cw-title tw:m-0 tw:font-nv-ui tw:text-[22px] tw:font-semibold tw:tracking-[-0.02em] tw:text-content-primary tw:min-[1200px]:text-[30px] tw:min-[1600px]:text-[34px]">{{ t('onboarding.create.title') }}</h1>
          <p class="cw-subtitle tw:m-0 tw:text-[13px] tw:text-content-muted tw:min-[1200px]:text-[15px] tw:min-[1600px]:text-base">{{ t('onboarding.create.subtitle') }}</p>
        </div>

        <div
          v-if="currentStep === 0"
          id="cw-panel-name"
          ref="activePanelEl"
          class="cw-panel tw:flex tw:min-h-[190px] tw:flex-col tw:gap-[18px] tw:min-[1200px]:gap-6 tw:min-[1600px]:gap-7"
          role="tabpanel"
          aria-labelledby="cw-tab-name"
        >
          <CreateWorkspaceNameStep
            ref="nameStepEl"
            :name="name"
            :error="nameError"
            :glyphs="GLYPHS"
            :gradients="GRADIENTS"
            :colour-names="COLOUR_NAMES"
            :selected-glyph="selectedGlyph"
            :selected-gradient="selectedGradient"
            @update:name="name = $event"
            @update:selected-glyph="selectedGlyph = $event"
            @update:selected-gradient="selectedGradient = $event"
            @submit="next"
          />
        </div>

        <div
          v-else-if="currentStep === 1"
          id="cw-panel-location"
          ref="activePanelEl"
          class="cw-panel tw:flex tw:min-h-[190px] tw:flex-col tw:gap-[18px] tw:min-[1200px]:gap-6 tw:min-[1600px]:gap-7"
          role="tabpanel"
          aria-labelledby="cw-tab-location"
        >
          <CreateWorkspaceLocationStep
            :path="workspaceFullPath"
            :display-name="displayName"
            @browse="browsePath"
          />
        </div>

        <div
          v-else
          id="cw-panel-template"
          ref="activePanelEl"
          class="cw-panel tw:flex tw:min-h-[190px] tw:flex-col tw:gap-[18px] tw:min-[1200px]:gap-6 tw:min-[1600px]:gap-7"
          role="tabpanel"
          aria-labelledby="cw-tab-template"
        >
          <CreateWorkspaceTemplateStep
            :templates="WORKSPACE_TEMPLATES"
            :selected="selectedTemplate"
            @select="selectTemplate"
          />
        </div>

        <p v-if="creationError" class="form-error form-error--footer" role="alert">
          {{ creationError }}
        </p>

        <div class="cw-foot tw:mt-auto tw:flex tw:items-center tw:gap-2 tw:min-[1200px]:gap-2.5 tw:max-[719px]:flex-wrap">
          <span class="cw-mono cw-foot-count tw:mr-auto tw:text-[11.5px] tw:text-content-muted tw:font-nv-mono tw:tabular-nums tw:min-[1200px]:text-[13px] tw:min-[1600px]:text-sm tw:max-[719px]:order-[-1] tw:max-[719px]:mb-1 tw:max-[719px]:w-full">{{ t('onboarding.create.step', { n: currentStep + 1, total: STEP_KEYS.length }) }}</span>
          <button
            type="button"
            class="nv-btn nv-btn--ghost footer-btn-back tw:min-[1200px]:h-[42px] tw:min-[1200px]:px-5 tw:min-[1200px]:text-[14.5px] tw:min-[1600px]:h-[46px] tw:min-[1600px]:px-6 tw:min-[1600px]:text-[15.5px] tw:max-[719px]:min-h-11 tw:max-[719px]:flex-1 tw:max-[719px]:justify-center"
            :disabled="currentStep === 0"
            @click="back"
          >
            {{ t('onboarding.create.back') }}
          </button>
          <button
            v-if="currentStep < STEP_KEYS.length - 1"
            type="button"
            class="nv-btn nv-btn--primary footer-btn-next tw:min-[1200px]:h-[42px] tw:min-[1200px]:px-5 tw:min-[1200px]:text-[14.5px] tw:min-[1600px]:h-[46px] tw:min-[1600px]:px-6 tw:min-[1600px]:text-[15.5px] tw:max-[719px]:min-h-11 tw:max-[719px]:flex-1 tw:max-[719px]:justify-center"
            @click="next"
          >
            {{ t('onboarding.create.next') }}
          </button>
          <button
            v-else
            type="button"
            class="nv-btn nv-btn--primary footer-btn-create tw:min-[1200px]:h-[42px] tw:min-[1200px]:px-5 tw:min-[1200px]:text-[14.5px] tw:min-[1600px]:h-[46px] tw:min-[1600px]:px-6 tw:min-[1600px]:text-[15.5px] tw:max-[719px]:min-h-11 tw:max-[719px]:flex-1 tw:max-[719px]:justify-center"
            :class="{ 'nv-btn--loading': isCreating }"
            :disabled="isCreating"
            @click="create"
          >
            <span v-if="isCreating" class="nv-btn__spinner" aria-hidden="true" />
            {{ t('onboarding.create.create') }}
          </button>
        </div>
      </div>
    </div>

    <CreateWorkspacePreview
      :name="name"
      :glyph="selectedGlyphValue"
      :gradient="GRADIENTS[selectedGradient]"
      :template="selectedTemplate"
    />
  </div>
</template>
