<script setup lang="ts">
import { ref, computed } from 'vue'
import { useCollabStore } from '../../../stores/collab'

const emit = defineEmits<{
  close: []
  'start-local-hosting': []
  'start-cloud-hosting': []
  'join-session': [input: string]
}>()

const collabStore = useCollabStore()

type Tab = 'local' | 'cloud'
const activeTab = ref<Tab>('cloud')
const joinInput = ref('')
const copySuccess = ref(false)

const status = computed(() => collabStore.connectionStatus)
const mode = computed(() => collabStore.mode)
const peers = computed(() => collabStore.connectedPeers)

const isLocal = computed(() => mode.value === 'local')
const isCloud = computed(() => mode.value === 'cloud')
const isActive = computed(() => isLocal.value || isCloud.value)

const localUrl = computed(() => collabStore.serverInfo?.url ?? '')
const cloudShare = computed(() => {
  const code = collabStore.cloudRoomCode
  const key = collabStore.cloudKeyBase64
  return code && key ? `${code}#k=${key}` : ''
})

const shareValue = computed(() => isLocal.value ? localUrl.value : cloudShare.value)

const statusLabel = computed(() => {
  switch (status.value) {
    case 'connecting': return 'Connecting…'
    case 'syncing': return 'Syncing…'
    case 'connected': return `Connected · ${peers.value} ${peers.value === 1 ? 'person' : 'people'}`
    case 'disconnected': return 'Disconnected'
    case 'error': return 'Connection error'
    default: return 'Not sharing'
  }
})

async function copyShare() {
  if (!shareValue.value) return
  await navigator.clipboard.writeText(shareValue.value)
  copySuccess.value = true
  setTimeout(() => { copySuccess.value = false }, 2000)
}

function joinSession() {
  const v = joinInput.value.trim()
  if (!v) return
  emit('join-session', v)
  joinInput.value = ''
}
</script>

<template>
  <div class="cp">
    <div class="cp__header">
      <span class="cp__title">Collaboration</span>
      <button class="cp__close" @click="emit('close')">✕</button>
    </div>

    <div class="cp__status">
      <span class="cp__dot" :class="`cp__dot--${status}`" />
      <span class="cp__status-label">{{ statusLabel }}</span>
    </div>

    <!-- Active session view -->
    <template v-if="isActive">
      <div class="cp__section">
        <p class="cp__label">
          {{ isCloud ? 'Share code (E2E encrypted)' : 'Share URL (local network)' }}
        </p>
        <div class="cp__url-row">
          <code class="cp__url">{{ shareValue }}</code>
          <button class="cp__copy" @click="copyShare">
            {{ copySuccess ? 'Copied!' : 'Copy' }}
          </button>
        </div>
      </div>
      <button class="cp__btn cp__btn--danger" @click="collabStore.stopHosting()">
        Stop sharing
      </button>
    </template>

    <!-- Idle view -->
    <template v-else>
      <div class="cp__tabs">
        <button
          class="cp__tab"
          :class="{ 'cp__tab--active': activeTab === 'cloud' }"
          @click="activeTab = 'cloud'"
        >
          Cloud
        </button>
        <button
          class="cp__tab"
          :class="{ 'cp__tab--active': activeTab === 'local' }"
          @click="activeTab = 'local'"
        >
          Local
        </button>
      </div>

      <div v-if="activeTab === 'cloud'" class="cp__section">
        <p class="cp__label">E2E encrypted · no IP sharing needed</p>
        <button class="cp__btn" @click="emit('start-cloud-hosting')">
          Share via cloud
        </button>
      </div>

      <div v-else class="cp__section">
        <p class="cp__label">Share on your local network (LAN)</p>
        <button class="cp__btn" @click="emit('start-local-hosting')">
          Host on local network
        </button>
      </div>

      <div class="cp__divider" />

      <div class="cp__section">
        <p class="cp__label">Join a session</p>
        <div class="cp__join-row">
          <input
            v-model="joinInput"
            class="cp__input"
            :placeholder="activeTab === 'cloud' ? 'CODE#k=KEY' : 'ws://192.168.x.x:4444'"
            type="text"
            @keydown.enter="joinSession"
          />
          <button class="cp__btn cp__btn--sm" :disabled="!joinInput.trim()" @click="joinSession">
            Join
          </button>
        </div>
      </div>
    </template>
  </div>
</template>
