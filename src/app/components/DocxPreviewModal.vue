<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, toRef } from 'vue'
import { useI18n } from 'vue-i18n'
import { FileDown } from 'lucide-vue-next'
import type { NoteDocument } from '../../types/note'
import NvModal from '../../ui/primitives/NvModal.vue'
import { configCommands } from '../../tauri/commands'
import {
  DEFAULT_DOCX_OPTIONS,
  type DocxExportOptions,
  type DocxOrientation,
  type DocxPaperFormat,
} from '../../utils/noteExport/docxOptions'
import { useDocxPagination } from '../composables/useDocxPagination'
import DocxExportSettings from './DocxExportSettings.vue'
import DocxPreviewContent from './DocxPreviewContent.vue'

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

let resizeObserver: ResizeObserver | null = null

onMounted(async () => {
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
  if (resizeObserver) {
    resizeObserver.disconnect()
  }
})
</script>

<template>
  <NvModal
    :open="true"
    size="full"
    labelled-by="docx-modal-title"
    panel-class="docx-modal-panel"
    @close="emit('close')"
  >
    <template #header>
      <h2 id="docx-modal-title" class="docx-modal__heading tw:m-0 tw:text-xs tw:font-semibold tw:text-content-muted">{{ t('export.formatDocxModalTitle') }}</h2>
    </template>

    <div class="docx-modal__shell tw:grid tw:min-h-0 tw:flex-1 tw:grid-cols-[260px_minmax(0,1fr)] tw:bg-modal tw:max-[719px]:grid-cols-1 tw:max-[719px]:grid-rows-[auto_minmax(0,1fr)]">
      <DocxExportSettings
        v-model:paper-format="paperFormat"
        v-model:orientation="orientation"
        v-model:font-size="fontSize"
        v-model:font-family="fontFamily"
        v-model:margin-top="marginTop"
        v-model:margin-right="marginRight"
        v-model:margin-bottom="marginBottom"
        v-model:margin-left="marginLeft"
        :title="note.title"
        v-model:line-spacing="lineSpacing"
        :system-fonts="systemFonts"
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

      <main class="docx-preview tw:relative tw:min-h-0 tw:min-w-0 tw:overflow-hidden tw:bg-surface-subtle">
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
            <DocxPreviewContent
              :nodes="paginatedContentNodes"
              :title="note.title"
              :icon="note.icon"
              :show-title="exportNoteTitle && !titlePage"
            />
          </div>
        </div>

        <div ref="surfaceRef" class="docx-preview__surface tw:flex tw:h-full tw:w-full tw:flex-col tw:items-center tw:gap-5 tw:overflow-auto tw:bg-transparent tw:px-5 tw:py-10">
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
              <DocxPreviewContent
                v-else-if="page.type === 'content' && page.contentPageIndex !== undefined"
                :nodes="contentPages[page.contentPageIndex]?.nodes ?? []"
                :title="note.title"
                :icon="note.icon"
                :show-title="Boolean(contentPages[page.contentPageIndex]?.hasTitle)"
              />
            </div>

            <!-- Page Numbers -->
            <div v-if="pageNumbers && page.type !== 'title'" class="docx-page__footer">
              <span class="docx-page__footer-page">Page {{ page.pageNumber }}</span>
            </div>
          </div>
        </div>
      </main>
    </div>

    <template #footer>
      <div class="docx-modal__footer tw:flex tw:w-full tw:items-center tw:justify-between tw:gap-4">
        <div v-if="error" class="docx-footer-error tw:min-w-0 tw:truncate tw:text-xs tw:text-danger">{{ error }}</div>
        <div v-else />
        <div class="docx-modal__footer-actions tw:flex tw:shrink-0 tw:items-center tw:gap-2.5">
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
      </div>
    </template>
  </NvModal>
</template>
