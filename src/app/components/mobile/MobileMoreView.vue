<script setup lang="ts">
import {
  ChevronRight,
  Cloud,
  FileArchive,
  History,
  LogOut,
  Network,
  Settings2,
  Trash2,
} from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'
import NvNoteIcon from '../../../ui/primitives/NvNoteIcon.vue'

defineProps<{
  workspaceName: string
  workspaceGlyph: string
  backendKind?: 'local' | 'cloud' | null
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
  <main class="mobile-workspace-view mobile-more">
    <header class="mobile-view-header">
      <div>
        <p class="mobile-view-header__eyebrow">{{ workspaceName }}</p>
        <h1>{{ t('workspace.mobile.more.title') }}</h1>
      </div>
    </header>

    <section class="mobile-workspace-card">
      <span class="mobile-workspace-card__icon">
        <NvNoteIcon :value="workspaceGlyph" :size="21" />
      </span>
      <span>
        <strong>{{ workspaceName }}</strong>
        <small>
          <Cloud v-if="backendKind === 'cloud'" :size="12" />
          {{ backendKind === 'cloud' ? t('workspace.mobile.more.cloud') : t('workspace.mobile.more.onDevice') }}
        </small>
      </span>
    </section>

    <section class="mobile-menu-section">
      <h2>{{ t('workspace.mobile.more.workspace') }}</h2>
      <div class="mobile-menu-list">
        <button type="button" @click="run('graph')">
          <span><Network :size="18" /></span>
          <strong>{{ t('workspace.system.graph') }}</strong>
          <ChevronRight :size="17" />
        </button>
        <button type="button" @click="run('history')">
          <span><History :size="18" /></span>
          <strong>{{ t('workspace.system.history') }}</strong>
          <ChevronRight :size="17" />
        </button>
        <button type="button" @click="run('trash')">
          <span><Trash2 :size="18" /></span>
          <strong>{{ t('workspace.system.trash') }}</strong>
          <ChevronRight :size="17" />
        </button>
      </div>
    </section>

    <section class="mobile-menu-section">
      <h2>{{ t('workspace.mobile.more.management') }}</h2>
      <div class="mobile-menu-list">
        <button type="button" @click="run('settings')">
          <span><Settings2 :size="18" /></span>
          <strong>{{ t('workspace.system.settings') }}</strong>
          <ChevronRight :size="17" />
        </button>
        <button type="button" @click="run('import')">
          <span><FileArchive :size="18" /></span>
          <strong>{{ t('workspace.mobile.more.import') }}</strong>
          <ChevronRight :size="17" />
        </button>
        <button type="button" @click="run('leave')">
          <span><LogOut :size="18" /></span>
          <strong>{{ t('workspace.mobile.more.switchWorkspace') }}</strong>
          <ChevronRight :size="17" />
        </button>
      </div>
    </section>
  </main>
</template>
