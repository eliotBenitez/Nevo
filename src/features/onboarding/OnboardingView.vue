<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import WelcomeView from './components/WelcomeView.vue'
import CreateWorkspaceView from './components/CreateWorkspaceView.vue'
import OpenWorkspaceView from './components/OpenWorkspaceView.vue'
import WindowControls from '../../ui/primitives/WindowControls.vue'
import type { OnboardingView } from '../../types/workspace'
import { useDeviceLayout } from '../../composables/useDeviceLayout'
import { useMobileBackButton } from '../../composables/useMobileBackButton'

const router = useRouter()
const { t } = useI18n()
const { runtime, useCompactHeader } = useDeviceLayout()

const currentView = ref<OnboardingView>('welcome')
useMobileBackButton(
  () => { currentView.value = 'welcome' },
  computed(() => runtime.value.isMobileRuntime && currentView.value !== 'welcome'),
)

function onDone() {
  router.push('/workspace')
}
</script>

<template>
  <div class="nv-app theme-dark">
    <div class="nv-canvas" />

    <div
      v-if="!runtime.isMobileRuntime || currentView !== 'create'"
      class="onboard-titlebar"
      :class="{
        'onboard-titlebar--compact': useCompactHeader,
        'onboard-titlebar--drag': runtime.supportsWindowDragRegions,
      }"
    >
      <div class="tl-spacer" />
      <div v-if="currentView !== 'welcome'" class="titlebar-label">
        {{ currentView === 'create' ? t('onboarding.create.titlebar') : t('onboarding.open.titlebar') }}
      </div>
      <div class="tl-spacer" />
      <WindowControls />
    </div>

    <!-- View container -->
    <div class="onboard-body">
      <Transition name="fade" mode="out-in">
        <WelcomeView
          v-if="currentView === 'welcome'"
          key="welcome"
          @create="currentView = 'create'"
          @open="currentView = 'open'"
        />
        <CreateWorkspaceView
          v-else-if="currentView === 'create'"
          key="create"
          @back="currentView = 'welcome'"
          @done="onDone"
        />
        <OpenWorkspaceView
          v-else-if="currentView === 'open'"
          key="open"
          @back="currentView = 'welcome'"
          @create="currentView = 'create'"
          @done="onDone"
        />
      </Transition>
    </div>
  </div>
</template>
