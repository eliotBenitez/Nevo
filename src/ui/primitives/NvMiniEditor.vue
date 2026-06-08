<script setup lang="ts">
import { onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { getLinkRange } from '../../editor-core'
import { useMiniEditorView } from './mini-editor/useMiniEditorView'
import MiniEditorToolbar from './mini-editor/MiniEditorToolbar.vue'

interface Props {
  modelValue: unknown
  placeholder?: string
}

const props = withDefaults(defineProps<Props>(), { placeholder: 'Write something…' })
const emit = defineEmits<{ 'update:modelValue': [value: unknown] }>()

const HIGHLIGHT_COLOR = '#fef08a'

const rootEl = ref<HTMLElement | null>(null)
const mountEl = ref<HTMLElement | null>(null)
const linkInputEl = ref<HTMLInputElement | null>(null)

const linkPopover = reactive({ open: false, href: '', top: 0, left: 0 })

const editor = useMiniEditorView(mountEl, {
  getModelValue: () => props.modelValue,
  emitUpdate: (value) => emit('update:modelValue', value),
})

const { activeMarks, isEmpty, toolbar, mathPopover } = editor

function onToolbarCommand(id: string) {
  editor.executeCommandById(id)
}

function applyHighlight() {
  const core = editor.getCoreCommands()
  if (core) editor.dispatch(core.toggleHighlight(HIGHLIGHT_COLOR))
}

function openLinkPopover() {
  const view = editor.view.value
  if (!view) return
  const range = getLinkRange(view.state)
  linkPopover.href = range?.href ?? ''
  linkPopover.top = toolbar.top + 38
  linkPopover.left = toolbar.left
  linkPopover.open = true
  requestAnimationFrame(() => linkInputEl.value?.focus())
}

function applyLink() {
  const core = editor.getCoreCommands()
  const href = linkPopover.href.trim()
  if (core && href) editor.dispatch(core.setLink(href))
  linkPopover.open = false
}

function removeLink() {
  const core = editor.getCoreCommands()
  if (core) editor.dispatch(core.unsetLink)
  linkPopover.open = false
}

function onLinkKeyDown(event: KeyboardEvent) {
  if (event.key === 'Enter') { event.preventDefault(); applyLink() }
  else if (event.key === 'Escape') { event.preventDefault(); linkPopover.open = false; editor.view.value?.focus() }
}

function insertInlineMath() {
  const core = editor.getCoreCommands()
  if (!core) return
  editor.dispatch(core.insertMathInline(''))
  editor.editSelectedMath()
}

function applyMath() {
  const core = editor.getCoreCommands()
  if (core) editor.dispatch(core.updateMathAtSelection(mathPopover.latex), { focus: false })
}

function removeMath() {
  const core = editor.getCoreCommands()
  if (core) editor.dispatch(core.removeMathAtSelection)
  editor.closeMathPopover()
}

function onMathKeyDown(event: KeyboardEvent) {
  if (event.key === 'Escape') { event.preventDefault(); editor.closeMathPopover(); editor.view.value?.focus() }
}

function onDocumentMouseDown(event: MouseEvent) {
  const target = event.target as Node | null
  if (!target || !rootEl.value) return
  if (!rootEl.value.contains(target)) {
    linkPopover.open = false
    editor.closeMathPopover()
  }
}

watch(() => props.modelValue, (value) => {
  editor.syncModelValue(value)
})

onMounted(() => {
  editor.mount()
  document.addEventListener('mousedown', onDocumentMouseDown)
})

onBeforeUnmount(() => {
  document.removeEventListener('mousedown', onDocumentMouseDown)
  editor.destroy()
})
</script>

<template>
  <div ref="rootEl" class="nme-root">
    <div class="doc-editor nme-doc-editor">
      <div ref="mountEl" class="nme-mount" />
      <span v-if="isEmpty" class="nme-placeholder">{{ placeholder }}</span>
    </div>

    <Teleport to="body">
      <MiniEditorToolbar
        v-if="toolbar.visible && !linkPopover.open && !mathPopover.open"
        class="nme-floating"
        :style="{ top: `${toolbar.top}px`, left: `${toolbar.left}px` }"
        :active-marks="activeMarks"
        :link-active="activeMarks.has('link')"
        @command="onToolbarCommand"
        @highlight="applyHighlight"
        @link="openLinkPopover"
        @math-inline="insertInlineMath"
      />

      <div
        v-if="linkPopover.open"
        class="nme-popover nme-floating"
        :style="{ top: `${linkPopover.top}px`, left: `${linkPopover.left}px` }"
        @mousedown.stop
      >
        <input
          ref="linkInputEl"
          v-model="linkPopover.href"
          class="nme-popover-input"
          type="url"
          placeholder="https://…"
          @keydown="onLinkKeyDown"
        />
        <button class="nme-popover-btn" type="button" @click="applyLink">↵</button>
        <button class="nme-popover-btn" type="button" @click="removeLink">✕</button>
      </div>

      <div
        v-if="mathPopover.open"
        class="nme-popover nme-popover--math nme-floating"
        :style="{ top: `${mathPopover.top}px`, left: `${mathPopover.left}px` }"
        @mousedown.stop
      >
        <textarea
          v-model="mathPopover.latex"
          class="nme-popover-textarea"
          placeholder="\\sqrt{a^2 + b^2}"
          rows="2"
          @input="applyMath"
          @keydown="onMathKeyDown"
        />
        <button class="nme-popover-btn" type="button" @click="removeMath">✕</button>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.nme-root {
  position: relative;
  border: 1px solid var(--line-2, var(--border-subtle));
  border-radius: 10px;
  background: var(--glass-3, var(--surface-1));
  transition: border-color 0.12s;
}

.nme-root:focus-within { border-color: var(--accent); }

.nme-doc-editor {
  position: relative;
  padding: 10px 12px;
  max-height: 320px;
  overflow-y: auto;
  overscroll-behavior: contain;
}

/* Compact overrides for the shared editor-prose styling. */
.nme-doc-editor :deep(.nv-prosemirror) {
  min-height: 60px;
  font-size: 13.5px;
  line-height: 1.6;
}

.nme-placeholder {
  position: absolute;
  top: 10px;
  left: 12px;
  font-size: 13.5px;
  line-height: 1.6;
  color: var(--text-4, var(--text-muted));
  pointer-events: none;
  user-select: none;
}

/* Floating overlays are teleported to <body> and positioned in viewport space
   so they are never clipped by the card modal's scroll/overflow containers. */
.nme-floating {
  position: fixed;
  z-index: 1200;
  transform: translateX(-50%);
}

.nme-popover {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px;
  border-radius: 9px;
  border: 1px solid var(--line-2, var(--border-subtle));
  background: var(--glass-2, var(--surface-1));
  backdrop-filter: blur(18px) saturate(160%);
  box-shadow: 0 8px 28px -10px rgb(0 0 0 / 0.5);
}

.nme-popover-input {
  width: 180px;
  padding: 4px 8px;
  border: none;
  border-radius: 6px;
  background: var(--hover, var(--surface-2));
  color: var(--text-1, var(--text-primary));
  font-size: 12.5px;
  outline: none;
}

.nme-popover-textarea {
  width: 220px;
  padding: 6px 8px;
  border: none;
  border-radius: 6px;
  background: var(--hover, var(--surface-2));
  color: var(--text-1, var(--text-primary));
  font-family: var(--font-mono, monospace);
  font-size: 12px;
  resize: vertical;
  outline: none;
}

.nme-popover--math { align-items: flex-start; }

.nme-popover-btn {
  display: grid;
  place-items: center;
  width: 26px;
  height: 26px;
  flex-shrink: 0;
  border: none;
  border-radius: 6px;
  background: none;
  color: var(--text-3, var(--text-secondary));
  cursor: pointer;
  transition: background 0.1s, color 0.1s;
}

.nme-popover-btn:hover {
  background: var(--hover-strong, var(--surface-2));
  color: var(--text-1, var(--text-primary));
}
</style>
