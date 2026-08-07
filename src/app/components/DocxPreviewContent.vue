<script setup lang="ts">
import type { ProcessedNode } from '../../utils/noteExport/docxPagination'
import DocxPreviewNode from './DocxPreviewNode.vue'

defineProps<{
  nodes: ProcessedNode[]
  title: string
  icon: string
  showTitle: boolean
}>()
</script>

<template>
  <div class="docx-page__content">
    <div
      v-if="showTitle"
      class="docx-page__content-title-wrapper docx-preview-node-wrapper"
      data-docx-title
    >
      <h1 class="docx-page__title-inline">{{ icon }} {{ title || 'Untitled' }}</h1>
    </div>
    <div
      v-for="(node, index) in nodes"
      :key="index"
      class="docx-preview-node-wrapper"
      :data-docx-node-index="index"
    >
      <DocxPreviewNode :node="node" />
    </div>
  </div>
</template>
