<script setup lang="ts">
import {
  Bold,
  Code2,
  Highlighter,
  Italic,
  Link2,
  Sigma,
  Strikethrough,
  Subscript,
  Superscript,
  Underline as UnderlineIcon,
} from 'lucide-vue-next'

defineProps<{
  activeMarks: Set<string>
  linkActive: boolean
}>()

const emit = defineEmits<{
  command: [id: string]
  highlight: []
  link: []
  mathInline: []
}>()
</script>

<template>
  <div class="nme-toolbar" @mousedown.prevent>
    <button
      class="nme-tbtn"
      :class="{ 'nme-tbtn--active': activeMarks.has('strong') }"
      aria-label="Bold"
      @click="emit('command', 'core.bold')"
    >
      <Bold :size="13" />
    </button>
    <button
      class="nme-tbtn"
      :class="{ 'nme-tbtn--active': activeMarks.has('em') }"
      aria-label="Italic"
      @click="emit('command', 'core.italic')"
    >
      <Italic :size="13" />
    </button>
    <button
      class="nme-tbtn"
      :class="{ 'nme-tbtn--active': activeMarks.has('underline') }"
      aria-label="Underline"
      @click="emit('command', 'core.underline')"
    >
      <UnderlineIcon :size="13" />
    </button>
    <button
      class="nme-tbtn"
      :class="{ 'nme-tbtn--active': activeMarks.has('strike') }"
      aria-label="Strikethrough"
      @click="emit('command', 'core.strikethrough')"
    >
      <Strikethrough :size="13" />
    </button>
    <button
      class="nme-tbtn"
      :class="{ 'nme-tbtn--active': activeMarks.has('code') }"
      aria-label="Code"
      @click="emit('command', 'core.code')"
    >
      <Code2 :size="13" />
    </button>

    <span class="nme-tsep" aria-hidden="true" />

    <button
      class="nme-tbtn"
      :class="{ 'nme-tbtn--active': linkActive }"
      aria-label="Link"
      @click="emit('link')"
    >
      <Link2 :size="13" />
    </button>
    <button
      class="nme-tbtn"
      :class="{ 'nme-tbtn--active': activeMarks.has('highlight') }"
      aria-label="Highlight"
      @click="emit('highlight')"
    >
      <Highlighter :size="13" />
    </button>

    <span class="nme-tsep" aria-hidden="true" />

    <button
      class="nme-tbtn"
      :class="{ 'nme-tbtn--active': activeMarks.has('superscript') }"
      aria-label="Superscript"
      @click="emit('command', 'core.superscript')"
    >
      <Superscript :size="13" />
    </button>
    <button
      class="nme-tbtn"
      :class="{ 'nme-tbtn--active': activeMarks.has('subscript') }"
      aria-label="Subscript"
      @click="emit('command', 'core.subscript')"
    >
      <Subscript :size="13" />
    </button>
    <button
      class="nme-tbtn"
      aria-label="Inline math"
      @click="emit('mathInline')"
    >
      <Sigma :size="13" />
    </button>
  </div>
</template>

<style scoped>
.nme-toolbar {
  display: flex;
  align-items: center;
  gap: 1px;
  padding: 3px;
  border-radius: calc(9px * var(--radius-scale, 1));
  border: 1px solid var(--line-2, var(--border-subtle));
  background: var(--glass-2, var(--surface-1));
  backdrop-filter: blur(18px) saturate(160%);
  box-shadow: 0 8px 28px -10px rgb(0 0 0 / 0.5);
}

.nme-tbtn {
  display: grid;
  place-items: center;
  width: 26px;
  height: 26px;
  border-radius: calc(6px * var(--radius-scale, 1));
  border: none;
  background: none;
  color: var(--text-3, var(--text-secondary));
  cursor: pointer;
  transition: background 0.1s, color 0.1s;
}

.nme-tbtn:hover {
  background: var(--hover-strong, var(--surface-2));
  color: var(--text-1, var(--text-primary));
}

.nme-tbtn--active {
  background: var(--accent-soft, oklch(0.66 0.10 258 / 0.15));
  color: var(--accent);
}

.nme-tsep {
  width: 1px;
  height: 16px;
  margin: 0 3px;
  background: var(--line-1, var(--border-subtle));
}
</style>
