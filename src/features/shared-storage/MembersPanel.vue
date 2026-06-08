<script setup lang="ts">
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { UserPlus, KeyRound, X } from 'lucide-vue-next'
import NvButton from '../../ui/primitives/NvButton.vue'
import NvSelect from '../../ui/primitives/NvSelect.vue'
import { useSharedStorageStore } from '../../stores/sharedStorage'
import { useAuthStore } from '../../stores/auth'
import type { SharedStorage, StorageMember, StorageRole } from '../../types/cloud'

const props = defineProps<{ storage: SharedStorage }>()
const { t } = useI18n()
const shared = useSharedStorageStore()
const auth = useAuthStore()

const inviteEmail = ref('')
const inviteRole = ref<StorageRole>('editor')
const busy = ref(false)

const canManage = computed(() => props.storage.role === 'owner' || props.storage.role === 'admin')
const roleOptions = computed(() => [
  { value: 'admin', label: roleLabel('admin') },
  { value: 'editor', label: roleLabel('editor') },
  { value: 'viewer', label: roleLabel('viewer') },
])

function roleLabel(role: StorageRole): string {
  return t(`cloud.roles.${role}`)
}

async function invite() {
  if (!inviteEmail.value.trim()) return
  busy.value = true
  try {
    await shared.inviteMember(props.storage.id, inviteEmail.value.trim(), inviteRole.value)
    inviteEmail.value = ''
  } finally {
    busy.value = false
  }
}

async function approve(member: StorageMember) {
  busy.value = true
  try { await shared.approveMember(props.storage.id, member) } finally { busy.value = false }
}

async function remove(member: StorageMember) {
  busy.value = true
  try { await shared.removeMember(props.storage.id, member.userId) } finally { busy.value = false }
}

async function changeRole(member: StorageMember, role: StorageRole) {
  await shared.setMemberRole(props.storage.id, member.userId, role)
}
</script>

<template>
  <div class="members">
    <h3 class="members__title">{{ t('cloud.members.title') }}</h3>

    <ul class="members__list">
      <li v-for="m in shared.members" :key="m.userId" class="members__item">
        <img v-if="m.avatarUrl" :src="m.avatarUrl" class="members__avatar" alt="" />
        <div class="members__info">
          <span class="members__name">
            {{ m.displayName || m.email }}
            <span v-if="m.userId === auth.user?.id" class="members__you">· {{ t('cloud.members.you') }}</span>
          </span>
          <span class="members__email">{{ m.email }}</span>
        </div>

        <span v-if="!m.hasKey" class="members__pending">{{ t('cloud.members.pending') }}</span>

        <NvSelect
          v-if="canManage && m.role !== 'owner'"
          :model-value="m.role"
          :options="roleOptions"
          :min-width="96"
          @update:model-value="value => changeRole(m, value as StorageRole)"
        />
        <span v-else class="members__role members__role--static">{{ roleLabel(m.role) }}</span>

        <NvButton
          v-if="canManage && !m.hasKey && m.publicKey"
          size="xs" variant="primary" :loading="busy"
          :title="t('cloud.members.approveHint')"
          @click="approve(m)"
        >
          <KeyRound :size="14" /> {{ t('cloud.members.approve') }}
        </NvButton>

        <button
          v-if="canManage && m.role !== 'owner'"
          class="members__remove" :title="t('cloud.members.remove')"
          @click="remove(m)"
        >
          <X :size="15" />
        </button>
      </li>
    </ul>

    <div v-if="canManage" class="members__invite">
      <div class="members__invite-icon">
        <UserPlus :size="15" />
      </div>
      <div class="members__invite-main">
        <input
          v-model="inviteEmail"
          class="members__input"
          :placeholder="t('cloud.members.invitePlaceholder')"
          @keydown.enter="invite"
        />
        <div class="members__invite-actions">
          <NvSelect
            :model-value="inviteRole"
            :options="roleOptions"
            :min-width="108"
            @update:model-value="value => inviteRole = value as StorageRole"
          />
          <NvButton size="sm" :loading="busy" @click="invite">
            <UserPlus :size="15" /> {{ t('cloud.members.inviteAction') }}
          </NvButton>
        </div>
      </div>
    </div>

    <div v-if="canManage && shared.invites.length" class="members__invites">
      <h4 class="members__subtitle">{{ t('cloud.members.pendingInvites') }}</h4>
      <ul class="members__invitelist">
        <li v-for="inv in shared.invites.filter(i => i.status === 'pending')" :key="inv.id" class="members__inviterow">
          <span>{{ inv.email }}</span>
          <span class="members__role members__role--static">{{ roleLabel(inv.role) }}</span>
        </li>
      </ul>
    </div>
  </div>
</template>

<style scoped>
.members {
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
  width: 100%;
  min-width: 0;
}
.members__title {
  margin: 0;
  color: var(--text-2, inherit);
  font-size: 0.78rem;
  font-weight: 600;
}
.members__subtitle {
  margin: 0 0 0.35rem;
  color: var(--text-4, var(--text-muted));
  font-size: 0.72rem;
  font-weight: 600;
}
.members__list {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  width: 100%;
  margin: 0;
  padding: 0;
  list-style: none;
}
.members__item {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  width: 100%;
  min-width: 0;
  box-sizing: border-box;
  padding: 0.48rem 0.55rem;
  border: 1px solid var(--line-2, var(--border-subtle));
  border-radius: 8px;
  background: color-mix(in oklab, var(--glass-2, var(--surface-2)) 92%, transparent);
}
.members__avatar {
  width: 26px;
  height: 26px;
  flex: 0 0 auto;
  border-radius: 50%;
}
.members__info { display: flex; flex-direction: column; flex: 1; min-width: 0; overflow: hidden; }
.members__name {
  color: var(--text-1, inherit);
  font-size: 0.8rem;
  font-weight: 560;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.members__you { color: var(--accent); font-weight: 500; }
.members__email {
  color: var(--text-4, var(--text-muted));
  font-size: 0.69rem;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.members__pending {
  flex: 0 0 auto;
  padding: 0.1rem 0.42rem;
  border: 1px solid color-mix(in oklab, var(--hue-amber) 24%, transparent);
  border-radius: 999px;
  color: var(--hue-amber);
  font-size: 0.68rem;
  font-weight: 500;
  background: color-mix(in oklab, var(--hue-amber) 12%, transparent);
}
.members__role {
  flex: 0 0 auto;
  color: var(--text-3, inherit);
  font-size: 0.72rem;
}
.members__role--static {
  padding: 0.12rem 0.35rem;
  color: var(--text-4, var(--text-muted));
}
.members__remove {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  flex: 0 0 auto;
  padding: 0;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--text-4, var(--text-muted));
  cursor: pointer;
}
.members__remove:hover {
  background: color-mix(in oklab, var(--hue-rose) 12%, transparent);
  color: var(--hue-rose);
}
.members__invite {
  display: flex;
  align-items: flex-start;
  gap: 0.55rem;
  width: 100%;
  box-sizing: border-box;
  padding: 0.6rem;
  border: 1px solid var(--line-2, var(--border-subtle));
  border-radius: 8px;
  background:
    linear-gradient(180deg, color-mix(in oklab, var(--glass-2, var(--surface-1)) 94%, transparent), color-mix(in oklab, var(--glass-1, var(--surface-1)) 94%, transparent));
}
.members__invite-icon {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  flex: 0 0 auto;
  border: 1px solid color-mix(in oklab, var(--accent) 18%, transparent);
  border-radius: 8px;
  background: var(--accent-soft);
  color: var(--accent);
}
.members__invite-main {
  display: flex;
  flex: 1;
  flex-wrap: wrap;
  gap: 0.45rem;
  min-width: 0;
}
.members__invite-actions {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  flex: 0 0 auto;
}
.members__input {
  flex: 1 1 150px;
  min-width: 0;
  height: 28px;
  box-sizing: border-box;
  padding: 0 0.62rem;
  border: 1px solid var(--line-2, var(--border-subtle));
  border-radius: 7px;
  background: color-mix(in oklab, var(--glass-3, var(--surface-2)) 92%, transparent);
  color: var(--text-1, inherit);
  font: 500 0.76rem var(--font-ui, inherit);
  transition: border-color 0.15s ease, box-shadow 0.15s ease, background 0.15s ease;
}
.members__input::placeholder {
  color: var(--text-4, var(--text-muted));
}
.members__input:focus {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 2px var(--accent-soft);
}
.members__invites {
  width: 100%;
  min-width: 0;
}
.members__invitelist {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  margin: 0;
  padding: 0;
  list-style: none;
}
.members__inviterow {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  min-width: 0;
  padding: 0.38rem 0.5rem;
  border: 1px solid var(--line-1, var(--border-subtle));
  border-radius: 8px;
  color: var(--text-2, inherit);
  font-size: 0.76rem;
}
.members__inviterow > span:first-child {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

@media (max-width: 420px) {
  .members__item {
    flex-wrap: wrap;
  }

  .members__invite-main,
  .members__invite-actions {
    width: 100%;
  }

  .members__invite-actions {
    justify-content: space-between;
  }
}
</style>
