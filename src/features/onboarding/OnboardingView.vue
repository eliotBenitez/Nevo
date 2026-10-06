<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { ArrowLeft } from '@lucide/vue'
// Loaded here (not main.ts) so onboarding's CSS ships with this route, not app startup.
import '../../styles/onboarding.css'
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

// The desktop create-workspace wizard no longer exits via its own footer
// (that Back now only steps backward through the wizard), so the titlebar
// grows a dedicated exit-to-welcome control for it.
const showCreateBackButton = computed(() => currentView.value === 'create' && !runtime.value.isMobileRuntime)

function onDone() {
  router.push('/workspace')
}
</script>

<template>
  <div class="nv-app tw:flex tw:flex-col">
    <div class="nv-canvas" />

    <div
      v-if="!runtime.isMobileRuntime || currentView !== 'create'"
      class="onboard-titlebar tw:relative tw:z-5 tw:flex tw:h-9 tw:flex-[0_0_36px] tw:items-center tw:bg-[var(--frame-bg)] tw:border-b-0 tw:pt-[max(var(--safe-area-top),0px)] tw:px-3 tw:pb-0 tw:max-[719px]:pl-[calc(12px_+_max(var(--safe-area-left),0px))] tw:max-[719px]:pr-[calc(12px_+_max(var(--safe-area-right),0px))]"
      :class="{
        'onboard-titlebar--compact tw:max-[719px]:h-auto tw:max-[719px]:basis-auto tw:max-[719px]:min-h-11': useCompactHeader,
        'onboard-titlebar--drag tw:[-webkit-app-region:drag]': runtime.supportsWindowDragRegions,
      }"
    >
      <div class="tl-spacer tw:flex tw:min-w-0 tw:flex-1 tw:items-center">
        <button
          v-if="showCreateBackButton"
          type="button"
          class="nv-btn nv-btn--ghost nv-btn--xs onboard-back-btn tw:flex-none tw:[-webkit-app-region:no-drag]"
          @click="currentView = 'welcome'"
        >
          <ArrowLeft :size="13" />
          {{ t('onboarding.create.back') }}
        </button>
      </div>
      <div v-if="currentView !== 'welcome'" class="titlebar-label tw:text-[11.5px] tw:tracking-[0.02em] tw:text-content-muted">
        {{ currentView === 'create' ? t('onboarding.create.titlebar') : t('onboarding.open.titlebar') }}
      </div>
      <div class="tl-spacer tw:flex tw:min-w-0 tw:flex-1 tw:items-center" />
      <WindowControls />
    </div>

    <!-- View container -->
    <div class="onboard-body tw:relative tw:flex tw:flex-1 tw:overflow-hidden">
      <Transition name="fade" mode="out-in">
        <WelcomeView
          v-if="currentView === 'welcome'"
          key="welcome"
          @create="currentView = 'create'"
          @open="currentView = 'open'"
          @done="onDone"
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
