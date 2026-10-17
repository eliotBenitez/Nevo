<script setup lang="ts">
import { computed } from 'vue'
import { mathBlockLatex } from '../../utils/noteExport/blockSvg'
import type { ProcessedNode } from '../../utils/noteExport/docxPagination'
import { useDocxPreviewSvg } from '../composables/useDocxPreviewSvg'

const props = defineProps<{
  node: ProcessedNode
  inline?: boolean
}>()

const { url, settled } = useDocxPreviewSvg(() => props.node)

const latex = computed(() => mathBlockLatex(props.node))
</script>

<template>
  <span v-if="inline" class="docx-page__diagram-inline">
    <img v-if="url" class="docx-page__diagram docx-page__diagram--inline" :src="url" alt="">
    <em v-else-if="settled">{{ latex }}</em>
  </span>
  <figure v-else-if="url" class="docx-page__diagram-block">
    <img class="docx-page__diagram" :src="url" alt="">
  </figure>
  <p v-else-if="settled && node.type === 'math_block'" class="docx-page__paragraph docx-page__math-fallback">
    <em>{{ latex }}</em>
  </p>
</template>
