<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { PluginManifest } from '../../../../types/workspace'
import type { PluginCatalogMessages } from '../../../../core/plugins/pluginMessages'
import NvButton from '../../../../ui/primitives/NvButton.vue'
import NvModal from '../../../../ui/primitives/NvModal.vue'
import PluginSettingsForm from '../PluginSettingsForm.vue'
import GithubSyncActions from '../GithubSyncActions.vue'
import { pluginTitle } from './pluginDisplay'

const props = defineProps<{ open: boolean; plugin: PluginManifest | null; messages?: PluginCatalogMessages }>()
const emit = defineEmits<{ (e: 'close'): void }>()

const { t } = useI18n()
const title = computed(() => t('settings.plugins.settings.modalTitle', {
  plugin: props.plugin ? pluginTitle(props.plugin, t, props.messages) : '',
}))
</script>

<template>
  <NvModal :open="open && !!plugin" size="md" :title="title" @close="emit('close')">
    <template v-if="plugin">
      <PluginSettingsForm :plugin="plugin" :messages="messages" />
      <GithubSyncActions v-if="plugin.id === 'nevo.github-sync'" :plugin="plugin" />
    </template>
    <template #footer>
      <NvButton variant="primary" @click="emit('close')">{{ t('settings.plugins.settings.done') }}</NvButton>
    </template>
  </NvModal>
</template>
