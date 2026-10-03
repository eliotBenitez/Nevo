<script setup lang="ts">
import { h } from 'vue'
import type { VNode, VNodeChild } from 'vue'
import type { HistoryInlineMark, HistoryInlineRun } from '../../utils/noteHistoryPreview'

/**
 * Renders a run of inline marks as real nested elements (`<strong>`, `<em>`,
 * …) built with `h()` — never `v-html` — so a preview can't execute pasted
 * markup. `link` never becomes a live `<a>`: its text renders plainly with a
 * muted "(href)" suffix.
 */
interface Props {
  runs: HistoryInlineRun[]
}

defineProps<Props>()

const MARK_TAGS: Record<Exclude<HistoryInlineMark, 'link'>, string> = {
  strong: 'strong',
  em: 'em',
  code: 'code',
  strike: 's',
  underline: 'u',
  highlight: 'mark',
  superscript: 'sup',
  subscript: 'sub',
}

function wrapMarks(marks: HistoryInlineMark[], child: VNodeChild): VNodeChild {
  return marks.reduceRight<VNodeChild>((acc, mark) => {
    if (mark === 'link') return acc
    return h(MARK_TAGS[mark], {}, [acc])
  }, child)
}

function renderRun(run: HistoryInlineRun): VNode {
  if (run.kind === 'break') return h('br')
  if (run.kind === 'math' || run.kind === 'atom') {
    return h('span', { class: 'history-preview-inline__atom tw:font-nv-mono tw:text-[0.92em] tw:text-content-muted' }, run.text)
  }

  const wrapped = wrapMarks(run.marks, run.text)
  if (!run.marks.includes('link')) return h('span', {}, [wrapped])
  return h('span', { class: 'history-preview-inline__link tw:underline' }, [
    wrapped,
    run.href ? h('span', { class: 'history-preview-inline__href tw:ml-1 tw:text-[0.9em] tw:text-content-muted' }, `(${run.href})`) : null,
  ])
}

// A plain functional component, not a wrapping tag — lets each run's own
// mark nesting be built with h() while the run *list* stays template-driven.
const RunView = (props: { run: HistoryInlineRun }) => renderRun(props.run)
</script>

<template>
  <span class="history-preview-inline">
    <RunView v-for="(run, index) in runs" :key="index" :run="run" />
  </span>
</template>
