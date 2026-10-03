<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { FileDown, Minus, Plus, RectangleHorizontal, RectangleVertical } from 'lucide-vue-next'
import type { NoteDocument } from '../../types/note'
import NvModal from '../../ui/primitives/NvModal.vue'
import { configCommands, noteCommands } from '../../tauri/commands'
import {
  DEFAULT_PDF_OPTIONS,
  type PdfExportOptions,
  type PdfLineSpacing,
  type PdfMarginPreset,
  type PdfOrientation,
  type PdfPaperFormat,
} from '../../utils/noteExport/pdfOptions'
import { buildTypstExport } from '../../utils/noteExport/buildTypstExport'

interface Props {
  note: NoteDocument
  workspacePath: string
  /** Asset bytes by file name, for images not resolvable from a workspace
   *  path; Rust resolves anything else from its workspace-relative path. */
  assetBytes?: Map<string, Uint8Array>
}

const props = defineProps<Props>()
const emit = defineEmits<{ close: [] }>()

const { t } = useI18n()

const paperFormat = ref<PdfPaperFormat>(DEFAULT_PDF_OPTIONS.paperFormat)
const orientation = ref<PdfOrientation>(DEFAULT_PDF_OPTIONS.orientation)
const fontSize = ref(DEFAULT_PDF_OPTIONS.fontSize)
const fontFamily = ref<string>(DEFAULT_PDF_OPTIONS.fontFamily)
const systemFonts = ref<string[]>([])
const marginPreset = ref<PdfMarginPreset>(DEFAULT_PDF_OPTIONS.marginPreset)
const lineSpacing = ref<PdfLineSpacing>(DEFAULT_PDF_OPTIONS.lineSpacing)
const pageNumbers = ref(DEFAULT_PDF_OPTIONS.pageNumbers)
const headingNumbers = ref(DEFAULT_PDF_OPTIONS.headingNumbers)
const tableOfContents = ref(DEFAULT_PDF_OPTIONS.tableOfContents)
const titlePage = ref(DEFAULT_PDF_OPTIONS.titlePage)
const runningHeader = ref(DEFAULT_PDF_OPTIONS.runningHeader)
const zoom = ref(100)
const fitWidth = ref(true)
const loading = ref(false)
const saving = ref(false)
const error = ref<string | null>(null)
const previewReady = ref(false)
const totalPages = ref(0)
const previewToken = ref<number | null>(null)
const pageUrls = ref<(string | null)[]>([])
const pendingBatches = new Set<number>()
const BATCH_SIZE = 6
const previewSurfaceRef = ref<HTMLElement | null>(null)
let pageObserver: IntersectionObserver | null = null
let generationId = 0

const documentToggles = [
  { key: 'toc', label: 'export.tableOfContents', model: tableOfContents },
  { key: 'headings', label: 'export.headingNumbers', model: headingNumbers },
  { key: 'title', label: 'export.titlePage', model: titlePage },
  { key: 'header', label: 'export.runningHeader', model: runningHeader },
  { key: 'pageNumbers', label: 'export.pageNumbers', model: pageNumbers },
]

const options = computed<PdfExportOptions>(() => ({
  paperFormat: paperFormat.value,
  orientation: orientation.value,
  fontSize: fontSize.value,
  fontFamily: fontFamily.value,
  marginPreset: marginPreset.value,
  lineSpacing: lineSpacing.value,
  pageNumbers: pageNumbers.value,
  headingNumbers: headingNumbers.value,
  tableOfContents: tableOfContents.value,
  titlePage: titlePage.value,
  runningHeader: runningHeader.value,
}))

const pageStyle = computed(() => (fitWidth.value ? { width: '100%' } : { width: `${zoom.value}%` }))

// Real Typst page dimensions (mm) drive the placeholder's aspect ratio so the
// scroll height stays correct before a page has actually been rendered.
const pageAspect = computed(() => {
  const isA4 = paperFormat.value === 'A4'
  let width = isA4 ? 210 : 216
  let height = isA4 ? 297 : 279
  if (orientation.value === 'landscape') [width, height] = [height, width]
  return `${width} / ${height}`
})

const slotStyle = computed(() => ({ ...pageStyle.value, aspectRatio: pageAspect.value }))

function reobserveSlots() {
  pageObserver?.disconnect()
  pageObserver = null
  const surface = previewSurfaceRef.value
  if (!surface || typeof IntersectionObserver === 'undefined') return
  pageObserver = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue
      const index = Number((entry.target as HTMLElement).dataset.index)
      if (Number.isNaN(index)) continue
      void loadBatch(Math.floor(index / BATCH_SIZE) * BATCH_SIZE)
    }
  }, { root: surface, rootMargin: '600px 0px' })
  surface.querySelectorAll<HTMLElement>('.pdf-preview__page-slot').forEach((slot) => {
    pageObserver?.observe(slot)
  })
}

async function loadBatch(start: number) {
  if (previewToken.value == null) return
  if (start < 0 || start >= totalPages.value) return
  if (pendingBatches.has(start) || pageUrls.value[start] != null) return
  pendingBatches.add(start)
  const token = previewToken.value
  const gen = generationId
  try {
    const pages = await noteCommands.renderNotePdfPreviewPages(token, start, BATCH_SIZE)
    if (gen !== generationId || token !== previewToken.value) return
    pages.forEach((b64, i) => {
      pageUrls.value.splice(start + i, 1, `data:image/png;base64,${b64}`)
    })
  } catch (err) {
    console.error(err)
  } finally {
    pendingBatches.delete(start)
  }
}

async function regeneratePreview() {
  const currentGeneration = ++generationId
  loading.value = true
  error.value = null
  previewReady.value = false
  previewToken.value = null
  totalPages.value = 0
  pageUrls.value = []
  pendingBatches.clear()
  try {
    const { source, assets } = await buildTypstExport(props.note, options.value, { assetBytes: props.assetBytes })
    const info = await noteCommands.prepareNotePdfPreview(props.workspacePath, source, assets)
    if (currentGeneration !== generationId) return
    previewToken.value = info.token
    totalPages.value = info.totalPages
    pageUrls.value = Array(info.totalPages).fill(null)
    pendingBatches.clear()
    previewReady.value = true
    loading.value = false
    await nextTick()
    void loadBatch(0)
    reobserveSlots()
  } catch (err) {
    console.error(err)
    if (currentGeneration === generationId) {
      error.value = t('export.pdfGenerateError')
      previewReady.value = false
    }
  } finally {
    if (currentGeneration === generationId) loading.value = false
  }
}

async function savePdf() {
  if (loading.value || saving.value) return
  error.value = null
  saving.value = true
  try {
    const safeName = (props.note.title || 'note').replace(/[/\\?%*:|"<>]/g, '-').trim() || 'note'
    const { source, assets } = await buildTypstExport(props.note, options.value, { assetBytes: props.assetBytes })
    const saved = await noteCommands.exportNotePdf(
      props.workspacePath,
      `${safeName}.pdf`,
      source,
      assets,
    )
    if (saved) emit('close')
  } catch (err) {
    console.error(err)
    error.value = t('export.pdfSaveError')
  } finally {
    saving.value = false
  }
}

watch(
  [() => props.note, () => props.workspacePath, paperFormat, orientation, fontSize, fontFamily,
    marginPreset, lineSpacing, pageNumbers, headingNumbers, tableOfContents, titlePage, runningHeader],
  () => { void regeneratePreview() },
  { immediate: true },
)

onMounted(async () => {
  try {
    const fonts = await configCommands.listSystemFonts()
    systemFonts.value = [...new Set(fonts)].sort((a, b) => a.localeCompare(b))
  } catch {
    systemFonts.value = []
  }
})

onBeforeUnmount(() => {
  generationId += 1
  previewReady.value = false
  previewToken.value = null
  totalPages.value = 0
  pageUrls.value = []
  pendingBatches.clear()
  pageObserver?.disconnect()
})
</script>

<template>
  <NvModal
    :open="true"
    size="full"
    labelled-by="pdf-modal-title"
    panel-class="pdf-modal-panel"
    @close="emit('close')"
  >
    <template #header>
      <h2 id="pdf-modal-title" class="pdf-modal__heading tw:m-0 tw:text-xs tw:font-semibold tw:text-content-muted">{{ t('export.formatPdf') }}</h2>
    </template>

    <div class="pdf-modal__shell tw:grid tw:min-h-0 tw:flex-1 tw:grid-cols-[260px_minmax(0,1fr)] tw:bg-modal tw:max-[719px]:grid-cols-1 tw:max-[719px]:grid-rows-[auto_minmax(0,1fr)]">
      <aside class="pdf-settings tw:flex tw:min-h-0 tw:min-w-0 tw:flex-col tw:gap-3.5 tw:overflow-y-auto tw:bg-modal tw:p-[18px] tw:max-[719px]:max-h-[42dvh]">
        <div class="pdf-settings__header tw:pb-1">
          <h2 class="tw:m-0 tw:[font-family:var(--font-serif)] tw:text-lg tw:leading-[1.25] tw:font-normal tw:text-content-primary tw:wrap-anywhere">{{ note.title }}</h2>
        </div>

        <section class="pdf-group tw:grid tw:gap-[11px] tw:rounded-[calc(10px*var(--radius-scale,1))] tw:border tw:border-solid tw:border-transparent tw:bg-transparent tw:px-3 tw:pt-3 tw:pb-[13px]">
          <span class="pdf-group__title tw:text-[10px] tw:font-semibold tw:tracking-[0.07em] tw:text-content-muted tw:uppercase">{{ t('export.sections.page') }}</span>

          <div class="pdf-field pdf-field--row tw:flex tw:items-center tw:justify-between tw:gap-2.5">
            <span class="pdf-field__label tw:text-[11px] tw:text-content-muted">{{ t('export.pageSize') }}</span>
            <div class="pdf-segment tw:inline-flex tw:rounded-[calc(7px*var(--radius-scale,1))] tw:border tw:border-solid tw:border-transparent tw:bg-(--hover) tw:p-0.5">
              <button
                v-for="fmt in (['A4', 'Letter'] as PdfPaperFormat[])"
                :key="fmt"
                type="button"
                class="pdf-segment__btn tw:inline-flex tw:h-6 tw:min-w-0 tw:cursor-pointer tw:items-center tw:gap-1 tw:rounded-[calc(5px*var(--radius-scale,1))] tw:border-0 tw:px-[9px] tw:font-nv-ui tw:text-[11.5px] tw:font-medium tw:transition-colors tw:duration-100"
                :class="paperFormat === fmt ? 'pdf-segment__btn--active tw:bg-(--surface-raised) tw:text-content-primary tw:shadow-(--shadow-raised)' : 'tw:bg-transparent tw:text-content-muted'"
                @click="paperFormat = fmt"
              ><span class="pdf-segment__btn-text tw:w-full tw:truncate tw:text-center">{{ fmt }}</span></button>
            </div>
          </div>

          <div class="pdf-field pdf-field--row tw:flex tw:items-center tw:justify-between tw:gap-2.5">
            <span class="pdf-field__label tw:text-[11px] tw:text-content-muted">{{ t('export.orientation') }}</span>
            <div class="pdf-segment tw:inline-flex tw:rounded-[calc(7px*var(--radius-scale,1))] tw:border tw:border-solid tw:border-transparent tw:bg-(--hover) tw:p-0.5">
              <button
                type="button"
                class="pdf-segment__btn pdf-segment__btn--icon tw:inline-flex tw:h-6 tw:min-w-0 tw:cursor-pointer tw:items-center tw:justify-center tw:gap-1 tw:rounded-[calc(5px*var(--radius-scale,1))] tw:border-0 tw:px-[9px] tw:font-nv-ui tw:text-[11.5px] tw:font-medium tw:transition-colors tw:duration-100"
                :class="orientation === 'portrait' ? 'pdf-segment__btn--active tw:bg-(--surface-raised) tw:text-content-primary tw:shadow-(--shadow-raised)' : 'tw:bg-transparent tw:text-content-muted'"
                :aria-label="t('export.portrait')"
                @click="orientation = 'portrait'"
              >
                <RectangleVertical :size="14" />
              </button>
              <button
                type="button"
                class="pdf-segment__btn pdf-segment__btn--icon tw:inline-flex tw:h-6 tw:min-w-0 tw:cursor-pointer tw:items-center tw:justify-center tw:gap-1 tw:rounded-[calc(5px*var(--radius-scale,1))] tw:border-0 tw:px-[9px] tw:font-nv-ui tw:text-[11.5px] tw:font-medium tw:transition-colors tw:duration-100"
                :class="orientation === 'landscape' ? 'pdf-segment__btn--active tw:bg-(--surface-raised) tw:text-content-primary tw:shadow-(--shadow-raised)' : 'tw:bg-transparent tw:text-content-muted'"
                :aria-label="t('export.landscape')"
                @click="orientation = 'landscape'"
              >
                <RectangleHorizontal :size="14" />
              </button>
            </div>
          </div>

          <div class="pdf-field tw:grid tw:gap-[7px]">
            <span class="pdf-field__label tw:text-[11px] tw:text-content-muted">{{ t('export.margins') }}</span>
            <div class="pdf-segment pdf-segment--stack tw:grid tw:grid-cols-3 tw:rounded-[calc(7px*var(--radius-scale,1))] tw:border tw:border-solid tw:border-transparent tw:bg-(--hover) tw:p-0.5">
              <button
                v-for="preset in (['narrow', 'normal', 'wide'] as PdfMarginPreset[])"
                :key="preset"
                type="button"
                class="pdf-segment__btn tw:inline-flex tw:h-6 tw:min-w-0 tw:cursor-pointer tw:items-center tw:justify-center tw:gap-1 tw:rounded-[calc(5px*var(--radius-scale,1))] tw:border-0 tw:px-1 tw:font-nv-ui tw:text-[11px] tw:font-medium tw:transition-colors tw:duration-100"
                :class="marginPreset === preset ? 'pdf-segment__btn--active tw:bg-(--surface-raised) tw:text-content-primary tw:shadow-(--shadow-raised)' : 'tw:bg-transparent tw:text-content-muted'"
                @click="marginPreset = preset"
              ><span class="pdf-segment__btn-text tw:w-full tw:truncate tw:text-center">{{ t(`export.marginPresets.${preset}`) }}</span></button>
            </div>
          </div>
        </section>

        <section class="pdf-group tw:grid tw:gap-[11px] tw:rounded-[calc(10px*var(--radius-scale,1))] tw:border tw:border-solid tw:border-transparent tw:bg-transparent tw:px-3 tw:pt-3 tw:pb-[13px]">
          <span class="pdf-group__title tw:text-[10px] tw:font-semibold tw:tracking-[0.07em] tw:text-content-muted tw:uppercase">{{ t('export.sections.typography') }}</span>

          <div class="pdf-field tw:grid tw:gap-[7px]">
            <span class="pdf-field__label tw:text-[11px] tw:text-content-muted">{{ t('export.fontFamily') }}</span>
            <div class="pdf-select-wrap">
              <select v-model="fontFamily" class="pdf-select tw:h-[30px] tw:w-full tw:cursor-pointer tw:appearance-none tw:rounded-[calc(7px*var(--radius-scale,1))] tw:border tw:border-solid tw:border-transparent tw:bg-(--hover) tw:pr-7 tw:pl-[9px] tw:font-nv-ui tw:text-xs tw:font-medium tw:text-content-secondary tw:transition-colors tw:duration-100 tw:hover:bg-(--hover-strong) tw:hover:text-content-primary tw:focus-visible:border-accent tw:focus-visible:outline-none">
                <option value="">{{ t('export.fontDefault') }}</option>
                <option v-for="f in systemFonts" :key="f" :value="f">{{ f }}</option>
              </select>
            </div>
          </div>

          <div class="pdf-field pdf-field--row tw:flex tw:items-center tw:justify-between tw:gap-2.5">
            <span class="pdf-field__label tw:text-[11px] tw:text-content-muted">{{ t('export.fontSize') }}</span>
            <div class="pdf-stepper tw:inline-flex tw:items-center tw:overflow-hidden tw:rounded-[calc(7px*var(--radius-scale,1))] tw:border tw:border-solid tw:border-transparent tw:bg-(--hover)">
              <button type="button" class="pdf-stepper__btn tw:grid tw:h-[26px] tw:w-7 tw:cursor-pointer tw:place-items-center tw:border-0 tw:bg-transparent tw:text-content-muted tw:transition-colors tw:duration-100 tw:enabled:hover:bg-(--hover-strong) tw:enabled:hover:text-content-primary tw:disabled:cursor-default tw:disabled:opacity-35" :disabled="fontSize <= 9" @click="fontSize = Math.max(9, fontSize - 1)">
                <Minus :size="12" />
              </button>
              <span class="pdf-stepper__value tw:inline-flex tw:h-[26px] tw:min-w-[54px] tw:items-center tw:justify-center tw:border-x tw:border-y-0 tw:border-solid tw:border-x-(--border-subtle) tw:px-1 tw:font-nv-mono tw:text-[11.5px] tw:font-medium tw:text-content-secondary">{{ fontSize }}pt</span>
              <button type="button" class="pdf-stepper__btn tw:grid tw:h-[26px] tw:w-7 tw:cursor-pointer tw:place-items-center tw:border-0 tw:bg-transparent tw:text-content-muted tw:transition-colors tw:duration-100 tw:enabled:hover:bg-(--hover-strong) tw:enabled:hover:text-content-primary tw:disabled:cursor-default tw:disabled:opacity-35" :disabled="fontSize >= 16" @click="fontSize = Math.min(16, fontSize + 1)">
                <Plus :size="12" />
              </button>
            </div>
          </div>

          <div class="pdf-field tw:grid tw:gap-[7px]">
            <span class="pdf-field__label tw:text-[11px] tw:text-content-muted">{{ t('export.lineSpacing') }}</span>
            <div class="pdf-segment pdf-segment--stack tw:grid tw:grid-cols-3 tw:rounded-[calc(7px*var(--radius-scale,1))] tw:border tw:border-solid tw:border-transparent tw:bg-(--hover) tw:p-0.5">
              <button
                v-for="preset in (['compact', 'normal', 'relaxed'] as PdfLineSpacing[])"
                :key="preset"
                type="button"
                class="pdf-segment__btn tw:inline-flex tw:h-6 tw:min-w-0 tw:cursor-pointer tw:items-center tw:justify-center tw:gap-1 tw:rounded-[calc(5px*var(--radius-scale,1))] tw:border-0 tw:px-1 tw:font-nv-ui tw:text-[11px] tw:font-medium tw:transition-colors tw:duration-100"
                :class="lineSpacing === preset ? 'pdf-segment__btn--active tw:bg-(--surface-raised) tw:text-content-primary tw:shadow-(--shadow-raised)' : 'tw:bg-transparent tw:text-content-muted'"
                @click="lineSpacing = preset"
              ><span class="pdf-segment__btn-text tw:w-full tw:truncate tw:text-center">{{ t(`export.lineSpacings.${preset}`) }}</span></button>
            </div>
          </div>
        </section>

        <section class="pdf-group tw:grid tw:gap-[11px] tw:rounded-[calc(10px*var(--radius-scale,1))] tw:border tw:border-solid tw:border-transparent tw:bg-transparent tw:px-3 tw:pt-3 tw:pb-[13px]">
          <span class="pdf-group__title tw:text-[10px] tw:font-semibold tw:tracking-[0.07em] tw:text-content-muted tw:uppercase">{{ t('export.sections.document') }}</span>

          <label
            v-for="toggle in documentToggles"
            :key="toggle.key"
            class="pdf-toggle tw:flex tw:cursor-pointer tw:items-center tw:justify-between tw:gap-2 tw:text-xs tw:text-content-secondary tw:select-none"
            :class="{ 'pdf-toggle--active': toggle.model.value }"
          >
            <span class="pdf-toggle__label tw:text-[12.5px] tw:transition-colors tw:duration-150" :class="toggle.model.value ? 'tw:text-content-primary' : 'tw:text-content-muted'">{{ t(toggle.label) }}</span>
            <span class="toggle tw:relative tw:inline-flex">
              <input v-model="toggle.model.value" class="tw:peer tw:absolute tw:inset-0 tw:m-0 tw:cursor-pointer tw:opacity-0" type="checkbox" />
              <span class="toggle-ui tw:relative tw:h-[18px] tw:w-8 tw:rounded-full tw:border tw:border-solid tw:border-transparent tw:bg-(--hover-strong) tw:transition-[background,border-color] tw:duration-150 tw:peer-checked:border-accent tw:peer-checked:bg-accent tw:peer-focus-visible:outline-2 tw:peer-focus-visible:outline-offset-2 tw:peer-focus-visible:outline-focus-ring tw:after:absolute tw:after:top-px tw:after:left-px tw:after:size-3.5 tw:after:rounded-full tw:after:bg-white tw:after:shadow-(--shadow-raised) tw:after:transition-[left] tw:after:duration-150 tw:after:ease-[cubic-bezier(.2,.7,.3,1)] tw:after:content-[''] tw:peer-checked:after:left-[15px]" />
            </span>
          </label>
        </section>

        <section class="pdf-group tw:grid tw:gap-[11px] tw:rounded-[calc(10px*var(--radius-scale,1))] tw:border tw:border-solid tw:border-transparent tw:bg-transparent tw:px-3 tw:pt-3 tw:pb-[13px]">
          <span class="pdf-group__title tw:text-[10px] tw:font-semibold tw:tracking-[0.07em] tw:text-content-muted tw:uppercase">{{ t('export.sections.preview') }}</span>

          <div class="pdf-field pdf-field--row tw:flex tw:items-center tw:justify-between tw:gap-2.5">
            <span class="pdf-field__label tw:text-[11px] tw:text-content-muted">{{ t('export.previewZoom') }}</span>
            <div class="pdf-stepper tw:inline-flex tw:items-center tw:overflow-hidden tw:rounded-[calc(7px*var(--radius-scale,1))] tw:border tw:border-solid tw:border-transparent tw:bg-(--hover)">
              <button type="button" class="pdf-stepper__btn tw:grid tw:h-[26px] tw:w-7 tw:cursor-pointer tw:place-items-center tw:border-0 tw:bg-transparent tw:text-content-muted tw:transition-colors tw:duration-100 tw:enabled:hover:bg-(--hover-strong) tw:enabled:hover:text-content-primary tw:disabled:cursor-default tw:disabled:opacity-35" :disabled="zoom <= 50 || fitWidth" @click="zoom = Math.max(50, zoom - 10)">
                <Minus :size="12" />
              </button>
              <span class="pdf-stepper__value tw:inline-flex tw:h-[26px] tw:min-w-[54px] tw:items-center tw:justify-center tw:border-x tw:border-y-0 tw:border-solid tw:border-x-(--border-subtle) tw:px-1 tw:font-nv-mono tw:text-[11.5px] tw:font-medium tw:text-content-secondary">{{ zoom }}%</span>
              <button type="button" class="pdf-stepper__btn tw:grid tw:h-[26px] tw:w-7 tw:cursor-pointer tw:place-items-center tw:border-0 tw:bg-transparent tw:text-content-muted tw:transition-colors tw:duration-100 tw:enabled:hover:bg-(--hover-strong) tw:enabled:hover:text-content-primary tw:disabled:cursor-default tw:disabled:opacity-35" :disabled="zoom >= 150 || fitWidth" @click="zoom = Math.min(150, zoom + 10)">
                <Plus :size="12" />
              </button>
            </div>
          </div>

          <label class="pdf-toggle tw:flex tw:cursor-pointer tw:items-center tw:justify-between tw:gap-2 tw:text-xs tw:text-content-secondary tw:select-none" :class="{ 'pdf-toggle--active': fitWidth }">
            <span class="pdf-toggle__label tw:text-[12.5px] tw:transition-colors tw:duration-150" :class="fitWidth ? 'tw:text-content-primary' : 'tw:text-content-muted'">{{ t('export.fitWidth') }}</span>
            <span class="toggle">
              <input v-model="fitWidth" class="tw:accent-accent" type="checkbox" />
              <span class="toggle-ui" />
            </span>
          </label>
        </section>
      </aside>

      <main class="pdf-preview tw:relative tw:min-h-0 tw:min-w-0 tw:overflow-hidden tw:bg-(--surface-navigation)">
        <div v-if="loading" class="pdf-state tw:absolute tw:inset-0 tw:z-1 tw:grid tw:place-items-center tw:text-[12.5px] tw:text-content-muted">{{ t('export.pdfGenerating') }}</div>
        <div v-else-if="error" class="pdf-state pdf-state--error tw:absolute tw:inset-0 tw:z-1 tw:grid tw:place-items-center tw:text-[12.5px] tw:text-danger">{{ error }}</div>
        <div
          v-else-if="previewReady"
          ref="previewSurfaceRef"
          class="pdf-preview__surface tw:flex tw:h-full tw:w-full tw:flex-col tw:items-center tw:gap-4 tw:overflow-auto tw:bg-transparent tw:p-5"
          role="document"
          :aria-label="t('export.pdfPreviewTitle')"
        >
          <div
            v-for="i in totalPages"
            :key="i"
            class="pdf-preview__page-slot tw:relative tw:shrink-0 tw:overflow-hidden tw:rounded-[calc(2px*var(--radius-scale,1))] tw:bg-white tw:shadow-(--shadow-overlay)"
            :style="slotStyle"
            :data-index="i - 1"
          >
            <img
              v-if="pageUrls[i - 1]"
              class="pdf-preview__page tw:block tw:h-full tw:w-full tw:object-contain"
              :src="pageUrls[i - 1]!"
              :alt="`${t('export.pdfPreviewTitle')} ${i}`"
            />
            <div v-else class="pdf-preview__page-placeholder tw:absolute tw:inset-0 tw:grid tw:place-items-center tw:text-xs tw:text-content-muted">
              {{ t('export.previewLoadingPage') }}
            </div>
          </div>
        </div>
      </main>
    </div>

    <template #footer>
      <div class="pdf-modal__footer tw:flex tw:w-full tw:items-center tw:justify-between tw:gap-4">
        <div v-if="error" class="pdf-footer-error tw:min-w-0 tw:truncate tw:text-xs tw:text-danger">{{ error }}</div>
        <div v-else />
        <div class="pdf-modal__footer-actions tw:flex tw:shrink-0 tw:items-center tw:gap-2.5">
          <button type="button" class="nv-btn" :disabled="saving" @click="emit('close')">
            {{ t('workspace.context.cancel') }}
          </button>
          <button
            type="button"
            class="nv-btn nv-btn--primary"
            :class="{ 'nv-btn--loading': saving }"
            :disabled="loading || saving || !previewReady"
            @click="savePdf"
          >
            <span v-if="saving" class="nv-btn__spinner" aria-hidden="true" />
            <FileDown v-else :size="14" />
            {{ t('export.savePdf') }}
          </button>
        </div>
      </div>
    </template>
  </NvModal>
</template>
