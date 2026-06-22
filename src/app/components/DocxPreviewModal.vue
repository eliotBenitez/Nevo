<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { FileDown, Minus, Plus, RectangleHorizontal, RectangleVertical, X } from 'lucide-vue-next'
import type { NoteDocument } from '../../types/note'
import { useFocusTrap } from '../../ui/composables/useFocusTrap'
import { configCommands } from '../../tauri/commands'
import {
  DEFAULT_DOCX_OPTIONS,
  type DocxExportOptions,
  type DocxOrientation,
  type DocxPaperFormat,
} from '../../utils/noteExport/docxOptions'
import DocxPreviewNode from './DocxPreviewNode.vue'

interface Props {
  note: NoteDocument
  workspacePath: string
}

const props = defineProps<Props>()
const emit = defineEmits<{
  close: []
  save: [options: DocxExportOptions]
}>()

const { t } = useI18n()
const dialogRef = ref<HTMLElement | null>(null)
const open = ref(true)
const { activate, deactivate } = useFocusTrap(dialogRef, open)
watch(open, (value) => { if (value) nextTick(activate); else deactivate() }, { immediate: true })

const paperFormat = ref<DocxPaperFormat>(DEFAULT_DOCX_OPTIONS.paperFormat)
const orientation = ref<DocxOrientation>(DEFAULT_DOCX_OPTIONS.orientation)
const fontSize = ref(DEFAULT_DOCX_OPTIONS.fontSize)
const fontFamily = ref<string>(DEFAULT_DOCX_OPTIONS.fontFamily)
const systemFonts = ref<string[]>([])
const marginTop = ref(DEFAULT_DOCX_OPTIONS.marginTop)
const marginRight = ref(DEFAULT_DOCX_OPTIONS.marginRight)
const marginBottom = ref(DEFAULT_DOCX_OPTIONS.marginBottom)
const marginLeft = ref(DEFAULT_DOCX_OPTIONS.marginLeft)
const lineSpacing = ref(DEFAULT_DOCX_OPTIONS.lineSpacing)
const paragraphSpacing = ref(DEFAULT_DOCX_OPTIONS.paragraphSpacing)
const pageNumbers = ref(DEFAULT_DOCX_OPTIONS.pageNumbers)
const headingNumbers = ref(DEFAULT_DOCX_OPTIONS.headingNumbers)
const tableOfContents = ref(DEFAULT_DOCX_OPTIONS.tableOfContents)
const titlePage = ref(DEFAULT_DOCX_OPTIONS.titlePage)
const runningHeader = ref(DEFAULT_DOCX_OPTIONS.runningHeader)
const exportNoteTitle = ref(DEFAULT_DOCX_OPTIONS.exportNoteTitle)
const zoom = ref(100)
const fitWidth = ref(true)
const saving = ref(false)
const error = ref<string | null>(null)

const documentToggles = [
  { key: 'toc', label: 'export.tableOfContents', model: tableOfContents },
  { key: 'headings', label: 'export.headingNumbers', model: headingNumbers },
  { key: 'title', label: 'export.titlePage', model: titlePage },
  { key: 'header', label: 'export.runningHeader', model: runningHeader },
  { key: 'pageNumbers', label: 'export.pageNumbers', model: pageNumbers },
  { key: 'exportNoteTitle', label: 'export.exportNoteTitle', model: exportNoteTitle },
]

const options = computed<DocxExportOptions>(() => ({
  paperFormat: paperFormat.value,
  orientation: orientation.value,
  fontSize: fontSize.value,
  fontFamily: fontFamily.value,
  marginTop: marginTop.value,
  marginRight: marginRight.value,
  marginBottom: marginBottom.value,
  marginLeft: marginLeft.value,
  lineSpacing: lineSpacing.value,
  paragraphSpacing: paragraphSpacing.value,
  pageNumbers: pageNumbers.value,
  headingNumbers: headingNumbers.value,
  tableOfContents: tableOfContents.value,
  titlePage: titlePage.value,
  runningHeader: runningHeader.value,
  exportNoteTitle: exportNoteTitle.value,
}))

const paperWidthMm = computed(() => {
  const isLetter = paperFormat.value === 'Letter'
  const isLandscape = orientation.value === 'landscape'
  if (isLetter) {
    return isLandscape ? 279.4 : 215.9
  } else {
    return isLandscape ? 297 : 210
  }
})

const paperHeightMm = computed(() => {
  const isLetter = paperFormat.value === 'Letter'
  const isLandscape = orientation.value === 'landscape'
  if (isLetter) {
    return isLandscape ? 215.9 : 279.4
  } else {
    return isLandscape ? 210 : 297
  }
})

const surfaceRef = ref<HTMLElement | null>(null)
const surfaceWidth = ref(800)
const hiddenContainerRef = ref<HTMLElement | null>(null)

interface ContentPage {
  nodes: ProcessedNode[]
  hasTitle?: boolean
}
const contentPages = ref<ContentPage[]>([])

const pageStyleWidthPx = computed(() => {
  if (fitWidth.value) {
    return Math.max(100, surfaceWidth.value - 40)
  } else {
    let canonicalWidth = 480
    if (paperFormat.value === 'Letter') {
      canonicalWidth = orientation.value === 'landscape' ? 634 : 490
    } else {
      canonicalWidth = orientation.value === 'landscape' ? 678 : 480
    }
    return canonicalWidth * (zoom.value / 100)
  }
})

const pageHeightPx = computed(() => {
  return (pageStyleWidthPx.value * paperHeightMm.value) / paperWidthMm.value
})

const pageScale = computed(() => {
  let canonicalWidth = 480
  if (paperFormat.value === 'Letter') {
    canonicalWidth = orientation.value === 'landscape' ? 634 : 490
  } else {
    canonicalWidth = orientation.value === 'landscape' ? 678 : 480
  }
  return pageStyleWidthPx.value / canonicalWidth
})

const paddingTopPx = computed(() => {
  return (marginTop.value / paperWidthMm.value) * pageStyleWidthPx.value
})

const paddingRightPx = computed(() => {
  return (marginRight.value / paperWidthMm.value) * pageStyleWidthPx.value
})

const paddingBottomPx = computed(() => {
  return (marginBottom.value / paperWidthMm.value) * pageStyleWidthPx.value
})

const paddingLeftPx = computed(() => {
  return (marginLeft.value / paperWidthMm.value) * pageStyleWidthPx.value
})

const usableHeightPx = computed(() => {
  return pageHeightPx.value - paddingTopPx.value - paddingBottomPx.value - 8
})

// Live preview CSS styling based on selected options
const pageStyle = computed(() => {
  const styles: Record<string, string> = {}
  
  styles.width = `${pageStyleWidthPx.value}px`
  styles.height = `${pageHeightPx.value}px`
  styles.overflow = 'hidden'

  // Map variables
  styles['--docx-font-family'] = fontFamily.value ? `'${fontFamily.value}', sans-serif` : 'var(--font-ui)'
  styles['--docx-font-size'] = `${fontSize.value * pageScale.value}px`
  
  // Margins in absolute px on screen (prevents browser percentage rendering bugs)
  styles['--docx-padding-top'] = `${paddingTopPx.value}px`
  styles['--docx-padding-right'] = `${paddingRightPx.value}px`
  styles['--docx-padding-bottom'] = `${paddingBottomPx.value}px`
  styles['--docx-padding-left'] = `${paddingLeftPx.value}px`

  styles['--docx-line-height'] = String(lineSpacing.value)
  styles['--docx-paragraph-spacing'] = `${paragraphSpacing.value * pageScale.value}pt`

  return styles
})

interface PreviewPage {
  id: string
  type: 'title' | 'toc' | 'content'
  pageNumber: number
  contentPageIndex?: number
}

const pages = computed<PreviewPage[]>(() => {
  const list: PreviewPage[] = []
  let currentPage = 1
  
  if (exportNoteTitle.value && titlePage.value) {
    list.push({
      id: 'title',
      type: 'title',
      pageNumber: currentPage++
    })
  }
  
  if (tableOfContents.value) {
    list.push({
      id: 'toc',
      type: 'toc',
      pageNumber: currentPage++
    })
  }
  
  if (contentPages.value.length === 0) {
    list.push({
      id: 'content-fallback',
      type: 'content',
      pageNumber: currentPage++,
      contentPageIndex: undefined
    })
  } else {
    contentPages.value.forEach((_page, index) => {
      list.push({
        id: `content-${index}`,
        type: 'content',
        pageNumber: currentPage++,
        contentPageIndex: index
      })
    })
  }
  
  return list
})

interface ProcessedNode {
  type: string
  text?: string
  attrs?: any
  marks?: any[]
  content?: ProcessedNode[]
  headingPrefix?: string
}

function processNodes(node: any, headingCounters: number[], headingNumbers: boolean): ProcessedNode {
  const result: ProcessedNode = {
    type: node.type,
    text: node.text,
    attrs: node.attrs,
    marks: node.marks,
  }

  if (node.type === 'heading' && headingNumbers) {
    const level = Math.min(6, Math.max(1, Number(node.attrs?.level ?? 1)))
    headingCounters[level - 1]++
    for (let i = level; i < 6; i++) {
      headingCounters[i] = 0
    }
    const segments = headingCounters.slice(0, level)
    while (segments.length > 1 && segments[0] === 0) segments.shift()
    result.headingPrefix = segments.join('.') + '. '
  }

  if (node.content) {
    result.content = node.content.map((child: any) => processNodes(child, headingCounters, headingNumbers))
  }

  return result
}

const processedContent = computed<ProcessedNode | null>(() => {
  if (!props.note.content) return null
  const counters = [0, 0, 0, 0, 0, 0]
  return processNodes(props.note.content, counters, headingNumbers.value)
})

function prepareNodesForPagination(nodes: ProcessedNode[]): ProcessedNode[] {
  const result: ProcessedNode[] = []
  
  for (const node of nodes) {
    if ((node.type === 'bullet_list' || node.type === 'ordered_list') && node.content) {
      let itemIndex = 1
      for (const item of node.content) {
        if (item.type === 'list_item') {
          result.push({
            type: node.type,
            attrs: {
              ...node.attrs,
              start: itemIndex++
            },
            headingPrefix: node.headingPrefix,
            content: [item]
          })
        } else {
          result.push(item)
        }
      }
    } else {
      result.push(node)
    }
  }
  
  return result
}

const paginatedContentNodes = computed<ProcessedNode[]>(() => {
  if (!processedContent.value || !processedContent.value.content) return []
  return prepareNodesForPagination(processedContent.value.content)
})

async function updatePagination() {
  await nextTick()
  if (typeof window !== 'undefined' && !window.navigator.userAgent.includes('jsdom')) {
    await new Promise(resolve => setTimeout(resolve, 50))
  }
  
  if (!hiddenContainerRef.value) {
    contentPages.value = [{
      nodes: paginatedContentNodes.value
    }]
    return
  }
  
  const contentContainer = hiddenContainerRef.value.querySelector('.docx-page__content')
  if (!contentContainer) {
    contentPages.value = [{
      nodes: paginatedContentNodes.value
    }]
    return
  }
  
  const children = contentContainer.querySelectorAll('.docx-preview-node-wrapper')
  if (children.length === 0) {
    contentPages.value = []
    return
  }
  
  const pagesList: ContentPage[] = []
  let currentPageNodes: ProcessedNode[] = []
  let currentPageHeight = 0
  let prevMarginBottom = 0
  
  const limit = usableHeightPx.value
  const nodes = paginatedContentNodes.value
  
  let titleHeight = 0
  if (exportNoteTitle.value && !titlePage.value) {
    const titleWrapper = contentContainer.querySelector('.docx-page__content-title-wrapper')
    if (titleWrapper) {
      const style = window.getComputedStyle(titleWrapper)
      const marginTop = parseFloat(style.marginTop) || 0
      const marginBottom = parseFloat(style.marginBottom) || 0
      titleHeight = titleWrapper.getBoundingClientRect().height + marginTop
      prevMarginBottom = marginBottom
    }
  }
  
  currentPageHeight += titleHeight
  
  for (let i = 0; i < children.length; i++) {
    const child = children[i] as HTMLElement
    const node = nodes[i]
    if (!node) continue
    
    const style = window.getComputedStyle(child)
    const marginTop = parseFloat(style.marginTop) || 0
    const marginBottom = parseFloat(style.marginBottom) || 0
    
    const childHeight = child.getBoundingClientRect().height
    
    // Collapsed margin calculation
    const collapsedMargin = Math.max(prevMarginBottom, marginTop)
    const totalHeightContribution = childHeight + (currentPageHeight > 0 ? collapsedMargin : marginTop)
    
    if (currentPageNodes.length > 0 && currentPageHeight + totalHeightContribution > limit) {
      pagesList.push({
        nodes: currentPageNodes,
        hasTitle: pagesList.length === 0 && exportNoteTitle.value && !titlePage.value
      })
      currentPageNodes = [node]
      currentPageHeight = childHeight + marginTop
      prevMarginBottom = marginBottom
    } else {
      currentPageNodes.push(node)
      currentPageHeight += totalHeightContribution
      prevMarginBottom = marginBottom
    }
  }
  
  if (currentPageNodes.length > 0) {
    pagesList.push({
      nodes: currentPageNodes,
      hasTitle: pagesList.length === 0 && exportNoteTitle.value && !titlePage.value
    })
  }
  
  contentPages.value = pagesList
}

watch(
  [
    paginatedContentNodes,
    paperFormat,
    orientation,
    fontSize,
    fontFamily,
    marginTop,
    marginRight,
    marginBottom,
    marginLeft,
    lineSpacing,
    paragraphSpacing,
    exportNoteTitle,
    titlePage,
    pageStyleWidthPx,
  ],
  () => {
    void updatePagination()
  },
  { immediate: true }
)

async function onSave() {
  if (saving.value) return
  error.value = null
  saving.value = true
  try {
    emit('save', options.value)
  } catch {
    error.value = t('export.docxSaveError')
  } finally {
    saving.value = false
  }
}

function onWindowKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.preventDefault()
    event.stopPropagation()
    emit('close')
  }
}

let resizeObserver: ResizeObserver | null = null

onMounted(async () => {
  window.addEventListener('keydown', onWindowKeydown, true)
  
  if (surfaceRef.value && typeof window.ResizeObserver !== 'undefined') {
    resizeObserver = new window.ResizeObserver((entries) => {
      for (const entry of entries) {
        surfaceWidth.value = entry.contentRect.width
      }
    })
    resizeObserver.observe(surfaceRef.value)
  }

  try {
    const fonts = await configCommands.listSystemFonts()
    systemFonts.value = [...new Set(fonts)].sort((a, b) => a.localeCompare(b))
  } catch {
    systemFonts.value = []
  }
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onWindowKeydown, true)
  if (resizeObserver) {
    resizeObserver.disconnect()
  }
  open.value = false
})
</script>

<template>
  <Teleport to="body">
    <div class="docx-backdrop" @click.self="emit('close')" @keydown.esc="emit('close')">
      <section
        ref="dialogRef"
        class="docx-modal"
        role="dialog"
        aria-modal="true"
        :aria-label="t('export.formatDocxModalTitle')"
      >
        <div class="docx-modal__titlebar">
          <span>{{ t('export.formatDocxModalTitle') }}</span>
          <button type="button" class="docx-modal__close" :aria-label="t('workspace.context.cancel')" @click="emit('close')">
            <X :size="15" />
          </button>
        </div>

        <div class="docx-modal__shell">
          <aside class="docx-settings">
            <div class="docx-settings__header">
              <h2>{{ note.title }}</h2>
            </div>

            <section class="docx-group">
              <span class="docx-group__title">{{ t('export.sections.page') }}</span>

              <div class="docx-field docx-field--row">
                <span class="docx-field__label">{{ t('export.pageSize') }}</span>
                <div class="docx-segment">
                  <button
                    v-for="fmt in (['A4', 'Letter'] as DocxPaperFormat[])"
                    :key="fmt"
                    type="button"
                    class="docx-segment__btn"
                    :class="{ 'docx-segment__btn--active': paperFormat === fmt }"
                    @click="paperFormat = fmt"
                  ><span class="docx-segment__btn-text">{{ fmt }}</span></button>
                </div>
              </div>

              <div class="docx-field docx-field--row">
                <span class="docx-field__label">{{ t('export.orientation') }}</span>
                <div class="docx-segment">
                  <button
                    type="button"
                    class="docx-segment__btn docx-segment__btn--icon"
                    :class="{ 'docx-segment__btn--active': orientation === 'portrait' }"
                    :aria-label="t('export.portrait')"
                    @click="orientation = 'portrait'"
                  >
                    <RectangleVertical :size="14" />
                  </button>
                  <button
                    type="button"
                    class="docx-segment__btn docx-segment__btn--icon"
                    :class="{ 'docx-segment__btn--active': orientation === 'landscape' }"
                    :aria-label="t('export.landscape')"
                    @click="orientation = 'landscape'"
                  >
                    <RectangleHorizontal :size="14" />
                  </button>
                </div>
              </div>

              <div class="docx-field">
                <span class="docx-field__label">{{ t('export.margins') }}</span>
                <div class="docx-margins-grid">
                  <div class="docx-field docx-field--row">
                    <span class="docx-field__label">{{ t('export.marginTop') }}</span>
                    <div class="docx-stepper">
                      <button type="button" class="docx-stepper__btn" :disabled="marginTop <= 0" @click="marginTop = Math.max(0, marginTop - 1)">
                        <Minus :size="12" />
                      </button>
                      <span class="docx-stepper__value">{{ marginTop }} мм</span>
                      <button type="button" class="docx-stepper__btn" @click="marginTop++">
                        <Plus :size="12" />
                      </button>
                    </div>
                  </div>
                  <div class="docx-field docx-field--row">
                    <span class="docx-field__label">{{ t('export.marginRight') }}</span>
                    <div class="docx-stepper">
                      <button type="button" class="docx-stepper__btn" :disabled="marginRight <= 0" @click="marginRight = Math.max(0, marginRight - 1)">
                        <Minus :size="12" />
                      </button>
                      <span class="docx-stepper__value">{{ marginRight }} мм</span>
                      <button type="button" class="docx-stepper__btn" @click="marginRight++">
                        <Plus :size="12" />
                      </button>
                    </div>
                  </div>
                  <div class="docx-field docx-field--row">
                    <span class="docx-field__label">{{ t('export.marginBottom') }}</span>
                    <div class="docx-stepper">
                      <button type="button" class="docx-stepper__btn" :disabled="marginBottom <= 0" @click="marginBottom = Math.max(0, marginBottom - 1)">
                        <Minus :size="12" />
                      </button>
                      <span class="docx-stepper__value">{{ marginBottom }} мм</span>
                      <button type="button" class="docx-stepper__btn" @click="marginBottom++">
                        <Plus :size="12" />
                      </button>
                    </div>
                  </div>
                  <div class="docx-field docx-field--row">
                    <span class="docx-field__label">{{ t('export.marginLeft') }}</span>
                    <div class="docx-stepper">
                      <button type="button" class="docx-stepper__btn" :disabled="marginLeft <= 0" @click="marginLeft = Math.max(0, marginLeft - 1)">
                        <Minus :size="12" />
                      </button>
                      <span class="docx-stepper__value">{{ marginLeft }} мм</span>
                      <button type="button" class="docx-stepper__btn" @click="marginLeft++">
                        <Plus :size="12" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            <section class="docx-group">
              <span class="docx-group__title">{{ t('export.sections.typography') }}</span>

              <div class="docx-field">
                <span class="docx-field__label">{{ t('export.fontFamily') }}</span>
                <div class="docx-select-wrap">
                  <select v-model="fontFamily" class="docx-select">
                    <option value="">{{ t('export.fontDefault') }} (Calibri)</option>
                    <option v-for="f in systemFonts" :key="f" :value="f">{{ f }}</option>
                  </select>
                </div>
              </div>

              <div class="docx-field docx-field--row">
                <span class="docx-field__label">{{ t('export.fontSize') }}</span>
                <div class="docx-stepper">
                  <button type="button" class="docx-stepper__btn" :disabled="fontSize <= 9" @click="fontSize = Math.max(9, fontSize - 1)">
                    <Minus :size="12" />
                  </button>
                  <span class="docx-stepper__value">{{ fontSize }}pt</span>
                  <button type="button" class="docx-stepper__btn" :disabled="fontSize >= 16" @click="fontSize = Math.min(16, fontSize + 1)">
                    <Plus :size="12" />
                  </button>
                </div>
              </div>

              <div class="docx-field docx-field--row">
                <span class="docx-field__label">{{ t('export.lineSpacing') }}</span>
                <div class="docx-stepper">
                  <button type="button" class="docx-stepper__btn" :disabled="lineSpacing <= 0.5" @click="lineSpacing = Math.max(0.5, parseFloat((lineSpacing - 0.05).toFixed(2)))">
                    <Minus :size="12" />
                  </button>
                  <span class="docx-stepper__value">{{ lineSpacing.toFixed(2) }}</span>
                  <button type="button" class="docx-stepper__btn" :disabled="lineSpacing >= 3.0" @click="lineSpacing = Math.min(3.0, parseFloat((lineSpacing + 0.05).toFixed(2)))">
                    <Plus :size="12" />
                  </button>
                </div>
              </div>

              <div class="docx-field docx-field--row">
                <span class="docx-field__label">{{ t('export.paragraphSpacing') }}</span>
                <div class="docx-stepper">
                  <button type="button" class="docx-stepper__btn" :disabled="paragraphSpacing <= 0" @click="paragraphSpacing = Math.max(0, paragraphSpacing - 1)">
                    <Minus :size="12" />
                  </button>
                  <span class="docx-stepper__value">{{ paragraphSpacing }} pt</span>
                  <button type="button" class="docx-stepper__btn" :disabled="paragraphSpacing >= 48" @click="paragraphSpacing = Math.min(48, paragraphSpacing + 1)">
                    <Plus :size="12" />
                  </button>
                </div>
              </div>
            </section>

            <section class="docx-group">
              <span class="docx-group__title">{{ t('export.sections.document') }}</span>

              <label
                v-for="toggle in documentToggles"
                :key="toggle.key"
                class="docx-toggle"
                :class="{ 'docx-toggle--active': toggle.model.value }"
              >
                <span class="docx-toggle__label">{{ t(toggle.label) }}</span>
                <span class="toggle">
                  <input v-model="toggle.model.value" type="checkbox" />
                  <span class="toggle-ui" />
                </span>
              </label>
            </section>

            <section class="docx-group">
              <span class="docx-group__title">{{ t('export.sections.preview') }}</span>

              <div class="docx-field docx-field--row">
                <span class="docx-field__label">{{ t('export.previewZoom') }}</span>
                <div class="docx-stepper">
                  <button type="button" class="docx-stepper__btn" :disabled="zoom <= 50 || fitWidth" @click="zoom = Math.max(50, zoom - 10)">
                    <Minus :size="12" />
                  </button>
                  <span class="docx-stepper__value">{{ zoom }}%</span>
                  <button type="button" class="docx-stepper__btn" :disabled="zoom >= 150 || fitWidth" @click="zoom = Math.min(150, zoom + 10)">
                    <Plus :size="12" />
                  </button>
                </div>
              </div>

              <label class="docx-toggle" :class="{ 'docx-toggle--active': fitWidth }">
                <span class="docx-toggle__label">{{ t('export.fitWidth') }}</span>
                <span class="toggle">
                  <input v-model="fitWidth" type="checkbox" />
                  <span class="toggle-ui" />
                </span>
              </label>
            </section>
          </aside>

          <main class="docx-preview">
            <!-- Hidden container for page height measurement -->
            <div
              ref="hiddenContainerRef"
              class="docx-page docx-page--hidden"
              :style="{
                ...pageStyle,
                position: 'absolute',
                left: '-9999px',
                top: '-9999px',
                visibility: 'hidden',
                height: 'auto',
                minHeight: '0',
                transition: 'none'
              }"
              :class="[paperFormat, orientation]"
            >
              <div class="docx-page__body">
                <div class="docx-page__content">
                  <div v-if="exportNoteTitle && !titlePage" class="docx-page__content-title-wrapper">
                    <h1 class="docx-page__title-inline">{{ note.icon }} {{ note.title || 'Untitled' }}</h1>
                  </div>
                  <div
                    v-for="(node, idx) in paginatedContentNodes"
                    :key="idx"
                    class="docx-preview-node-wrapper"
                  >
                    <DocxPreviewNode :node="node" />
                  </div>
                </div>
              </div>
            </div>

            <div ref="surfaceRef" class="docx-preview__surface">
              <!-- Live Sheets Simulation -->
              <div
                v-for="page in pages"
                :key="page.id"
                class="docx-page"
                :style="pageStyle"
                :class="[paperFormat, orientation, `docx-page--${page.type}`]"
              >
                <!-- Running Header -->
                <div v-if="runningHeader && page.type !== 'title'" class="docx-page__header">
                  <span class="docx-page__header-title">{{ note.title || 'Untitled' }}</span>
                </div>
                
                <div class="docx-page__body">
                  <!-- Title Page Layout -->
                  <div v-if="page.type === 'title'" class="docx-page__title-layout">
                    <h1 class="docx-page__title">{{ note.icon }} {{ note.title || 'Untitled' }}</h1>
                  </div>
                  
                  <!-- Table of Contents -->
                  <div v-else-if="page.type === 'toc'" class="docx-page__toc">
                    <h2 class="docx-page__toc-title">{{ t('export.tableOfContents') }}</h2>
                    <div class="docx-page__toc-item">
                      <span>1. <span v-if="headingNumbers">1. </span>{{ note.title || 'Introduction' }}</span>
                      <span class="dots"></span>
                      <span>Page {{ titlePage ? 3 : 2 }}</span>
                    </div>
                    <div class="docx-page__toc-item">
                      <span>2. Summary</span>
                      <span class="dots"></span>
                      <span>Page {{ titlePage ? 4 : 3 }}</span>
                    </div>
                  </div>
                  
                  <!-- Main Content Simulation -->
                  <div v-else-if="page.type === 'content'" class="docx-page__content">
                    <div v-if="exportNoteTitle && !titlePage && (page.contentPageIndex === 0 || page.contentPageIndex === undefined)" class="docx-page__content-title-wrapper">
                      <h1 class="docx-page__title-inline">{{ note.icon }} {{ note.title || 'Untitled' }}</h1>
                    </div>
                    <template v-if="page.contentPageIndex === undefined">
                      <DocxPreviewNode v-if="processedContent" :node="processedContent" />
                    </template>
                    <template v-else-if="contentPages[page.contentPageIndex]">
                      <DocxPreviewNode
                        v-for="(node, idx) in contentPages[page.contentPageIndex].nodes"
                        :key="idx"
                        :node="node"
                      />
                    </template>
                  </div>
                </div>

                <!-- Page Numbers -->
                <div v-if="pageNumbers && page.type !== 'title'" class="docx-page__footer">
                  <span class="docx-page__footer-page">Page {{ page.pageNumber }}</span>
                </div>
              </div>
            </div>
          </main>
        </div>

        <footer class="docx-modal__footer">
          <div v-if="error" class="docx-footer-error">{{ error }}</div>
          <div v-else />
          <div class="docx-modal__footer-actions">
            <button type="button" class="nv-btn" :disabled="saving" @click="emit('close')">
              {{ t('workspace.context.cancel') }}
            </button>
            <button
              type="button"
              class="nv-btn nv-btn--primary"
              :class="{ 'nv-btn--loading': saving }"
              :disabled="saving"
              @click="onSave"
            >
              <span v-if="saving" class="nv-btn__spinner" aria-hidden="true" />
              <FileDown v-else :size="14" />
              {{ t('export.saveDocx') }}
            </button>
          </div>
        </footer>
      </section>
    </div>
  </Teleport>
</template>
