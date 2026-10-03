<script setup lang="ts">
import { nextTick, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { Bold, CheckSquare, Code2, Italic, List, ListOrdered, Quote, Strikethrough, Underline } from 'lucide-vue-next'
import {
  normalizeCanvasRichText,
  type CanvasRichTextBlock,
  type CanvasRichTextBlockType,
  type CanvasRichTextDocument,
  type CanvasRichTextMark,
} from '../../../core/canvas'

const props = defineProps<{
  content: CanvasRichTextDocument
  style: Record<string, string>
  label: string
}>()

const emit = defineEmits<{
  commit: [content: CanvasRichTextDocument]
  cancel: []
}>()

const { t } = useI18n()
const editor = ref<HTMLDivElement | null>(null)

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function spanHtml(span: CanvasRichTextBlock['spans'][number]): string {
  let value = escapeHtml(span.text) || '<br>'
  for (const mark of span.marks ?? []) {
    const tag = mark === 'bold' ? 'strong' : mark === 'italic' ? 'em' : mark === 'underline' ? 'u' : mark === 'strike' ? 's' : 'code'
    value = `<${tag}>${value}</${tag}>`
  }
  return value
}

function blockHtml(block: CanvasRichTextBlock): string {
  const body = block.spans.map(spanHtml).join('')
  return `<div data-block-type="${block.type}" data-level="${block.level ?? 1}" data-checked="${block.checked === true}">${body}</div>`
}

function activeBlock(): HTMLElement | null {
  const selection = window.getSelection()
  const node = selection?.anchorNode
  const element = node instanceof HTMLElement ? node : node?.parentElement
  return element?.closest<HTMLElement>('[data-block-type]') ?? null
}

function runMark(command: string, value?: string) {
  editor.value?.focus()
  document.execCommand(command, false, value)
}

function setBlockType(type: CanvasRichTextBlockType) {
  const block = activeBlock()
  if (!block) return
  block.dataset.blockType = type
  if (type === 'heading' && !block.dataset.level) block.dataset.level = '2'
  editor.value?.focus()
}

function toggleTodo() {
  const block = activeBlock()
  if (!block) return
  block.dataset.blockType = 'todo'
  block.dataset.checked = block.dataset.checked === 'true' ? 'false' : 'true'
  editor.value?.focus()
}

function marksForElement(element: Element, marks: Set<CanvasRichTextMark>): Set<CanvasRichTextMark> {
  const next = new Set(marks)
  const tag = element.tagName.toLowerCase()
  if (tag === 'b' || tag === 'strong') next.add('bold')
  if (tag === 'i' || tag === 'em') next.add('italic')
  if (tag === 'u') next.add('underline')
  if (tag === 's' || tag === 'strike') next.add('strike')
  if (tag === 'code') next.add('code')
  if (tag === 'pre') next.add('code')
  return next
}

function readSpans(root: Node): CanvasRichTextBlock['spans'] {
  const spans: CanvasRichTextBlock['spans'] = []
  function visit(node: Node, marks: Set<CanvasRichTextMark>) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent ?? ''
      if (text) spans.push({ text, ...(marks.size ? { marks: [...marks] } : {}) })
      return
    }
    if (!(node instanceof Element)) return
    if (node.tagName.toLowerCase() === 'br') {
      spans.push({ text: '\n', ...(marks.size ? { marks: [...marks] } : {}) })
      return
    }
    const next = marksForElement(node, marks)
    node.childNodes.forEach(child => visit(child, next))
  }
  root.childNodes.forEach(child => visit(child, new Set()))
  return spans.length ? spans : [{ text: '' }]
}

function readContent(): CanvasRichTextDocument {
  const blocks = Array.from(editor.value?.children ?? []).map((element): CanvasRichTextBlock => {
    const type = (element as HTMLElement).dataset.blockType as CanvasRichTextBlockType || 'paragraph'
    const level = Number((element as HTMLElement).dataset.level)
    return {
      type,
      spans: readSpans(element),
      ...(type === 'heading' && [1, 2, 3].includes(level) ? { level: level as 1 | 2 | 3 } : {}),
      ...(type === 'todo' ? { checked: (element as HTMLElement).dataset.checked === 'true' } : {}),
    }
  })
  return normalizeCanvasRichText({ blocks })
}

function commit() {
  emit('commit', readContent())
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.preventDefault()
    emit('cancel')
    return
  }
  if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
    event.preventDefault()
    commit()
  }
}

onMounted(() => {
  if (editor.value) editor.value.innerHTML = normalizeCanvasRichText(props.content).blocks.map(blockHtml).join('')
  void nextTick(() => {
    editor.value?.focus()
    const selection = window.getSelection()
    selection?.selectAllChildren(editor.value!)
    selection?.collapseToEnd()
  })
})
</script>

<template>
  <div
    class="canvas-rich-editor tw:absolute tw:box-border tw:z-42 tw:border-2 tw:border-solid tw:border-accent tw:bg-[#fff8c5] tw:shadow-(--shadow-3)"
    :style="style"
    @pointerdown.stop
  >
    <div
      class="canvas-rich-editor__toolbar tw:absolute tw:bottom-[calc(100%+8px)] tw:left-0 tw:flex tw:gap-0.5 tw:min-h-9 tw:p-1 tw:rounded-[10px] tw:border tw:border-solid tw:border-(--border-subtle) tw:bg-surface-canvas tw:shadow-(--shadow-raised)"
      role="toolbar"
      :aria-label="label"
    >
      <button type="button" class="tw:grid tw:size-7 tw:place-items-center tw:p-0 tw:border-0 tw:rounded-[7px] tw:text-content-secondary tw:bg-transparent tw:hover:text-content-primary tw:hover:bg-(--hover-bg) tw:focus-visible:text-content-primary tw:focus-visible:bg-(--hover-bg) tw:max-[760px]:size-9" :aria-label="t('workspace.canvas.bold')" @mousedown.prevent="runMark('bold')"><Bold :size="15" /></button>
      <button type="button" class="tw:grid tw:size-7 tw:place-items-center tw:p-0 tw:border-0 tw:rounded-[7px] tw:text-content-secondary tw:bg-transparent tw:hover:text-content-primary tw:hover:bg-(--hover-bg) tw:focus-visible:text-content-primary tw:focus-visible:bg-(--hover-bg) tw:max-[760px]:size-9" :aria-label="t('workspace.canvas.italic')" @mousedown.prevent="runMark('italic')"><Italic :size="15" /></button>
      <button type="button" class="tw:grid tw:size-7 tw:place-items-center tw:p-0 tw:border-0 tw:rounded-[7px] tw:text-content-secondary tw:bg-transparent tw:hover:text-content-primary tw:hover:bg-(--hover-bg) tw:focus-visible:text-content-primary tw:focus-visible:bg-(--hover-bg) tw:max-[760px]:size-9" :aria-label="t('workspace.canvas.underline')" @mousedown.prevent="runMark('underline')"><Underline :size="15" /></button>
      <button type="button" class="tw:grid tw:size-7 tw:place-items-center tw:p-0 tw:border-0 tw:rounded-[7px] tw:text-content-secondary tw:bg-transparent tw:hover:text-content-primary tw:hover:bg-(--hover-bg) tw:focus-visible:text-content-primary tw:focus-visible:bg-(--hover-bg) tw:max-[760px]:size-9" :aria-label="t('workspace.canvas.strike')" @mousedown.prevent="runMark('strikeThrough')"><Strikethrough :size="15" /></button>
      <button type="button" class="tw:grid tw:size-7 tw:place-items-center tw:p-0 tw:border-0 tw:rounded-[7px] tw:text-content-secondary tw:bg-transparent tw:hover:text-content-primary tw:hover:bg-(--hover-bg) tw:focus-visible:text-content-primary tw:focus-visible:bg-(--hover-bg) tw:max-[760px]:size-9" :aria-label="t('workspace.canvas.code')" @mousedown.prevent="runMark('formatBlock', 'pre')"><Code2 :size="15" /></button>
      <span class="tw:w-px tw:my-1 tw:mx-0.5 tw:bg-(--border-subtle)" aria-hidden="true" />
      <button type="button" class="tw:grid tw:size-7 tw:place-items-center tw:p-0 tw:border-0 tw:rounded-[7px] tw:text-content-secondary tw:bg-transparent tw:hover:text-content-primary tw:hover:bg-(--hover-bg) tw:focus-visible:text-content-primary tw:focus-visible:bg-(--hover-bg) tw:max-[760px]:size-9" :aria-label="t('workspace.canvas.heading')" @mousedown.prevent="setBlockType('heading')">H</button>
      <button type="button" class="tw:grid tw:size-7 tw:place-items-center tw:p-0 tw:border-0 tw:rounded-[7px] tw:text-content-secondary tw:bg-transparent tw:hover:text-content-primary tw:hover:bg-(--hover-bg) tw:focus-visible:text-content-primary tw:focus-visible:bg-(--hover-bg) tw:max-[760px]:size-9" :aria-label="t('workspace.canvas.bulletList')" @mousedown.prevent="setBlockType('bullet')"><List :size="15" /></button>
      <button type="button" class="tw:grid tw:size-7 tw:place-items-center tw:p-0 tw:border-0 tw:rounded-[7px] tw:text-content-secondary tw:bg-transparent tw:hover:text-content-primary tw:hover:bg-(--hover-bg) tw:focus-visible:text-content-primary tw:focus-visible:bg-(--hover-bg) tw:max-[760px]:size-9" :aria-label="t('workspace.canvas.numberList')" @mousedown.prevent="setBlockType('number')"><ListOrdered :size="15" /></button>
      <button type="button" class="tw:grid tw:size-7 tw:place-items-center tw:p-0 tw:border-0 tw:rounded-[7px] tw:text-content-secondary tw:bg-transparent tw:hover:text-content-primary tw:hover:bg-(--hover-bg) tw:focus-visible:text-content-primary tw:focus-visible:bg-(--hover-bg) tw:max-[760px]:size-9" :aria-label="t('workspace.canvas.todo')" @mousedown.prevent="toggleTodo"><CheckSquare :size="15" /></button>
      <button type="button" class="tw:grid tw:size-7 tw:place-items-center tw:p-0 tw:border-0 tw:rounded-[7px] tw:text-content-secondary tw:bg-transparent tw:hover:text-content-primary tw:hover:bg-(--hover-bg) tw:focus-visible:text-content-primary tw:focus-visible:bg-(--hover-bg) tw:max-[760px]:size-9" :aria-label="t('workspace.canvas.quote')" @mousedown.prevent="setBlockType('quote')"><Quote :size="15" /></button>
    </div>
    <div
      ref="editor"
      class="canvas-rich-editor__surface tw:h-full tw:overflow-auto tw:text-[#2b2615] tw:leading-[1.45] tw:outline-none"
      contenteditable="true"
      role="textbox"
      aria-multiline="true"
      :aria-label="label"
      @keydown="onKeydown"
      @blur="commit"
    />
  </div>
</template>

<style scoped>
/* Scale-dependent sizing driven by the runtime `--canvas-rich-editor-scale`
 * variable (set from the canvas camera zoom); layout/color live in the
 * template above. */
.canvas-rich-editor {
  padding: calc(14px * var(--canvas-rich-editor-scale));
  border-radius: calc(14px * var(--canvas-rich-editor-scale));
}

.canvas-rich-editor__surface {
  font-size: calc(15px * var(--canvas-rich-editor-scale));
}

/* Generated by `blockHtml`/`onMounted` via `innerHTML`, not Vue-rendered
 * elements, so scoped attribute selectors cannot reach them without `:deep()`. */
.canvas-rich-editor__surface :deep([data-block-type='heading']) {
  font-size: 1.35em;
  font-weight: 700;
}

.canvas-rich-editor__surface :deep([data-block-type='bullet'])::before { content: '• '; }
.canvas-rich-editor__surface :deep([data-block-type='number'])::before { content: '1. '; }
.canvas-rich-editor__surface :deep([data-block-type='todo'][data-checked='false'])::before { content: '☐ '; }
.canvas-rich-editor__surface :deep([data-block-type='todo'][data-checked='true'])::before { content: '☑ '; }
.canvas-rich-editor__surface :deep([data-block-type='quote']) {
  padding-left: 10px;
  border-left: 3px solid #c3a329;
}
</style>
