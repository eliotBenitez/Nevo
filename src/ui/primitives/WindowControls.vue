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
  <div v-if="canRenderWindowControls" class="win-controls tw:flex tw:h-full tw:items-stretch tw:[-webkit-app-region:no-drag]">
    <button
      class="wc-btn wc-btn--min tw:grid tw:h-[46px] tw:w-[46px] tw:aspect-square tw:place-items-center tw:border-0 tw:bg-transparent tw:text-content-muted tw:cursor-pointer tw:transition-[background,color] tw:duration-100 tw:hover:bg-(--hover-strong) tw:hover:text-content-primary"
      title="Minimize"
      @click="minimize"
    >
      <Minus :size="10" :stroke-width="2" />
    </button>
    <button
      class="wc-btn wc-btn--max tw:grid tw:h-[46px] tw:w-[46px] tw:aspect-square tw:place-items-center tw:border-0 tw:bg-transparent tw:text-content-muted tw:cursor-pointer tw:transition-[background,color] tw:duration-100 tw:hover:bg-(--hover-strong) tw:hover:text-content-primary"
      title="Maximize"
      @click="toggleMaximize"
    >
      <Square :size="9" :stroke-width="2" />
    </button>
    <button
      class="wc-btn wc-btn--close tw:grid tw:h-[46px] tw:w-[46px] tw:aspect-square tw:place-items-center tw:border-0 tw:bg-transparent tw:text-content-muted tw:cursor-pointer tw:transition-[background,color] tw:duration-100 tw:hover:bg-[#e81123] tw:hover:text-white"
      title="Close"
      @click="close"
    >
      <X :size="11" :stroke-width="2" />
    </button>
  </div>
</template>
