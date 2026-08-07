<script setup lang="ts">
defineProps<{
  title: string
  hint: string
}>()
</script>

<template>
  <div class="edgeless-canvas__collapsed-card">
    <span class="edgeless-canvas__collapsed-card__title">{{ title }}</span>
    <span class="edgeless-canvas__collapsed-card__hint">{{ hint }}</span>
  </div>
</template>
