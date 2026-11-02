<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { ChatInline } from '../../../core/ai-chat/markdown'
import type { ChatSource } from '../../../core/ai-chat/prompt'

const props = defineProps<{ nodes: ChatInline[]; sources: ChatSource[] }>()
const emit = defineEmits<{ 'open-source': [source: ChatSource] }>()

const { t } = useI18n()

function sourceFor(n: number): ChatSource | undefined {
  return props.sources.find(s => s.n === n)
}
</script>

<template>
  <template v-for="(node, i) in nodes" :key="i">
    <template v-if="node.kind === 'text'">{{ node.value }}</template>
    <button
      v-else-if="node.kind === 'cite' && sourceFor(node.n)"
      type="button"
      class="ai-cite"
      :aria-label="t('aiChat.message.citation', { n: node.n, title: sourceFor(node.n)!.noteTitle })"
      :title="sourceFor(node.n)!.noteTitle"
      @click="emit('open-source', sourceFor(node.n)!)"
    >{{ node.n }}</button>
    <template v-else-if="node.kind === 'cite'">[{{ node.n }}]</template>
    <code v-else-if="node.kind === 'code'">{{ node.value }}</code>
    <br v-else-if="node.kind === 'break'">
    <strong v-else-if="node.kind === 'strong'"><AiChatInline :nodes="node.children" :sources="sources" @open-source="emit('open-source', $event)" /></strong>
    <em v-else-if="node.kind === 'em'"><AiChatInline :nodes="node.children" :sources="sources" @open-source="emit('open-source', $event)" /></em>
    <del v-else><AiChatInline :nodes="node.children" :sources="sources" @open-source="emit('open-source', $event)" /></del>
  </template>
</template>
