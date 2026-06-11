<script setup lang="ts">
import { ChevronLeft } from 'lucide-vue-next'
import { useUiStore } from '../../stores/ui'

const uiStore = useUiStore()
</script>

<template>
  <div class="right-trigger" :title="'Open outline'" @mousedown.stop.prevent="uiStore.toggleRightPanel()">
    <ChevronLeft :size="12" class="right-trigger__icon" />
  </div>
</template>

<style scoped>
.right-trigger {
  position: absolute;
  right: 0;
  top: 0;
  bottom: 0;
  width: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  z-index: 2;
  transition: width 120ms ease, background-color 120ms ease;
  overflow: hidden;
}

.right-trigger:hover {
  width: 24px;
  background: color-mix(in oklab, var(--accent) 10%, transparent);
}

.right-trigger__icon {
  color: var(--text-4);
  opacity: 0;
  transition: opacity 120ms ease;
  flex-shrink: 0;
}

.right-trigger:hover .right-trigger__icon {
  opacity: 1;
  color: var(--accent);
}
</style>
