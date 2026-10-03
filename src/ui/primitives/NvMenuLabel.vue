<script setup lang="ts">
defineProps<{ label: string }>()
</script>

<template>
  <div
    class="nv-menu-label tw:pt-2.5 tw:px-2 tw:pb-1.5 tw:font-nv-mono tw:text-[10.5px] tw:font-medium tw:tracking-[0.06em] tw:uppercase tw:text-content-muted"
    role="presentation"
  >{{ label }}</div>
</template>
