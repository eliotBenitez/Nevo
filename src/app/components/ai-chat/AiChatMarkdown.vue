<script setup lang="ts">
import type { ChatBlock } from '../../../core/ai-chat/markdown'
import type { ChatSource } from '../../../core/ai-chat/prompt'
import AiChatInline from './AiChatInline.vue'

const props = defineProps<{ blocks: ChatBlock[]; sources: ChatSource[] }>()
const emit = defineEmits<{ 'open-source': [source: ChatSource] }>()

// Chat headings stay below the panel's own h2.
const headingTag = (depth: number) => `h${Math.min(depth + 2, 6)}`

// The tail slot (caret, stopped marker) lives inside the last inline block so it flows with the text.
const tailIndex = () => {
  const last = props.blocks.at(-1)
  return last?.kind === 'paragraph' || last?.kind === 'heading' ? props.blocks.length - 1 : -1
}
</script>

<template>
  <p v-if="!blocks.length"><slot name="tail" /></p>
  <template v-for="(block, i) in blocks" :key="i">
    <p v-if="block.kind === 'paragraph'"><AiChatInline :nodes="block.children" :sources="sources" @open-source="emit('open-source', $event)" /><slot v-if="i === tailIndex()" name="tail" /></p>
    <component :is="headingTag(block.depth)" v-else-if="block.kind === 'heading'"><AiChatInline :nodes="block.children" :sources="sources" @open-source="emit('open-source', $event)" /><slot v-if="i === tailIndex()" name="tail" /></component>
    <component :is="block.ordered ? 'ol' : 'ul'" v-else-if="block.kind === 'list'" :start="block.ordered ? block.start : undefined">
      <li v-for="(item, j) in block.items" :key="j" :class="{ 'ai-task': item.checked !== null }">
        <input v-if="item.checked !== null" type="checkbox" disabled :checked="item.checked">
        <div class="ai-li-body"><AiChatMarkdown :blocks="item.children" :sources="sources" @open-source="emit('open-source', $event)" /></div>
      </li>
    </component>
    <pre v-else-if="block.kind === 'code'"><code>{{ block.value }}</code></pre>
    <blockquote v-else-if="block.kind === 'blockquote'"><AiChatMarkdown :blocks="block.children" :sources="sources" @open-source="emit('open-source', $event)" /></blockquote>
    <div v-else-if="block.kind === 'table'" class="ai-table-wrap">
      <table>
        <thead><tr><th v-for="(cell, c) in block.header" :key="c"><AiChatInline :nodes="cell" :sources="sources" @open-source="emit('open-source', $event)" /></th></tr></thead>
        <tbody>
          <tr v-for="(row, r) in block.rows" :key="r"><td v-for="(cell, c) in row" :key="c"><AiChatInline :nodes="cell" :sources="sources" @open-source="emit('open-source', $event)" /></td></tr>
        </tbody>
      </table>
    </div>
    <hr v-else>
  </template>
  <slot v-if="blocks.length && tailIndex() < 0" name="tail" />
</template>
