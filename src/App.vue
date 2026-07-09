<script setup lang="ts">
import { RouterView } from 'vue-router'
import NvConfirmDialog from './ui/primitives/NvConfirmDialog.vue'
import NvToastHost from './ui/primitives/NvToastHost.vue'
import { useGithubSyncNotifications } from './app/composables/useGithubSyncNotifications'

useGithubSyncNotifications()
</script>

<template>
  <RouterView />
  <NvConfirmDialog />
  <NvToastHost />
</template>
