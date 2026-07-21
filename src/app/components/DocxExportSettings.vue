<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { Minus, Plus, RectangleHorizontal, RectangleVertical } from 'lucide-vue-next'
import type { DocxOrientation, DocxPaperFormat } from '../../utils/noteExport/docxOptions'

defineProps<{
  title: string
  systemFonts: string[]
}>()

const paperFormat = defineModel<DocxPaperFormat>('paperFormat', { required: true })
const orientation = defineModel<DocxOrientation>('orientation', { required: true })
const fontSize = defineModel<number>('fontSize', { required: true })
const fontFamily = defineModel<string>('fontFamily', { required: true })
const marginTop = defineModel<number>('marginTop', { required: true })
const marginRight = defineModel<number>('marginRight', { required: true })
const marginBottom = defineModel<number>('marginBottom', { required: true })
const marginLeft = defineModel<number>('marginLeft', { required: true })
const lineSpacing = defineModel<number>('lineSpacing', { required: true })
const paragraphSpacing = defineModel<number>('paragraphSpacing', { required: true })
const pageNumbers = defineModel<boolean>('pageNumbers', { required: true })
const headingNumbers = defineModel<boolean>('headingNumbers', { required: true })
const tableOfContents = defineModel<boolean>('tableOfContents', { required: true })
const titlePage = defineModel<boolean>('titlePage', { required: true })
const runningHeader = defineModel<boolean>('runningHeader', { required: true })
const exportNoteTitle = defineModel<boolean>('exportNoteTitle', { required: true })
const zoom = defineModel<number>('zoom', { required: true })
const fitWidth = defineModel<boolean>('fitWidth', { required: true })

const { t } = useI18n()

const documentToggles = [
  { key: 'toc', label: 'export.tableOfContents', model: tableOfContents },
  { key: 'headings', label: 'export.headingNumbers', model: headingNumbers },
  { key: 'title', label: 'export.titlePage', model: titlePage },
  { key: 'header', label: 'export.runningHeader', model: runningHeader },
  { key: 'pageNumbers', label: 'export.pageNumbers', model: pageNumbers },
  { key: 'exportNoteTitle', label: 'export.exportNoteTitle', model: exportNoteTitle },
]
</script>

<template>
  <aside class="docx-settings">
    <div class="docx-settings__header">
      <h2>{{ title }}</h2>
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
</template>
