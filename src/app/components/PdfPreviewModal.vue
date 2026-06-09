<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { FileDown, Minus, Plus, RectangleHorizontal, RectangleVertical, X } from 'lucide-vue-next'
import type { NoteDocument } from '../../types/note'
import { useFocusTrap } from '../../ui/composables/useFocusTrap'
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
}

const props = defineProps<Props>()
const emit = defineEmits<{ close: [] }>()

const { t } = useI18n()
const dialogRef = ref<HTMLElement | null>(null)
const open = ref(true)
const { activate, deactivate } = useFocusTrap(dialogRef, open)
watch(open, (value) => { if (value) nextTick(activate); else deactivate() }, { immediate: true })

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
const previewPages = ref<string[]>([])
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

async function regeneratePreview() {
  const currentGeneration = ++generationId
  loading.value = true
  error.value = null
  previewReady.value = false
  previewPages.value = []
  try {
    const { source, assets } = await buildTypstExport(props.note, options.value)
    const pages = await noteCommands.renderNotePdfPreview(props.workspacePath, source, assets)
    if (currentGeneration !== generationId) return
    previewPages.value = pages.map(b64 => `data:image/png;base64,${b64}`)
    previewReady.value = true
  } catch {
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
    const { save } = await import('@tauri-apps/plugin-dialog')
    const savePath = await save({
      title: t('export.saveDialogTitle'),
      defaultPath: `${safeName}.pdf`,
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
    })
    if (!savePath) return
    const { source, assets } = await buildTypstExport(props.note, options.value)
    await noteCommands.exportNotePdf(props.workspacePath, savePath, source, assets)
    emit('close')
  } catch {
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
  previewPages.value = []
  open.value = false
})
</script>

<template>
  <Teleport to="body">
    <div class="pdf-backdrop" @click.self="emit('close')" @keydown.esc="emit('close')">
      <section
        ref="dialogRef"
        class="pdf-modal"
        role="dialog"
        aria-modal="true"
        :aria-label="t('export.formatPdf')"
      >
        <div class="pdf-modal__titlebar">
          <span>{{ t('export.formatPdf') }}</span>
          <button type="button" class="pdf-modal__close" :aria-label="t('workspace.context.cancel')" @click="emit('close')">
            <X :size="15" />
          </button>
        </div>

        <div class="pdf-modal__shell">
          <aside class="pdf-settings">
            <div class="pdf-settings__header">
              <h2>{{ note.title }}</h2>
            </div>

            <section class="pdf-group">
              <span class="pdf-group__title">{{ t('export.sections.page') }}</span>

              <div class="pdf-field pdf-field--row">
                <span class="pdf-field__label">{{ t('export.pageSize') }}</span>
                <div class="pdf-segment">
                  <button
                    v-for="fmt in (['A4', 'Letter'] as PdfPaperFormat[])"
                    :key="fmt"
                    type="button"
                    class="pdf-segment__btn"
                    :class="{ 'pdf-segment__btn--active': paperFormat === fmt }"
                    @click="paperFormat = fmt"
                  >{{ fmt }}</button>
                </div>
              </div>

              <div class="pdf-field pdf-field--row">
                <span class="pdf-field__label">{{ t('export.orientation') }}</span>
                <div class="pdf-segment">
                  <button
                    type="button"
                    class="pdf-segment__btn pdf-segment__btn--icon"
                    :class="{ 'pdf-segment__btn--active': orientation === 'portrait' }"
                    :aria-label="t('export.portrait')"
                    @click="orientation = 'portrait'"
                  >
                    <RectangleVertical :size="14" />
                  </button>
                  <button
                    type="button"
                    class="pdf-segment__btn pdf-segment__btn--icon"
                    :class="{ 'pdf-segment__btn--active': orientation === 'landscape' }"
                    :aria-label="t('export.landscape')"
                    @click="orientation = 'landscape'"
                  >
                    <RectangleHorizontal :size="14" />
                  </button>
                </div>
              </div>

              <div class="pdf-field">
                <span class="pdf-field__label">{{ t('export.margins') }}</span>
                <div class="pdf-segment pdf-segment--stack">
                  <button
                    v-for="preset in (['narrow', 'normal', 'wide'] as PdfMarginPreset[])"
                    :key="preset"
                    type="button"
                    class="pdf-segment__btn"
                    :class="{ 'pdf-segment__btn--active': marginPreset === preset }"
                    @click="marginPreset = preset"
                  >{{ t(`export.marginPresets.${preset}`) }}</button>
                </div>
              </div>
            </section>

            <section class="pdf-group">
              <span class="pdf-group__title">{{ t('export.sections.typography') }}</span>

              <div class="pdf-field">
                <span class="pdf-field__label">{{ t('export.fontFamily') }}</span>
                <div class="pdf-select-wrap">
                  <select v-model="fontFamily" class="pdf-select">
                    <option value="">{{ t('export.fontDefault') }}</option>
                    <option v-for="f in systemFonts" :key="f" :value="f">{{ f }}</option>
                  </select>
                </div>
              </div>

              <div class="pdf-field pdf-field--row">
                <span class="pdf-field__label">{{ t('export.fontSize') }}</span>
                <div class="pdf-stepper">
                  <button type="button" class="pdf-stepper__btn" :disabled="fontSize <= 9" @click="fontSize = Math.max(9, fontSize - 1)">
                    <Minus :size="12" />
                  </button>
                  <span class="pdf-stepper__value">{{ fontSize }}pt</span>
                  <button type="button" class="pdf-stepper__btn" :disabled="fontSize >= 16" @click="fontSize = Math.min(16, fontSize + 1)">
                    <Plus :size="12" />
                  </button>
                </div>
              </div>

              <div class="pdf-field">
                <span class="pdf-field__label">{{ t('export.lineSpacing') }}</span>
                <div class="pdf-segment pdf-segment--stack">
                  <button
                    v-for="preset in (['compact', 'normal', 'relaxed'] as PdfLineSpacing[])"
                    :key="preset"
                    type="button"
                    class="pdf-segment__btn"
                    :class="{ 'pdf-segment__btn--active': lineSpacing === preset }"
                    @click="lineSpacing = preset"
                  >{{ t(`export.lineSpacings.${preset}`) }}</button>
                </div>
              </div>
            </section>

            <section class="pdf-group">
              <span class="pdf-group__title">{{ t('export.sections.document') }}</span>

              <label
                v-for="toggle in documentToggles"
                :key="toggle.key"
                class="pdf-toggle"
                :class="{ 'pdf-toggle--active': toggle.model.value }"
              >
                <span class="pdf-toggle__label">{{ t(toggle.label) }}</span>
                <span class="toggle">
                  <input v-model="toggle.model.value" type="checkbox" />
                  <span class="toggle-ui" />
                </span>
              </label>
            </section>

            <section class="pdf-group">
              <span class="pdf-group__title">{{ t('export.sections.preview') }}</span>

              <div class="pdf-field pdf-field--row">
                <span class="pdf-field__label">{{ t('export.previewZoom') }}</span>
                <div class="pdf-stepper">
                  <button type="button" class="pdf-stepper__btn" :disabled="zoom <= 50 || fitWidth" @click="zoom = Math.max(50, zoom - 10)">
                    <Minus :size="12" />
                  </button>
                  <span class="pdf-stepper__value">{{ zoom }}%</span>
                  <button type="button" class="pdf-stepper__btn" :disabled="zoom >= 150 || fitWidth" @click="zoom = Math.min(150, zoom + 10)">
                    <Plus :size="12" />
                  </button>
                </div>
              </div>

              <label class="pdf-toggle" :class="{ 'pdf-toggle--active': fitWidth }">
                <span class="pdf-toggle__label">{{ t('export.fitWidth') }}</span>
                <span class="toggle">
                  <input v-model="fitWidth" type="checkbox" />
                  <span class="toggle-ui" />
                </span>
              </label>
            </section>
          </aside>

          <main class="pdf-preview">
            <div v-if="loading" class="pdf-state">{{ t('export.pdfGenerating') }}</div>
            <div v-else-if="error" class="pdf-state pdf-state--error">{{ error }}</div>
            <div
              v-else-if="previewReady"
              class="pdf-preview__surface"
              role="document"
              :aria-label="t('export.pdfPreviewTitle')"
            >
              <img
                v-for="(page, index) in previewPages"
                :key="index"
                class="pdf-preview__page"
                :src="page"
                :style="pageStyle"
                :alt="`${t('export.pdfPreviewTitle')} ${index + 1}`"
              />
            </div>
          </main>
        </div>

        <footer class="pdf-modal__footer">
          <div v-if="error" class="pdf-footer-error">{{ error }}</div>
          <div v-else />
          <div class="pdf-modal__footer-actions">
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
        </footer>
      </section>
    </div>
  </Teleport>
</template>
