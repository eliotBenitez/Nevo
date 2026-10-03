<script setup lang="ts">
withDefaults(defineProps<{ size?: number }>(), { size: 56 })
</script>

<template>
  <div
    class="nevo-mark tw:grid tw:shrink-0 tw:place-items-center tw:bg-accent tw:[font-family:var(--font-serif)] tw:font-normal tw:italic tw:tracking-[-0.04em] tw:text-content-on-accent"
    :style="{
      width: `${size}px`,
      height: `${size}px`,
      borderRadius: `${size * 0.28}px`,
      fontSize: `${size * 0.6}px`,
    }"
  >N</div>
</template>
