<script setup lang="ts">
defineProps<{ label: string }>()
</script>

<template>
  <div class="nv-menu-label" role="presentation">{{ label }}</div>
</template>
