<script setup lang="ts">
import { Minus, Square, X } from 'lucide-vue-next'
import { computed } from 'vue'
import { useDeviceLayout } from '../../composables/useDeviceLayout'

const { runtime } = useDeviceLayout()
const canRenderWindowControls = computed(() => runtime.value.supportsWindowControls)

async function minimize() {
  if (!canRenderWindowControls.value) return
  const { getCurrentWindow } = await import('@tauri-apps/api/window')
  await getCurrentWindow().minimize()
}

async function toggleMaximize() {
  if (!canRenderWindowControls.value) return
  const { getCurrentWindow } = await import('@tauri-apps/api/window')
  await getCurrentWindow().toggleMaximize()
}

async function close() {
  if (!canRenderWindowControls.value) return
  const { getCurrentWindow } = await import('@tauri-apps/api/window')
  await getCurrentWindow().close()
}
</script>

<template>
  <div v-if="canRenderWindowControls" class="win-controls">
    <button class="wc-btn wc-btn--min" title="Minimize" @click="minimize">
      <Minus :size="10" :stroke-width="2" />
    </button>
    <button class="wc-btn wc-btn--max" title="Maximize" @click="toggleMaximize">
      <Square :size="9" :stroke-width="2" />
    </button>
    <button class="wc-btn wc-btn--close" title="Close" @click="close">
      <X :size="11" :stroke-width="2" />
    </button>
  </div>
</template>
