<script setup lang="ts">
import { computed } from 'vue'
import { sanitizeSvg } from '../../utils/sanitizeSvg'

interface ProcessedNode {
  type: string
  text?: string
  attrs?: any
  marks?: any[]
  content?: ProcessedNode[]
  headingPrefix?: string
}

interface Props {
  node: ProcessedNode
}

const props = defineProps<Props>()

const safeSvgPreview = computed(() => sanitizeSvg(String(props.node.attrs?.svgPreview ?? '')))

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
      styles['background-color'] = mark.attrs.color
    }
    if ((mark.type === 'text_color' || mark.type === 'color') && mark.attrs?.color) {
      styles['color'] = mark.attrs.color
    }
  }
  return styles
})

const cellStyle = computed(() => {
  const styles: Record<string, string> = {}
  if (!props.node.attrs) return styles
  if (props.node.attrs.align) {
    styles['text-align'] = props.node.attrs.align
  }
  if (props.node.attrs.background) {
    styles['background-color'] = props.node.attrs.background
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
  <p v-else-if="node.type === 'paragraph'" class="docx-page__paragraph">
    <DocxPreviewNode v-for="(child, idx) in node.content" :key="idx" :node="child" />
    <span v-if="!node.content || !node.content.length"><br></span>
  </p>

  <!-- Headings -->
  <component
    v-else-if="node.type === 'heading'"
    :is="`h${node.attrs?.level || 1}`"
    class="docx-page__heading"
    :class="`h${node.attrs?.level || 1}`"
  >
    <span v-if="node.headingPrefix" class="docx-page__heading-prefix">{{ node.headingPrefix }}</span>
    <DocxPreviewNode v-for="(child, idx) in node.content" :key="idx" :node="child" />
  </component>

  <!-- Code block -->
  <pre v-else-if="node.type === 'code_block'" class="docx-page__code-block"><code><DocxPreviewNode v-for="(child, idx) in node.content" :key="idx" :node="child" /></code></pre>

  <!-- Blockquote -->
  <blockquote v-else-if="node.type === 'blockquote'" class="docx-page__blockquote">
    <DocxPreviewNode v-for="(child, idx) in node.content" :key="idx" :node="child" />
  </blockquote>

  <!-- Lists -->
  <ul v-else-if="node.type === 'bullet_list'" class="docx-page__bullet-list">
    <DocxPreviewNode v-for="(child, idx) in node.content" :key="idx" :node="child" />
  </ul>

  <ol v-else-if="node.type === 'ordered_list'" :start="node.attrs?.start" class="docx-page__ordered-list">
    <DocxPreviewNode v-for="(child, idx) in node.content" :key="idx" :node="child" />
  </ol>

  <li v-else-if="node.type === 'list_item'">
    <DocxPreviewNode v-for="(child, idx) in node.content" :key="idx" :node="child" />
  </li>

  <!-- Checklist item -->
  <div v-else-if="node.type === 'checklist_item'" class="docx-page__checklist-item">
    <input type="checkbox" :checked="node.attrs?.checked" disabled />
    <span class="docx-page__checklist-text">
      <DocxPreviewNode v-for="(child, idx) in node.content" :key="idx" :node="child" />
    </span>
  </div>

  <!-- Divider -->
  <hr v-else-if="node.type === 'divider'" class="docx-page__divider" />

  <!-- Callout -->
  <aside v-else-if="node.type === 'callout'" class="docx-page__callout" :class="node.attrs?.variant">
    <span v-if="node.attrs?.icon" class="docx-page__callout-icon">{{ node.attrs.icon }}</span>
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

  <!-- Drawings -->
  <div v-else-if="node.type === 'draw_block'" class="docx-page__draw-block" v-html="safeSvgPreview"></div>

  <!-- Fallback for other node types -->
  <div v-else-if="node.content && node.content.length">
    <DocxPreviewNode v-for="(child, idx) in node.content" :key="idx" :node="child" />
  </div>
</template>
