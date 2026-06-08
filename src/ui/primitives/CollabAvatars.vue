<script setup lang="ts">
import { computed } from 'vue'
import { useCollabStore } from '../../stores/collab'
import { getAwarenessUsers } from '../../editor-core/collaboration/yAwareness'

const collabStore = useCollabStore()

const users = computed(() => {
  const awareness = collabStore.getAwareness()
  if (!awareness) return []
  return Array.from(getAwarenessUsers(awareness).values()).slice(0, 5)
})

function initials(name: string): string {
  return name.trim().split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase() || '?'
}
</script>

<template>
  <div v-if="users.length > 0" class="collab-avatars">
    <div
      v-for="user in users"
      :key="user.clientId"
      class="collab-avatar"
      :style="{ background: user.color }"
      :title="user.name"
    >
      {{ initials(user.name) }}
    </div>
  </div>
</template>
