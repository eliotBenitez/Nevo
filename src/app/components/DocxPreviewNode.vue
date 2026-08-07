<script setup lang="ts">
import { computed } from 'vue'
import { sanitizeSvg } from '../../utils/sanitizeSvg'
import { workspaceAssetUrl } from '../../utils/workspaceAssetUrl'
import type { ProcessedNode } from '../../utils/noteExport/docxPagination'

interface Props {
  node: ProcessedNode
}

const props = defineProps<Props>()

const safeSvgPreview = computed(() => sanitizeSvg(String(props.node.attrs?.svgPreview ?? '')))
const imageSource = computed(() => {
  const src = String(props.node.attrs?.src ?? '')
  if (!src || /^(https?|data|blob):/u.test(src)) return src
  try {
    return workspaceAssetUrl(src)
  } catch {
    return ''
  }
})
const headingLevel = computed(() => Number(props.node.attrs?.level ?? 1))
const calloutVariant = computed(() => String(props.node.attrs?.variant ?? ''))

const continuationClasses = computed(() => ({
  'docx-preview-node--continued': props.node.continuesFromPreviousPage,
  'docx-preview-node--continues': props.node.continuesOnNextPage,
}))

const markClasses = computed(() => {
  const classes: string[] = []
  if (!props.node.marks) return classes
  for (const mark of props.node.marks) {
    if (mark.type === 'strong') classes.push('docx-mark-strong')
    if (mark.type === 'em') classes.push('docx-mark-em')
    if (mark.type === 'code') classes.push('docx-mark-code')
    if (mark.type === 'strike') classes.push('docx-mark-strike')
    if (mark.type === 'underline') classes.push('docx-mark-underline')
  }
  return classes
})

const markStyles = computed(() => {
  const styles: Record<string, string> = {}
  if (!props.node.marks) return styles
  for (const mark of props.node.marks) {
    if (mark.type === 'highlight' && mark.attrs?.color) {
      styles['background-color'] = String(mark.attrs.color)
    }
    if ((mark.type === 'text_color' || mark.type === 'color') && mark.attrs?.color) {
      styles['color'] = String(mark.attrs.color)
    }
  }
  return styles
})

const cellStyle = computed(() => {
  const styles: Record<string, string> = {}
  if (!props.node.attrs) return styles
  if (props.node.attrs.align) {
    styles['text-align'] = String(props.node.attrs.align)
  }
  if (props.node.attrs.background) {
    styles['background-color'] = String(props.node.attrs.background)
  }
  return styles
})
</script>

<script lang="ts">
export default {
  name: 'DocxPreviewNode',
}
</script>

<template>
  <!-- Text node with marks -->
  <span v-if="node.type === 'text'" :class="markClasses" :style="markStyles">{{ node.text }}</span>
  
  <!-- Hard break -->
  <br v-else-if="node.type === 'hard_break'" />

  <!-- Paragraph -->
  <p v-else-if="node.type === 'paragraph'" class="docx-page__paragraph" :class="continuationClasses">
    <DocxPreviewNode v-for="(child, idx) in node.content" :key="idx" :node="child" />
    <span v-if="!node.content || !node.content.length"><br></span>
  </p>

  <!-- Headings -->
  <component
    v-else-if="node.type === 'heading'"
    :is="`h${headingLevel}`"
    class="docx-page__heading"
    :class="[`h${headingLevel}`, continuationClasses]"
  >
    <span v-if="node.headingPrefix" class="docx-page__heading-prefix" data-docx-generated>{{ node.headingPrefix }}</span>
    <DocxPreviewNode v-for="(child, idx) in node.content" :key="idx" :node="child" />
  </component>

  <!-- Code block -->
  <pre v-else-if="node.type === 'code_block'" class="docx-page__code-block"><code><DocxPreviewNode v-for="(child, idx) in node.content" :key="idx" :node="child" /></code></pre>

  <!-- Blockquote -->
  <blockquote v-else-if="node.type === 'blockquote'" class="docx-page__blockquote">
    <DocxPreviewNode v-for="(child, idx) in node.content" :key="idx" :node="child" />
  </blockquote>

  <!-- Lists -->
  <ul v-else-if="node.type === 'bullet_list'" class="docx-page__bullet-list" :class="continuationClasses">
    <DocxPreviewNode v-for="(child, idx) in node.content" :key="idx" :node="child" />
  </ul>

  <ol v-else-if="node.type === 'ordered_list'" :start="Number(node.attrs?.start ?? 1)" class="docx-page__ordered-list" :class="continuationClasses">
    <DocxPreviewNode v-for="(child, idx) in node.content" :key="idx" :node="child" />
  </ol>

  <li v-else-if="node.type === 'list_item'">
    <DocxPreviewNode v-for="(child, idx) in node.content" :key="idx" :node="child" />
  </li>

  <!-- Checklist item -->
  <div v-else-if="node.type === 'checklist_item'" class="docx-page__checklist-item">
    <input type="checkbox" :checked="Boolean(node.attrs?.checked)" disabled />
    <span class="docx-page__checklist-text">
      <DocxPreviewNode v-for="(child, idx) in node.content" :key="idx" :node="child" />
    </span>
  </div>

  <!-- Divider -->
  <hr v-else-if="node.type === 'divider'" class="docx-page__divider" />

  <!-- Callout -->
  <aside v-else-if="node.type === 'callout'" class="docx-page__callout" :class="calloutVariant">
    <span v-if="node.attrs?.icon" class="docx-page__callout-icon" data-docx-generated>{{ node.attrs.icon }}</span>
    <div class="docx-page__callout-body">
      <DocxPreviewNode v-for="(child, idx) in node.content" :key="idx" :node="child" />
    </div>
  </aside>

  <!-- Table -->
  <table v-else-if="node.type === 'table'" class="docx-page__table">
    <tbody>
      <DocxPreviewNode v-for="(child, idx) in node.content" :key="idx" :node="child" />
    </tbody>
  </table>

  <tr v-else-if="node.type === 'table_row'">
    <DocxPreviewNode v-for="(child, idx) in node.content" :key="idx" :node="child" />
  </tr>

  <th v-else-if="node.type === 'table_header'" :style="cellStyle" class="docx-page__th">
    <DocxPreviewNode v-for="(child, idx) in node.content" :key="idx" :node="child" />
  </th>

  <td v-else-if="node.type === 'table_cell'" :style="cellStyle" class="docx-page__td">
    <DocxPreviewNode v-for="(child, idx) in node.content" :key="idx" :node="child" />
  </td>

  <!-- Images -->
  <figure v-else-if="node.type === 'image_block'" class="docx-page__image-block">
    <img
      v-if="imageSource"
      class="docx-page__image"
      :src="imageSource"
      :alt="String(node.attrs?.alt ?? '')"
    />
    <figcaption v-if="node.attrs?.caption" class="docx-page__media-caption">
      {{ node.attrs.caption }}
    </figcaption>
  </figure>

  <!-- Drawings -->
  <div v-else-if="node.type === 'draw_block'" class="docx-page__draw-block" v-html="safeSvgPreview"></div>

  <!-- Fallback for other node types -->
  <div v-else-if="node.content && node.content.length">
    <DocxPreviewNode v-for="(child, idx) in node.content" :key="idx" :node="child" />
  </div>
</template>
