<script setup lang="ts">
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'
import { Plus, Folder } from 'lucide-vue-next'
import AmbientBackdrop from '../../../ui/glass/AmbientBackdrop.vue'
import NevoMark from './NevoMark.vue'
import PrivacyBadge from './PrivacyBadge.vue'
import { useWorkspaceStore } from '../../../stores/workspace'
import { useDeviceLayout } from '../../../composables/useDeviceLayout'
import type { AppLocale } from '../../../types/workspace'

const emit = defineEmits<{
  create: []
  open: []
}>()

const { t } = useI18n()
const { isTouch } = useDeviceLayout()
const workspaceStore = useWorkspaceStore()
const { appConfig, appMetadata } = storeToRefs(workspaceStore)

const localeCycle: AppLocale[] = ['ru', 'en', 'fr', 'es', 'de']
const nextLocale = computed<AppLocale>(() => {
  const idx = localeCycle.indexOf(appConfig.value.locale)
  return localeCycle[(idx + 1) % localeCycle.length]
})

function toggleLocale() {
  void workspaceStore.setAppLocale(nextLocale.value)
}
</script>

<template>
  <div class="welcome-root">
    <AmbientBackdrop />

    <div class="welcome-content">
      <NevoMark />

      <div class="hero-text">
        <div class="hero-title">
          {{ t('onboarding.welcome.title') }}
          <em>{{ t('onboarding.welcome.brand') }}</em>
        </div>
        <div class="hero-sub">{{ t('onboarding.welcome.subtitle') }}</div>
      </div>

      <div class="actions-grid">
        <button class="action-card action-card--accent" @click="emit('create')">
          <div class="action-card-header">
            <div class="action-icon action-icon--accent">
              <Plus :size="18" />
            </div>
            <div class="spacer" />
            <span v-if="!isTouch" class="nv-kbd">⏎</span>
          </div>
          <div>
            <div class="action-title">{{ t('onboarding.welcome.createWorkspace') }}</div>
            <div class="action-sub">{{ t('onboarding.welcome.createSub') }}</div>
          </div>
        </button>

        <button class="action-card" @click="emit('open')">
          <div class="action-card-header">
            <div class="action-icon">
              <Folder :size="18" />
            </div>
            <div class="spacer" />
            <span v-if="!isTouch" class="nv-kbd">⌘O</span>
          </div>
          <div>
            <div class="action-title">{{ t('onboarding.welcome.openExisting') }}</div>
            <div class="action-sub">{{ t('onboarding.welcome.openSub') }}</div>
          </div>
        </button>
      </div>

    </div>

    <PrivacyBadge />
    <div class="version-badge">{{ t('version', { version: appMetadata?.version ?? '0.1.9' }) }}</div>
    <button class="lang-toggle" @click="toggleLocale">
      {{ nextLocale.toUpperCase() }}
    </button>
  </div>
</template>
