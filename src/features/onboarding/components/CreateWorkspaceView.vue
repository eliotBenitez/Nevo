<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'
import { Check, ArrowRight, ArrowLeft, Folder } from 'lucide-vue-next'
import AmbientBackdrop from '../../../ui/glass/AmbientBackdrop.vue'
import NevoMark from './NevoMark.vue'
import MobileCreateWorkspaceFlow from './MobileCreateWorkspaceFlow.vue'
import { useWorkspaceStore } from '../../../stores/workspace'
import { useTreeStore } from '../../../stores/tree'
import { useAuthStore } from '../../../stores/auth'
import { useSharedStorageStore } from '../../../stores/sharedStorage'
import { useServerConfigStore } from '../../../stores/serverConfig'
import type { WorkspaceConfig } from '../../../types/workspace'
import { appLogger } from '../../../utils/logger'
import { resolveRuntimeCapabilities } from '../../../utils/runtime'
import { WORKSPACE_GRADIENTS } from '../../../utils/workspaceGradients'
import { formatWorkspacePath } from '../../../utils/workspacePath'
import { systemCommands } from '../../../tauri/commands'

const emit = defineEmits<{ back: []; done: [] }>()

const { t } = useI18n()
const workspaceStore = useWorkspaceStore()
const serverConfigStore = useServerConfigStore()
const { appMetadata } = storeToRefs(workspaceStore)
const runtime = computed(() => resolveRuntimeCapabilities(appMetadata.value))

const GRADIENTS = WORKSPACE_GRADIENTS
const GLYPHS = ['N', '◐', '✦', '◇', '◑', '⌘']
const TEMPLATES = ['empty', 'researcher', 'pm', 'writer'] as const

const storageType = ref<'local' | 'cloud'>('local')
const name = ref('Atelier')
const selectedGlyph = ref(0)
const selectedGradient = ref(0)
const selectedTemplate = ref<typeof TEMPLATES[number]>('empty')
const hasInteractedWithTemplates = ref(false)
const location = ref('~/Documents/Nevo/')
const serverUrl = ref(serverConfigStore.serverUrl)
const healthState = ref<'idle' | 'checking' | 'ok' | 'fail'>('idle')
const creationError = ref('')

const isValidServerUrl = computed(() => /^https?:\/\/.+/.test(serverUrl.value.trim()))

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

const steps = computed(() => {
  const items = [
    { key: 'name', done: name.value.length > 0 },
    { key: 'template', done: hasInteractedWithTemplates.value },
  ]
  if (!runtime.value.isMobileRuntime && storageType.value === 'local') {
    items.splice(1, 0, { key: 'location', done: location.value.length > 0 })
  }
  return items
})

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

const isCreating = ref(false)

async function checkConnection() {
  if (!isValidServerUrl.value) {
    healthState.value = 'fail'
    return
  }
  healthState.value = 'checking'
  const ok = await serverConfigStore.checkServerHealth(serverUrl.value)
  healthState.value = ok ? 'ok' : 'fail'
}

async function createCloud() {
  serverConfigStore.setServerUrl(serverUrl.value)
  const auth = useAuthStore()
  if (!auth.isAuthenticated || auth.sessionServerUrl !== serverConfigStore.serverUrl) {
    await auth.login('github')
  }
  const shared = useSharedStorageStore()
  await shared.loadStorages()
  const storage = await shared.createStorage(
    name.value.trim(),
    selectedGlyphValue.value,
    GRADIENTS[selectedGradient.value],
  )
  await workspaceStore.openCloudWorkspace(storage.id, serverConfigStore.serverUrl)
}

async function create() {
  if (!name.value.trim() || isCreating.value) return
  creationError.value = ''
  isCreating.value = true
  try {
    if (storageType.value === 'cloud') {
      await createCloud()
      emit('done')
      return
    }

    const path = await resolveWorkspacePath()
    const config: WorkspaceConfig = {
      name: name.value.trim(),
      glyph: selectedGlyphValue.value,
      gradient: GRADIENTS[selectedGradient.value],
      path,
      template: selectedTemplate.value,
    }
    await workspaceStore.createWorkspace(config)

    // Populate templates
    if (selectedTemplate.value !== 'empty') {
      const treeStore = useTreeStore()
      const tPath = `onboarding.create.templates.${selectedTemplate.value}.starter`
      
      if (selectedTemplate.value === 'researcher') {
        await treeStore.createFolder(null, t(`${tPath}.litReview`), '📚')
        await treeStore.createFolder(null, t(`${tPath}.journals`), '📖')
        await treeStore.createNote(null, t(`${tPath}.ideas`), '💡')
      } else if (selectedTemplate.value === 'pm') {
        await treeStore.createFolder(null, t(`${tPath}.roadmaps`), '🗺️')
        await treeStore.createFolder(null, t(`${tPath}.specs`), '📝')
        await treeStore.createNote(null, t(`${tPath}.notes`), '📋')
      } else if (selectedTemplate.value === 'writer') {
        await treeStore.createFolder(null, t(`${tPath}.drafts`), '✍️')
        await treeStore.createFolder(null, t(`${tPath}.characters`), '🎭')
        await treeStore.createNote(null, t(`${tPath}.ideas`), '💡')
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

  <div v-else class="create-root">
    <AmbientBackdrop />

    <!-- Left rail -->
    <div class="side-rail">
      <NevoMark :size="36" />
      <div>
        <div class="side-title"><em>{{ t('onboarding.create.sideTitle') }}</em></div>
        <div class="side-body">{{ t('onboarding.create.sideBody') }}</div>
      </div>

      <div class="spacer" />

      <div class="steps-list">
        <div
          v-for="(step, i) in steps"
          :key="step.key"
          class="step-item"
        >
          <div class="step-dot" :class="{ 'step-dot--done': step.done }">
            <Check v-if="step.done" :size="10" :stroke-width="2.8" />
            <span v-else>{{ i + 1 }}</span>
          </div>
          <span :class="step.done ? 'step-text--done' : 'step-text'">
            {{ t(`onboarding.create.steps.${step.key}`) }}
          </span>
        </div>
      </div>
    </div>

    <!-- Right form -->
    <div class="form-area">
      <div class="form-inner">
        <div class="step-label">{{ t('onboarding.create.step', { n: steps.length, total: steps.length }) }}</div>
        <h1 class="form-title">{{ t('onboarding.create.title') }}</h1>
        <p class="form-sub">{{ t('onboarding.create.subtitle') }}</p>

        <!-- Storage type -->
        <div class="form-group">
          <div
            class="storage-type"
            role="group"
            :aria-label="t('onboarding.create.mobile.storageTitle')"
          >
            <button
              type="button"
              class="storage-type__btn"
              :class="{ 'storage-type__btn--active': storageType === 'local' }"
              :aria-pressed="storageType === 'local'"
              @click="storageType = 'local'"
            >
              {{ t('workspace.localWorkspace') }}
            </button>
            <button
              type="button"
              class="storage-type__btn"
              :class="{ 'storage-type__btn--active': storageType === 'cloud' }"
              :aria-pressed="storageType === 'cloud'"
              @click="storageType = 'cloud'"
            >
              {{ t('workspace.cloudWorkspace') }}
            </button>
          </div>
        </div>

        <!-- Server URL (cloud only) -->
        <div v-if="storageType === 'cloud'" class="form-group">
          <div class="form-label-row">
            <label class="form-label" for="workspace-server-url">
              {{ t('onboarding.create.serverLabel') }}
            </label>
            <span class="form-hint">{{ t('onboarding.create.serverHint') }}</span>
          </div>
          <div class="location-field">
            <input
              id="workspace-server-url"
              v-model="serverUrl"
              class="server-url-input"
              :placeholder="t('onboarding.create.serverPlaceholder')"
              @input="healthState = 'idle'"
            />
            <button
              type="button"
              class="nv-btn nv-btn--ghost browse-btn"
              :disabled="healthState === 'checking'"
              @click="checkConnection"
            >
              {{ healthState === 'checking'
                ? t('onboarding.create.serverChecking')
                : t('onboarding.create.serverCheck') }}
            </button>
          </div>
          <div
            v-if="healthState !== 'idle'"
            class="server-health-status"
            :class="{
              'server-health-status--ok': healthState === 'ok',
              'server-health-status--fail': healthState === 'fail',
              'server-health-status--checking': healthState === 'checking',
            }"
            role="status"
            aria-live="polite"
          >
            <span v-if="healthState === 'checking'">{{ t('onboarding.create.serverChecking') }}</span>
            <span v-else-if="healthState === 'ok'">{{ t('onboarding.create.serverOk') }}</span>
            <span v-else>{{ t('onboarding.create.serverFail') }}</span>
          </div>
        </div>

        <!-- Name -->
        <div class="form-group">
          <div class="form-label-row">
            <span class="form-label">{{ t('onboarding.create.nameLabel') }}</span>
            <span class="form-hint">{{ t('onboarding.create.nameHint') }}</span>
          </div>
          <div class="name-field">
            <div class="name-icon" :style="{ background: GRADIENTS[selectedGradient] }">
              {{ GLYPHS[selectedGlyph] }}
            </div>
            <input
              v-model="name"
              class="name-input"
              :placeholder="t('onboarding.create.namePlaceholder')"
              autofocus
            />
          </div>
        </div>

        <!-- Icon & colour -->
        <div class="form-group">
          <div class="form-label-row">
            <span class="form-label">{{ t('onboarding.create.iconLabel') }}</span>
            <span class="form-hint">{{ t('onboarding.create.iconHint') }}</span>
          </div>
          <div class="icon-colour-row">
            <div>
              <div class="sub-label">{{ t('onboarding.create.glyphLabel') }}</div>
              <div class="glyph-list">
                <button
                  v-for="(g, i) in GLYPHS"
                  :key="i"
                  class="glyph-btn"
                  :class="{ 'glyph-btn--active': selectedGlyph === i }"
                  :aria-label="g"
                  :aria-pressed="selectedGlyph === i"
                  @click="selectedGlyph = i"
                >{{ g }}</button>
              </div>
            </div>
            <div>
              <div class="sub-label">{{ t('onboarding.create.colourLabel') }}</div>
              <div class="gradient-list">
                <button
                  v-for="(g, i) in GRADIENTS"
                  :key="i"
                  class="gradient-swatch"
                  :class="{ 'gradient-swatch--active': selectedGradient === i }"
                  :style="{ background: g }"
                  :aria-label="`${t('onboarding.create.iconLabel')} ${i + 1}`"
                  :aria-pressed="selectedGradient === i"
                  @click="selectedGradient = i"
                />
              </div>
            </div>
          </div>
        </div>

        <!-- Location -->
        <div v-if="storageType === 'local'" class="form-group">
          <div class="form-label-row">
            <span class="form-label">{{ t('onboarding.create.locationLabel') }}</span>
            <span class="form-hint">{{ t('onboarding.create.locationHint') }}</span>
          </div>
          <div class="location-field">
            <Folder :size="14" class="location-icon" />
            <span class="location-base">{{ locationBaseWithSeparator }}</span>
            <span class="location-name">{{ name || t('onboarding.create.namePlaceholder') }}</span>
            <div class="spacer" />
            <button class="nv-btn nv-btn--ghost browse-btn" @click="browsePath">
              {{ t('onboarding.create.locationBrowse') }}
            </button>
          </div>
        </div>

        <!-- Templates -->
        <div class="form-group">
          <div class="form-label-row">
            <span class="form-label">{{ t('onboarding.create.templateLabel') }}</span>
            <span class="form-hint">{{ t('onboarding.create.templateHint') }}</span>
          </div>
          <div class="templates-grid">
            <button
              v-for="tpl in TEMPLATES"
              :key="tpl"
              class="template-card"
              :class="{ 'template-card--selected': selectedTemplate === tpl }"
              :aria-pressed="selectedTemplate === tpl"
              @click="selectedTemplate = tpl; hasInteractedWithTemplates = true"
            >
              <div class="template-icon" :class="{ 'template-icon--selected': selectedTemplate === tpl }">
                {{ tpl === 'empty' ? '◯' : tpl === 'researcher' ? '✦' : tpl === 'pm' ? '◐' : '◇' }}
              </div>
              <div class="template-name">{{ t(`onboarding.create.templates.${tpl}.name`) }}</div>
              <div class="template-sub">{{ t(`onboarding.create.templates.${tpl}.sub`) }}</div>
              <div v-if="selectedTemplate === tpl" class="template-check">
                <Check :size="9" :stroke-width="3" class="template-check-icon" />
              </div>
            </button>
          </div>
        </div>

        <!-- Footer -->
        <div class="form-footer">
          <button class="nv-btn nv-btn--ghost footer-btn-back" @click="emit('back')">
            <ArrowLeft :size="12" /> {{ t('onboarding.create.back') }}
          </button>
          <div class="spacer" />
          <span class="encryption-label">{{ t('onboarding.create.encryption') }}</span>
          <button
            class="nv-btn nv-btn--primary footer-btn-create"
            :class="{ 'nv-btn--loading': isCreating }"
            :disabled="isCreating || (storageType === 'cloud' && !isValidServerUrl)"
            @click="create"
          >
            <span v-if="isCreating" class="nv-btn__spinner" aria-hidden="true" />
            {{ t('onboarding.create.create') }}
            <ArrowRight v-if="!isCreating" :size="12" />
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
