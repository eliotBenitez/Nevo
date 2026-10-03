<script setup lang="ts">
import type { Component } from 'vue'
import { computed } from 'vue'
import { slashPreviewKind } from '../../../utils/slashBlockPreview'

const props = defineProps<{ itemId: string, icon: Component }>()
const kind = computed(() => slashPreviewKind(props.itemId))
const heading = computed(() => kind.value?.startsWith('heading-'))
const list = computed(() => ['bullets', 'numbers', 'checks'].includes(kind.value ?? ''))
</script>

<template>
  <span class="slash-block-preview" :class="[`slash-block-preview--${kind ?? 'fallback'}`]" aria-hidden="true">
    <template v-if="kind === 'text'">
      <i class="pv-line" /><i class="pv-line" /><i class="pv-line pv-line--short" />
    </template>
    <template v-else-if="heading">
      <i class="pv-heading" /><i class="pv-line" /><i class="pv-line pv-line--short" />
    </template>
    <span v-else-if="kind === 'quote'" class="pv-quote"><i class="pv-line" /><i class="pv-line pv-line--short" /></span>
    <span v-else-if="kind === 'callout'" class="pv-callout"><i /><i class="pv-line" /></span>
    <template v-else-if="kind === 'toggle'">
      <span class="pv-row"><b class="pv-triangle">▸</b><i class="pv-line" /></span>
      <i class="pv-line pv-line--indent" /><i class="pv-line pv-line--indent pv-line--short" />
    </template>
    <template v-else-if="list">
      <span v-for="row in 3" :key="row" class="pv-row">
        <i v-if="kind === 'bullets'" class="pv-dot" />
        <b v-else-if="kind === 'numbers'" class="pv-number">{{ row }}</b>
        <i v-else class="pv-check" :class="{ 'pv-check--on': row === 1 }" />
        <i class="pv-line" :class="{ 'pv-line--short': row === 3 }" />
      </span>
    </template>
    <span v-else-if="kind === 'code'" class="pv-code">&lt;/&gt;</span>
    <span v-else-if="kind === 'math'" class="pv-formula">∑ x²</span>
    <span v-else-if="kind === 'math-inline'" class="pv-inline"><i class="pv-line" /><b>∑ x²</b><i class="pv-line" /></span>
    <span v-else-if="kind === 'table' || kind === 'database'" class="pv-table" :class="{ 'pv-table--database': kind === 'database' }">
      <i v-for="cell in 6" :key="cell" />
    </span>
    <template v-else-if="kind === 'query'">
      <span class="pv-row pv-query"><b>▽</b><i class="pv-line" /></span><i class="pv-line" /><i class="pv-line pv-line--short" />
    </template>
    <svg v-else-if="kind === 'image'" class="pv-art" viewBox="0 0 48 30"><circle cx="34" cy="8" r="4" /><path d="M2 27 16 10l9 10 7-7 14 14Z" /></svg>
    <template v-else-if="kind === 'divider'"><i class="pv-line" /><i class="pv-rule" /><i class="pv-line pv-line--short" /></template>
    <span v-else-if="kind === 'embed'" class="pv-embed"><i /><i class="pv-line" /><i class="pv-line pv-line--short" /></span>
    <span v-else-if="kind === 'note-embed'" class="pv-note-embed">
      <i class="pv-note-embed__icon" />
      <span><i class="pv-line" /><i class="pv-line pv-line--short" /></span>
    </span>
    <span v-else-if="kind === 'audio'" class="pv-audio">
      <i class="pv-audio__play">▶</i>
      <span class="pv-audio__wave"><i v-for="bar in 11" :key="bar" /></span>
    </span>
    <span v-else-if="kind === 'video'" class="pv-video"><i class="pv-video__play" /></span>
    <span v-else-if="kind === 'file'" class="pv-file"><i class="pv-file__fold" /><i class="pv-line" /><i class="pv-line pv-line--short" /></span>
    <span v-else-if="kind === 'chart'" class="pv-chart"><i v-for="bar in 4" :key="bar" /></span>
    <svg v-else-if="kind === 'mermaid'" class="pv-diagram" viewBox="0 0 88 36">
      <path d="M27 18h17m18 0h12" />
      <rect x="1" y="9" width="26" height="18" rx="4" />
      <rect x="44" y="9" width="18" height="18" rx="4" />
      <rect x="74" y="9" width="13" height="18" rx="4" />
    </svg>
    <svg v-else-if="kind === 'markmap'" class="pv-diagram pv-diagram--mindmap" viewBox="0 0 88 36">
      <path d="M28 18h18m0 0 13-11m-13 11 13 11" />
      <rect x="1" y="11" width="27" height="14" rx="4" />
      <rect x="59" y="2" width="27" height="11" rx="4" />
      <rect x="59" y="23" width="27" height="11" rx="4" />
    </svg>
    <span v-else-if="kind === 'template'" class="pv-template">
      <i class="pv-template__header" />
      <span><i /><i /></span>
    </span>
    <span v-else-if="kind === 'emoji'" class="pv-emoji">🙂</span>
    <svg v-else-if="kind === 'draw'" class="pv-art pv-art--draw" viewBox="0 0 48 30"><path d="M2 22c8-22 10 14 18-5S29 28 36 9s8 9 10 4" /></svg>
    <component :is="icon" v-else :size="22" :stroke-width="1.6" class="pv-fallback-icon" />
  </span>
</template>
