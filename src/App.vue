<script setup lang="ts">
import { RouterView } from 'vue-router'
import NvConfirmDialog from './ui/primitives/NvConfirmDialog.vue'
import NvPasswordPromptDialog from './ui/primitives/NvPasswordPromptDialog.vue'
import NvToastHost from './ui/primitives/NvToastHost.vue'
import { useGithubSyncNotifications } from './app/composables/useGithubSyncNotifications'
import { useAppCloseGuard } from './composables/useAppCloseGuard'

useGithubSyncNotifications()
useAppCloseGuard()
</script>

<template>
  <RouterView />
  <NvConfirmDialog />
  <NvPasswordPromptDialog />
  <NvToastHost />
</template>
