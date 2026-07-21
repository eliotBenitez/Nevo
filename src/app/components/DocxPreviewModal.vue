<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, toRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { FileDown, X } from 'lucide-vue-next'
import type { NoteDocument } from '../../types/note'
import { useFocusTrap } from '../../ui/composables/useFocusTrap'
import { configCommands } from '../../tauri/commands'
import {
  DEFAULT_DOCX_OPTIONS,
  type DocxExportOptions,
  type DocxOrientation,
  type DocxPaperFormat,
} from '../../utils/noteExport/docxOptions'
import { useDocxPagination } from '../composables/useDocxPagination'
import DocxExportSettings from './DocxExportSettings.vue'
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

const surfaceRef = ref<HTMLElement | null>(null)
const surfaceWidth = ref(800)
const hiddenContainerRef = ref<HTMLElement | null>(null)

const {
  pageStyle,
  processedContent,
  paginatedContentNodes,
  contentPages,
  pages,
} = useDocxPagination({
  note: toRef(props, 'note'),
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
  headingNumbers,
  tableOfContents,
  titlePage,
  exportNoteTitle,
  surfaceWidth,
  zoom,
  fitWidth,
  hiddenContainerRef,
})

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
          <DocxExportSettings
            :title="note.title"
            :system-fonts="systemFonts"
            v-model:paper-format="paperFormat"
            v-model:orientation="orientation"
            v-model:font-size="fontSize"
            v-model:font-family="fontFamily"
            v-model:margin-top="marginTop"
            v-model:margin-right="marginRight"
            v-model:margin-bottom="marginBottom"
            v-model:margin-left="marginLeft"
            v-model:line-spacing="lineSpacing"
            v-model:paragraph-spacing="paragraphSpacing"
            v-model:page-numbers="pageNumbers"
            v-model:heading-numbers="headingNumbers"
            v-model:table-of-contents="tableOfContents"
            v-model:title-page="titlePage"
            v-model:running-header="runningHeader"
            v-model:export-note-title="exportNoteTitle"
            v-model:zoom="zoom"
            v-model:fit-width="fitWidth"
          />

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
