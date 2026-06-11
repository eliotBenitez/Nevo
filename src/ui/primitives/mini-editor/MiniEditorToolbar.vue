<script setup lang="ts">
defineProps<{
  activeMarks?: Set<string>
  linkActive?: boolean
}>()

defineEmits<{
  command: [id: string]
  highlight: []
  link: []
  mathInline: []
}>()
</script>

<template>
  <div class="nme-toolbar-compat" aria-hidden="true" />
</template>
