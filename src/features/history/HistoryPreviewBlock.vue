<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { HistoryPreviewBlock } from '../../utils/noteHistoryPreview'
import { workspaceAssetUrl } from '../../utils/workspaceAssetUrl'
import HistoryPreviewInline from './HistoryPreviewInline.vue'

/**
 * Renders one node of the "As note" read-only preview tree (see
 * `buildHistoryPreview`). Recursive: list items, callouts, toggles, table
 * cells and checklists all nest further `HistoryPreviewBlock` instances.
 * Never mutates `block`, never runs plugin code, never renders an untrusted
 * URL as a live link or a remote image (see `resolvedImageSrc`).
 */
defineOptions({ name: 'HistoryPreviewBlock' })

interface Props {
  block: HistoryPreviewBlock
}

const props = defineProps<Props>()
const { t } = useI18n()

const PARAGRAPH_CLASS = 'tw:m-0 tw:whitespace-pre-wrap tw:wrap-anywhere tw:leading-[1.55] tw:font-normal tw:text-content-secondary tw:[font-family:var(--font-serif)] tw:text-xl tw:max-[719px]:text-[17px]'
const HEADING_CLASS = 'tw:m-0 tw:whitespace-pre-wrap tw:wrap-anywhere tw:[font-family:var(--font-serif)] tw:text-[clamp(28px,2.4vw,38px)] tw:leading-[1.15] tw:font-semibold tw:tracking-[-0.015em] tw:text-content-primary tw:max-[719px]:text-[27px]'
const QUOTE_CLASS = 'tw:m-0 tw:whitespace-pre-wrap tw:wrap-anywhere tw:border-l-2 tw:border-l-(--accent-line) tw:pl-5 tw:[font-family:var(--font-serif)] tw:text-[22px] tw:leading-[1.55] tw:font-normal tw:text-content-secondary tw:max-[719px]:text-lg'
const CODE_CLASS = 'tw:m-0 tw:overflow-x-auto tw:whitespace-pre-wrap tw:wrap-anywhere tw:rounded-nv-sm tw:border tw:border-solid tw:border-transparent tw:bg-(--hover) tw:px-4 tw:py-3.5 tw:font-nv-mono tw:text-[12.5px] tw:leading-[1.55] tw:text-content-secondary'

const headingTag = computed(() => (props.block.kind === 'heading' ? `h${props.block.level}` : 'p'))

// Only a `data:image/…` value or a workspace-relative path (no scheme) ever
// reaches here as `src` — see buildHistoryPreview's image rules — but
// workspaceAssetUrl still validates the path shape and can throw, so a
// malformed one falls back to the external placeholder instead of crashing.
const resolvedImageSrc = computed(() => {
  if (props.block.kind !== 'image' || props.block.external || !props.block.src) return null
  const src = props.block.src
  if (src.startsWith('data:image/')) return src
  try {
    return workspaceAssetUrl(src)
  } catch {
    return null
  }
})
</script>

<template>
  <p v-if="block.kind === 'paragraph'" class="history-preview-block history-preview-block--paragraph" :class="PARAGRAPH_CLASS">
    <HistoryPreviewInline :runs="block.runs" />
  </p>

  <component :is="headingTag" v-else-if="block.kind === 'heading'" class="history-preview-block history-preview-block--heading" :class="HEADING_CLASS">
    <HistoryPreviewInline :runs="block.runs" />
  </component>

  <blockquote v-else-if="block.kind === 'quote'" class="history-preview-block history-preview-block--quote tw:flex tw:flex-col tw:gap-2" :class="QUOTE_CLASS">
    <HistoryPreviewBlock v-for="(child, index) in block.children" :key="index" :block="child" />
  </blockquote>

  <pre v-else-if="block.kind === 'code'" class="history-preview-block history-preview-block--code" :class="CODE_CLASS"><code>{{ block.text }}</code></pre>

  <component
    :is="block.kind === 'list' && block.ordered ? 'ol' : 'ul'"
    v-else-if="block.kind === 'list'"
    class="history-preview-block history-preview-block--list tw:m-0 tw:flex tw:flex-col tw:gap-1.5 tw:pl-6 tw:[font-family:var(--font-serif)] tw:text-xl tw:text-content-secondary tw:max-[719px]:text-[17px]"
    :class="block.ordered ? 'tw:list-decimal' : 'tw:list-disc'"
  >
    <li v-for="(item, itemIndex) in block.items" :key="itemIndex" class="tw:pl-1">
      <div class="tw:flex tw:flex-col tw:gap-1.5">
        <HistoryPreviewBlock v-for="(child, childIndex) in item" :key="childIndex" :block="child" />
      </div>
    </li>
  </component>

  <div v-else-if="block.kind === 'checklist'" class="history-preview-block history-preview-block--checklist tw:flex tw:items-start tw:gap-2">
    <input
      type="checkbox"
      disabled
      :checked="block.checked"
      class="tw:mt-2 tw:shrink-0"
      :aria-label="t('workspace.history.preview.checklistItem')"
    >
    <div class="tw:min-w-0 tw:flex-1 tw:flex tw:flex-col tw:gap-1.5">
      <HistoryPreviewBlock v-for="(child, index) in block.children" :key="index" :block="child" />
    </div>
  </div>

  <div v-else-if="block.kind === 'callout'" class="history-preview-block history-preview-block--callout tw:flex tw:gap-2.5 tw:rounded-nv-sm tw:border tw:border-solid tw:border-(--border-subtle) tw:bg-surface-subtle tw:px-4 tw:py-3">
    <span v-if="block.icon" aria-hidden="true" class="tw:shrink-0">{{ block.icon }}</span>
    <div class="tw:min-w-0 tw:flex-1 tw:flex tw:flex-col tw:gap-1.5">
      <HistoryPreviewBlock v-for="(child, index) in block.children" :key="index" :block="child" />
    </div>
  </div>

  <div v-else-if="block.kind === 'toggle'" class="history-preview-block history-preview-block--toggle tw:flex tw:flex-col tw:gap-1.5">
    <div class="tw:flex tw:items-center tw:gap-1.5 tw:font-medium tw:text-content-primary">
      <span aria-hidden="true">▸</span>
      <HistoryPreviewInline :runs="block.title" />
    </div>
    <div class="tw:flex tw:flex-col tw:gap-1.5 tw:pl-5">
      <HistoryPreviewBlock v-for="(child, index) in block.children" :key="index" :block="child" />
    </div>
  </div>

  <table v-else-if="block.kind === 'table'" class="history-preview-block history-preview-block--table tw:w-full tw:border-collapse tw:text-sm">
    <tbody>
      <tr v-for="(row, rowIndex) in block.rows" :key="rowIndex">
        <component
          :is="cell.header ? 'th' : 'td'"
          v-for="(cell, cellIndex) in row"
          :key="cellIndex"
          :scope="cell.header ? 'col' : undefined"
          class="tw:border tw:border-solid tw:border-(--border-subtle) tw:px-2.5 tw:py-1.5 tw:text-left tw:align-top"
          :class="cell.header ? 'tw:font-semibold tw:text-content-primary' : 'tw:text-content-secondary'"
        >
          <HistoryPreviewBlock v-for="(child, childIndex) in cell.blocks" :key="childIndex" :block="child" />
        </component>
      </tr>
    </tbody>
  </table>

  <figure v-else-if="block.kind === 'image'" class="history-preview-block history-preview-block--image tw:m-0 tw:flex tw:flex-col tw:gap-1.5">
    <img v-if="resolvedImageSrc" :src="resolvedImageSrc" :alt="block.alt" loading="lazy" class="tw:max-w-full tw:rounded-nv-sm">
    <div v-else-if="block.external" class="history-preview-block__image-placeholder tw:rounded-nv-sm tw:border tw:border-dashed tw:border-(--border-subtle) tw:px-3 tw:py-2.5 tw:text-xs tw:text-content-muted">
      <p class="tw:m-0">{{ t('workspace.history.preview.externalImage') }}</p>
      <p v-if="block.externalUrl" class="tw:m-0 tw:mt-1 tw:wrap-anywhere">{{ block.externalUrl }}</p>
    </div>
    <figcaption v-if="block.caption" class="tw:text-xs tw:text-content-muted">{{ block.caption }}</figcaption>
  </figure>

  <hr v-else-if="block.kind === 'divider'" class="history-preview-block history-preview-block--divider tw:my-2 tw:border-0 tw:border-t tw:border-solid tw:border-(--border-subtle)">

  <div v-else-if="block.kind === 'math'" class="history-preview-block history-preview-block--math tw:rounded-nv-sm tw:bg-(--hover) tw:px-4 tw:py-3 tw:font-nv-mono tw:text-[12.5px] tw:whitespace-pre-wrap tw:wrap-anywhere tw:text-content-secondary">
    {{ block.latex }}
  </div>

  <div v-else-if="block.kind === 'unsupported'" class="history-preview-block history-preview-block--unsupported tw:rounded-nv-sm tw:border tw:border-dashed tw:border-(--border-subtle) tw:px-3 tw:py-2.5 tw:text-xs tw:text-content-muted">
    <p class="tw:m-0 tw:font-medium">{{ t('workspace.history.preview.unsupported', { type: block.type }) }}</p>
    <p v-if="block.text" class="tw:m-0 tw:mt-1 tw:whitespace-pre-wrap tw:wrap-anywhere">{{ block.text }}</p>
  </div>
</template>
