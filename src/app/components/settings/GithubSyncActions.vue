<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { storeToRefs } from 'pinia'
import { useWorkspaceStore } from '../../../stores/workspace'
import { githubSyncCommands, type GithubSyncResult } from '../../../tauri/commands'
import type { PluginManifest } from '../../../types/workspace'
import NvButton from '../../../ui/primitives/NvButton.vue'

const props = defineProps<{ plugin: PluginManifest }>()

const { t } = useI18n()
const workspaceStore = useWorkspaceStore()
const { activePath } = storeToRefs(workspaceStore)

type ActionState = 'idle' | 'busy' | 'ok' | 'error'

const testState = ref<ActionState>('idle')
const testMessage = ref('')
const syncState = ref<ActionState>('idle')
const syncMessage = ref('')

const lastResult = ref<GithubSyncResult | null>(null)
const lastError = ref<string | null>(null)

const autoSyncEnabled = computed(() => workspaceStore.getPluginSetting(props.plugin.id, 'autoSync') === true)
const intervalMinutes = computed(() => workspaceStore.getPluginSetting(props.plugin.id, 'intervalMinutes'))

const lastSyncedTime = computed(() => {
  const syncedAt = lastResult.value?.syncedAt
  return syncedAt ? workspaceStore.getRelativeTime(syncedAt) : ''
})

async function testConnection() {
  if (!activePath.value) return
  testState.value = 'busy'
  testMessage.value = ''
  try {
    const repo = String(workspaceStore.getPluginSetting(props.plugin.id, 'repo') ?? '')
    await githubSyncCommands.testConnection(repo)
    testState.value = 'ok'
  } catch (error) {
    testState.value = 'error'
    testMessage.value = String(error)
  }
}

async function syncNow() {
  if (!activePath.value) return
  syncState.value = 'busy'
  syncMessage.value = ''
  try {
    const result = await githubSyncCommands.syncNow(activePath.value)
    syncState.value = 'ok'
    lastResult.value = result
    lastError.value = null
  } catch (error) {
    syncState.value = 'error'
    syncMessage.value = String(error)
    lastError.value = String(error)
  }
}

async function loadStatus() {
  if (!activePath.value) return
  try {
    const status = await githubSyncCommands.getStatus(activePath.value)
    lastResult.value = (status.lastResult as GithubSyncResult | undefined) ?? null
    lastError.value = (status.lastError as string | undefined) ?? null
  } catch {
    lastResult.value = null
    lastError.value = null
  }
}

// Keep the background auto-sync task in sync with the `autoSync`/
// `intervalMinutes` plugin settings, which are edited through the shared
// `PluginSettingsForm` and only reach this component reactively.
watch([autoSyncEnabled, intervalMinutes], () => {
  void workspaceStore.syncGithubAutoState()
})

onMounted(loadStatus)
</script>

<template>
  <div class="github-sync-actions">
    <div class="settings-row settings-row--border">
      <div class="row-copy">
        <div class="row-title">{{ t('settings.plugins.githubSync.actions.test') }}</div>
        <div class="row-sub">
          <span v-if="testState === 'busy'">{{ t('settings.plugins.githubSync.status.testing') }}</span>
          <span v-else-if="testState === 'ok'" class="github-sync-actions__ok">{{ t('settings.plugins.githubSync.status.connectionOk') }}</span>
          <span v-else-if="testState === 'error'" class="github-sync-actions__error">{{ t('settings.plugins.githubSync.status.failed', { message: testMessage }) }}</span>
        </div>
      </div>
      <NvButton
        size="sm"
        :disabled="!activePath || testState === 'busy'"
        :loading="testState === 'busy'"
        @click="testConnection"
      >
        {{ t('settings.plugins.githubSync.actions.test') }}
      </NvButton>
    </div>

    <div class="settings-row settings-row--border">
      <div class="row-copy">
        <div class="row-title">{{ t('settings.plugins.githubSync.actions.syncNow') }}</div>
        <div class="row-sub">
          <span v-if="syncState === 'busy'">{{ t('settings.plugins.githubSync.status.syncing') }}</span>
          <span v-else-if="syncState === 'error'" class="github-sync-actions__error">{{ t('settings.plugins.githubSync.status.failed', { message: syncMessage }) }}</span>
          <template v-else-if="lastResult">
            {{ t('settings.plugins.githubSync.status.lastSynced', { time: lastSyncedTime }) }}
            · {{ t('settings.plugins.githubSync.status.filesCount', { count: lastResult.filesCount }) }}
          </template>
          <span v-else-if="lastError" class="github-sync-actions__error">{{ t('settings.plugins.githubSync.status.failed', { message: lastError }) }}</span>
          <span v-else>{{ t('settings.plugins.githubSync.status.never') }}</span>
        </div>
      </div>
      <NvButton
        size="sm"
        :disabled="!activePath || syncState === 'busy'"
        :loading="syncState === 'busy'"
        @click="syncNow"
      >
        {{ t('settings.plugins.githubSync.actions.syncNow') }}
      </NvButton>
    </div>
  </div>
</template>

<style scoped>
.github-sync-actions__ok {
  color: var(--color-success, oklch(0.68 0.09 160));
}

.github-sync-actions__error {
  color: var(--color-danger, oklch(0.65 0.16 25));
}
</style>
