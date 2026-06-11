<script setup lang="ts">
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { Check, ArrowRight, ArrowLeft, Folder } from 'lucide-vue-next'
import AmbientBackdrop from '../../../ui/glass/AmbientBackdrop.vue'
import NevoMark from './NevoMark.vue'
import { useWorkspaceStore } from '../../../stores/workspace'
import { useTreeStore } from '../../../stores/tree'
import { useAuthStore } from '../../../stores/auth'
import { useSharedStorageStore } from '../../../stores/sharedStorage'
import type { WorkspaceConfig } from '../../../types/workspace'
import { appLogger } from '../../../utils/logger'
import { WORKSPACE_GRADIENTS } from '../../../utils/workspaceGradients'

const emit = defineEmits<{ back: []; done: [] }>()

const { t } = useI18n()
const workspaceStore = useWorkspaceStore()

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

const locationBaseWithSeparator = computed(() => {
  const loc = location.value
  if (!loc) return ''
  const sep = loc.includes('\\\\') ? '\\\\' : '/'
  return loc.endsWith(sep) ? loc : loc + sep
})

const workspaceFullPath = computed(() => locationBaseWithSeparator.value + name.value.trim())

const steps = computed(() => [
  { key: 'name', done: name.value.length > 0 },
  ...(storageType.value === 'local' ? [{ key: 'location', done: location.value.length > 0 }] : []),
  { key: 'template', done: hasInteractedWithTemplates.value },
])

async function browsePath() {
  try {
    const { open } = await import('@tauri-apps/plugin-dialog')
    const selected = await open({ directory: true, title: t('onboarding.create.locationLabel') })
    if (typeof selected === 'string') location.value = selected
  } catch {
    // dev/web fallback — no-op
  }
}

const isCreating = ref(false)

async function createCloud() {
  const auth = useAuthStore()
  if (!auth.isAuthenticated) {
    // Sign in first (relay-configured provider); resolves via the loopback flow.
    await auth.login('github')
  }
  const shared = useSharedStorageStore()
  const storage = await shared.createStorage(
    name.value.trim(), GLYPHS[selectedGlyph.value], GRADIENTS[selectedGradient.value],
  )
  await workspaceStore.openCloudWorkspace(storage.id)
  emit('done')
}

async function create() {
  if (!name.value.trim() || isCreating.value) return
  isCreating.value = true
  try {
    if (storageType.value === 'cloud') {
      await createCloud()
      return
    }
    const config: WorkspaceConfig = {
      name: name.value.trim(),
      glyph: GLYPHS[selectedGlyph.value],
      gradient: GRADIENTS[selectedGradient.value],
      path: workspaceFullPath.value,
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
  <div class="create-root">
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
        <div class="step-label">{{ t('onboarding.create.step', { n: 3, total: 3 }) }}</div>
        <h1 class="form-title">{{ t('onboarding.create.title') }}</h1>
        <p class="form-sub">{{ t('onboarding.create.subtitle') }}</p>

        <!-- Storage type -->
        <div class="form-group">
          <div class="storage-type">
            <button
              type="button"
              class="storage-type__btn"
              :class="{ 'storage-type__btn--active': storageType === 'local' }"
              @click="storageType = 'local'"
            >{{ t('workspace.localWorkspace') }}</button>
            <button
              type="button"
              class="storage-type__btn"
              :class="{ 'storage-type__btn--active': storageType === 'cloud' }"
              @click="storageType = 'cloud'"
            >{{ t('workspace.cloudWorkspace') }}</button>
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
              <div class="sub-label">GLYPH</div>
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
              <div class="sub-label">COLOUR</div>
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
          <button class="nv-btn nv-btn--primary footer-btn-create" :class="{ 'nv-btn--loading': isCreating }" :disabled="isCreating" @click="create">
            <span v-if="isCreating" class="nv-btn__spinner" aria-hidden="true" />
            {{ t('onboarding.create.create') }}
            <ArrowRight v-if="!isCreating" :size="12" />
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.storage-type {
  display: flex;
  gap: 0.4rem;
  padding: 0.3rem;
  border-radius: calc(14px * var(--radius-scale, 1));
  background: var(--glass-1);
  border: 1px solid var(--line-1);
}
.storage-type__btn {
  flex: 1;
  padding: 0.45rem 1rem;
  border-radius: calc(10px * var(--radius-scale, 1));
  border: 1px solid transparent;
  background: transparent;
  color: var(--text-3);
  font-size: 0.85rem;
  font-weight: 550;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}
.storage-type__btn:hover:not(.storage-type__btn--active) {
  background: var(--hover);
  color: var(--text-2);
}
.storage-type__btn--active {
  background: var(--accent-soft);
  color: var(--accent);
  border-color: oklch(from var(--accent) l c h / 0.18);
  box-shadow: inset 0 1px 0 oklch(1 0 0 / 0.05);
}
</style>
