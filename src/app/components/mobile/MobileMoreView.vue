<script setup lang="ts">
import { mobileWorkspaceViewClass, mobileViewHeaderClass, mobileViewEyebrowClass, mobileViewTitleClass } from './mobileChromeClasses'
import {
  ChevronRight,
  FileArchive,
  History,
  LogOut,
  Archive,
  Network,
  Settings2,
} from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'
import NvNoteIcon from '../../../ui/primitives/NvNoteIcon.vue'

defineProps<{
  workspaceName: string
  workspaceGlyph: string
  backendKind?: 'local' | null
}>()

const emit = defineEmits<{
  graph: []
  history: []
  trash: []
  settings: []
  import: []
  leave: []
}>()

const { t } = useI18n()

const menuButtonClass = 'tw:grid tw:min-h-[58px] tw:w-full tw:grid-cols-[38px_minmax(0,1fr)_18px] tw:items-center tw:gap-2.5 tw:border-0 tw:bg-transparent tw:px-3 tw:py-2 tw:text-left tw:text-content-primary'
const menuIconClass = 'tw:grid tw:size-9 tw:place-items-center tw:rounded-[calc(11px*var(--radius-scale,1))] tw:bg-(--accent-soft) tw:text-[color-mix(in_oklab,var(--accent)_78%,var(--text-primary))]'


function run(action: 'graph' | 'history' | 'trash' | 'settings' | 'import' | 'leave') {
  if (action === 'graph') emit('graph')
  else if (action === 'history') emit('history')
  else if (action === 'trash') emit('trash')
  else if (action === 'settings') emit('settings')
  else if (action === 'import') emit('import')
  else emit('leave')
}
</script>

<template>
  <main class="mobile-workspace-view mobile-more" :class="mobileWorkspaceViewClass">
    <header class="mobile-view-header" :class="mobileViewHeaderClass">
      <div>
        <p class="mobile-view-header__eyebrow" :class="mobileViewEyebrowClass">{{ workspaceName }}</p>
        <h1 :class="mobileViewTitleClass">{{ t('workspace.mobile.more.title') }}</h1>
      </div>
    </header>

    <section class="mobile-workspace-card tw:flex tw:min-h-[78px] tw:items-center tw:gap-[13px] tw:rounded-[calc(18px*var(--radius-scale,1))] tw:border tw:border-transparent tw:bg-(--surface-raised) tw:p-3.5 tw:shadow-(--shadow-raised)">
      <span class="mobile-workspace-card__icon tw:grid tw:size-12 tw:flex-[0_0_48px] tw:place-items-center tw:rounded-[calc(15px*var(--radius-scale,1))] tw:border tw:border-transparent tw:bg-(--accent-soft) tw:text-accent">
        <NvNoteIcon :value="workspaceGlyph" :size="21" />
      </span>
      <span class="tw:flex tw:min-w-0 tw:flex-col tw:gap-[5px]">
        <strong class="tw:truncate tw:text-[15px]">{{ workspaceName }}</strong>
        <small class="tw:flex tw:items-center tw:gap-[5px] tw:text-[11px] tw:text-content-muted">{{ t('workspace.mobile.more.onDevice') }}</small>
      </span>
    </section>

    <section class="mobile-menu-section tw:mt-7">
      <h2 class="tw:mx-0.5 tw:mt-0 tw:mb-[9px] tw:text-[10px] tw:font-[740] tw:tracking-[0.12em] tw:uppercase tw:text-content-muted">{{ t('workspace.mobile.more.workspace') }}</h2>
      <div class="mobile-menu-list tw:overflow-hidden tw:rounded-[calc(17px*var(--radius-scale,1))] tw:border tw:border-transparent tw:bg-(--island-bg)">
        <button type="button" :class="menuButtonClass" @click="run('graph')">
          <span :class="menuIconClass"><Network :size="18" /></span>
          <strong class="tw:text-sm tw:font-[590]">{{ t('workspace.system.graph') }}</strong>
          <ChevronRight :size="17" class="tw:text-content-muted" />
        </button>
        <button type="button" :class="menuButtonClass" @click="run('history')">
          <span :class="menuIconClass"><History :size="18" /></span>
          <strong class="tw:text-sm tw:font-[590]">{{ t('workspace.system.history') }}</strong>
          <ChevronRight :size="17" class="tw:text-content-muted" />
        </button>
        <button type="button" :class="menuButtonClass" @click="run('trash')">
          <span :class="menuIconClass"><Archive :size="18" /></span>
          <strong class="tw:text-sm tw:font-[590]">{{ t('workspace.system.trash') }}</strong>
          <ChevronRight :size="17" class="tw:text-content-muted" />
        </button>
      </div>
    </section>

    <section class="mobile-menu-section tw:mt-7">
      <h2 class="tw:mx-0.5 tw:mt-0 tw:mb-[9px] tw:text-[10px] tw:font-[740] tw:tracking-[0.12em] tw:uppercase tw:text-content-muted">{{ t('workspace.mobile.more.management') }}</h2>
      <div class="mobile-menu-list tw:overflow-hidden tw:rounded-[calc(17px*var(--radius-scale,1))] tw:border tw:border-transparent tw:bg-(--island-bg)">
        <button type="button" :class="menuButtonClass" @click="run('settings')">
          <span :class="menuIconClass"><Settings2 :size="18" /></span>
          <strong class="tw:text-sm tw:font-[590]">{{ t('workspace.system.settings') }}</strong>
          <ChevronRight :size="17" class="tw:text-content-muted" />
        </button>
        <button type="button" :class="menuButtonClass" @click="run('import')">
          <span :class="menuIconClass"><FileArchive :size="18" /></span>
          <strong class="tw:text-sm tw:font-[590]">{{ t('workspace.mobile.more.import') }}</strong>
          <ChevronRight :size="17" class="tw:text-content-muted" />
        </button>
        <button type="button" :class="menuButtonClass" @click="run('leave')">
          <span :class="menuIconClass"><LogOut :size="18" /></span>
          <strong class="tw:text-sm tw:font-[590]">{{ t('workspace.mobile.more.switchWorkspace') }}</strong>
          <ChevronRight :size="17" class="tw:text-content-muted" />
        </button>
      </div>
    </section>
  </main>
</template>
