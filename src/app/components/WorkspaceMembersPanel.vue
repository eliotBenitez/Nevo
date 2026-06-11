<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Users, ChevronRight } from 'lucide-vue-next'
import MembersPanel from '../../features/shared-storage/MembersPanel.vue'
import { useWorkspaceStore } from '../../stores/workspace'
import { useSharedStorageStore } from '../../stores/sharedStorage'

// Collapsible members panel shown under the sidebar workspace-head for cloud
// storages. Role-gated controls live inside MembersPanel (owner/admin only).

const { t } = useI18n()
const workspaceStore = useWorkspaceStore()
const shared = useSharedStorageStore()

const storageId = computed(() =>
  workspaceStore.activeHandle?.kind === 'cloud' ? workspaceStore.activeHandle.storageId : null)
const storage = computed(() => shared.storages.find(s => s.id === storageId.value) ?? null)

const open = ref(false)

watch([open, storageId], async ([isOpen, id]) => {
  if (isOpen && id) {
    await Promise.all([shared.loadMembers(id), shared.loadInvites(id)])
  }
})
</script>

<template>
  <div v-if="storage" class="ws-members">
    <button type="button" class="ws-members__head" @click="open = !open">
      <ChevronRight :size="13" class="ws-members__chevron" :class="{ 'ws-members__chevron--open': open }" />
      <Users :size="13" />
      <span class="ws-members__label">{{ t('cloud.members.title') }}</span>
      <span class="ws-members__count">{{ shared.members.length }}</span>
    </button>
    <div v-if="open" class="ws-members__body">
      <MembersPanel :storage="storage" />
    </div>
  </div>
</template>

<style scoped>
.ws-members {
  border-bottom: 1px solid var(--line-1, rgba(255, 255, 255, 0.06));
  padding: 0.25rem 0.5rem 0.5rem;
}
.ws-members__head {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  width: 100%;
  padding: 0.4rem 0.4rem;
  background: none;
  border: none;
  color: var(--text-muted, #9a9aa8);
  cursor: pointer;
  font-size: 0.78rem;
  border-radius: calc(8px * var(--radius-scale, 1));
}
.ws-members__head:hover { background: var(--surface-2, rgba(255, 255, 255, 0.04)); color: inherit; }
.ws-members__chevron { transition: transform 0.15s ease; }
.ws-members__chevron--open { transform: rotate(90deg); }
.ws-members__label { flex: 1; text-align: left; }
.ws-members__count {
  font-size: 0.7rem;
  padding: 0.05rem 0.35rem;
  border-radius: calc(6px * var(--radius-scale, 1));
  background: var(--surface-3, rgba(255, 255, 255, 0.06));
}
.ws-members__body { padding: 0.5rem 0.4rem 0.25rem; }
</style>
