<script setup lang="ts">
withDefaults(defineProps<{ size?: number }>(), { size: 56 })
</script>

<template>
  <div
    class="nevo-mark"
    :style="{
      width: `${size}px`,
      height: `${size}px`,
      borderRadius: `${size * 0.28}px`,
      fontSize: `${size * 0.6}px`,
    }"
  >N</div>
</template>
