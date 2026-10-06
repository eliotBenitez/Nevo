<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { Minus, Plus, RectangleHorizontal, RectangleVertical } from '@lucide/vue'
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
  <aside class="docx-settings tw:flex tw:min-h-0 tw:min-w-0 tw:flex-col tw:gap-3.5 tw:overflow-y-auto tw:bg-(--frame-bg) tw:p-[18px] tw:max-[719px]:max-h-[42dvh]">
    <div class="docx-settings__header tw:pb-1">
      <h2 class="tw:m-0 tw:[font-family:var(--font-serif)] tw:text-lg tw:leading-[1.25] tw:font-normal tw:text-content-primary tw:wrap-anywhere">{{ title }}</h2>
    </div>

    <section class="docx-group tw:grid tw:gap-[11px] tw:rounded-[calc(10px*var(--radius-scale,1))] tw:border tw:border-solid tw:border-transparent tw:bg-transparent tw:px-3 tw:pt-3 tw:pb-[13px]">
      <span class="docx-group__title tw:text-[10px] tw:font-semibold tw:tracking-[0.07em] tw:text-content-muted tw:uppercase">{{ t('export.sections.page') }}</span>

      <div class="docx-field docx-field--row tw:flex tw:items-center tw:justify-between tw:gap-2.5">
        <span class="docx-field__label tw:text-[11px] tw:text-content-muted">{{ t('export.pageSize') }}</span>
        <div class="docx-segment tw:inline-flex tw:rounded-[calc(7px*var(--radius-scale,1))] tw:border tw:border-solid tw:border-transparent tw:bg-(--hover) tw:p-0.5">
          <button
            v-for="fmt in (['A4', 'Letter'] as DocxPaperFormat[])"
            :key="fmt"
            type="button"
            class="docx-segment__btn tw:inline-flex tw:h-6 tw:min-w-0 tw:cursor-pointer tw:items-center tw:gap-1 tw:rounded-[calc(5px*var(--radius-scale,1))] tw:border-0 tw:px-[9px] tw:font-nv-ui tw:text-[11.5px] tw:font-medium tw:transition-colors tw:duration-100"
            :class="paperFormat === fmt ? 'docx-segment__btn--active tw:bg-(--surface-raised) tw:text-content-primary tw:shadow-(--shadow-raised)' : 'tw:bg-transparent tw:text-content-muted'"
            @click="paperFormat = fmt"
          ><span class="docx-segment__btn-text tw:w-full tw:truncate tw:text-center">{{ fmt }}</span></button>
        </div>
      </div>

      <div class="docx-field docx-field--row tw:flex tw:items-center tw:justify-between tw:gap-2.5">
        <span class="docx-field__label tw:text-[11px] tw:text-content-muted">{{ t('export.orientation') }}</span>
        <div class="docx-segment tw:inline-flex tw:rounded-[calc(7px*var(--radius-scale,1))] tw:border tw:border-solid tw:border-transparent tw:bg-(--hover) tw:p-0.5">
          <button
            type="button"
            class="docx-segment__btn docx-segment__btn--icon tw:inline-flex tw:h-6 tw:min-w-0 tw:cursor-pointer tw:items-center tw:justify-center tw:gap-1 tw:rounded-[calc(5px*var(--radius-scale,1))] tw:border-0 tw:px-[9px] tw:font-nv-ui tw:text-[11.5px] tw:font-medium tw:transition-colors tw:duration-100"
            :class="orientation === 'portrait' ? 'docx-segment__btn--active tw:bg-(--surface-raised) tw:text-content-primary tw:shadow-(--shadow-raised)' : 'tw:bg-transparent tw:text-content-muted'"
            :aria-label="t('export.portrait')"
            @click="orientation = 'portrait'"
          >
            <RectangleVertical :size="14" />
          </button>
          <button
            type="button"
            class="docx-segment__btn docx-segment__btn--icon tw:inline-flex tw:h-6 tw:min-w-0 tw:cursor-pointer tw:items-center tw:justify-center tw:gap-1 tw:rounded-[calc(5px*var(--radius-scale,1))] tw:border-0 tw:px-[9px] tw:font-nv-ui tw:text-[11.5px] tw:font-medium tw:transition-colors tw:duration-100"
            :class="orientation === 'landscape' ? 'docx-segment__btn--active tw:bg-(--surface-raised) tw:text-content-primary tw:shadow-(--shadow-raised)' : 'tw:bg-transparent tw:text-content-muted'"
            :aria-label="t('export.landscape')"
            @click="orientation = 'landscape'"
          >
            <RectangleHorizontal :size="14" />
          </button>
        </div>
      </div>

      <div class="docx-field tw:grid tw:gap-[7px]">
        <span class="docx-field__label tw:text-[11px] tw:text-content-muted">{{ t('export.margins') }}</span>
        <div class="docx-margins-grid tw:mt-1 tw:flex tw:flex-col tw:gap-1.5">
          <div class="docx-field docx-field--row tw:flex tw:items-center tw:justify-between tw:gap-2.5">
            <span class="docx-field__label tw:text-[11px] tw:text-content-muted">{{ t('export.marginTop') }}</span>
            <div class="docx-stepper tw:inline-flex tw:items-center tw:overflow-hidden tw:rounded-[calc(7px*var(--radius-scale,1))] tw:border tw:border-solid tw:border-transparent tw:bg-(--hover)">
              <button type="button" class="docx-stepper__btn tw:grid tw:h-[26px] tw:w-7 tw:cursor-pointer tw:place-items-center tw:border-0 tw:bg-transparent tw:text-content-muted tw:transition-colors tw:duration-100 tw:enabled:hover:bg-(--hover-strong) tw:enabled:hover:text-content-primary tw:disabled:cursor-default tw:disabled:opacity-35" :disabled="marginTop <= 0" @click="marginTop = Math.max(0, marginTop - 1)">
                <Minus :size="12" />
              </button>
              <span class="docx-stepper__value tw:inline-flex tw:h-[26px] tw:min-w-[54px] tw:items-center tw:justify-center tw:border-x tw:border-y-0 tw:border-solid tw:border-x-(--border-subtle) tw:px-1 tw:font-nv-mono tw:text-[11.5px] tw:font-medium tw:text-content-secondary">{{ marginTop }} мм</span>
              <button type="button" class="docx-stepper__btn tw:grid tw:h-[26px] tw:w-7 tw:cursor-pointer tw:place-items-center tw:border-0 tw:bg-transparent tw:text-content-muted tw:transition-colors tw:duration-100 tw:enabled:hover:bg-(--hover-strong) tw:enabled:hover:text-content-primary tw:disabled:cursor-default tw:disabled:opacity-35" @click="marginTop++">
                <Plus :size="12" />
              </button>
            </div>
          </div>
          <div class="docx-field docx-field--row tw:flex tw:items-center tw:justify-between tw:gap-2.5">
            <span class="docx-field__label tw:text-[11px] tw:text-content-muted">{{ t('export.marginRight') }}</span>
            <div class="docx-stepper tw:inline-flex tw:items-center tw:overflow-hidden tw:rounded-[calc(7px*var(--radius-scale,1))] tw:border tw:border-solid tw:border-transparent tw:bg-(--hover)">
              <button type="button" class="docx-stepper__btn tw:grid tw:h-[26px] tw:w-7 tw:cursor-pointer tw:place-items-center tw:border-0 tw:bg-transparent tw:text-content-muted tw:transition-colors tw:duration-100 tw:enabled:hover:bg-(--hover-strong) tw:enabled:hover:text-content-primary tw:disabled:cursor-default tw:disabled:opacity-35" :disabled="marginRight <= 0" @click="marginRight = Math.max(0, marginRight - 1)">
                <Minus :size="12" />
              </button>
              <span class="docx-stepper__value tw:inline-flex tw:h-[26px] tw:min-w-[54px] tw:items-center tw:justify-center tw:border-x tw:border-y-0 tw:border-solid tw:border-x-(--border-subtle) tw:px-1 tw:font-nv-mono tw:text-[11.5px] tw:font-medium tw:text-content-secondary">{{ marginRight }} мм</span>
              <button type="button" class="docx-stepper__btn tw:grid tw:h-[26px] tw:w-7 tw:cursor-pointer tw:place-items-center tw:border-0 tw:bg-transparent tw:text-content-muted tw:transition-colors tw:duration-100 tw:enabled:hover:bg-(--hover-strong) tw:enabled:hover:text-content-primary tw:disabled:cursor-default tw:disabled:opacity-35" @click="marginRight++">
                <Plus :size="12" />
              </button>
            </div>
          </div>
          <div class="docx-field docx-field--row tw:flex tw:items-center tw:justify-between tw:gap-2.5">
            <span class="docx-field__label tw:text-[11px] tw:text-content-muted">{{ t('export.marginBottom') }}</span>
            <div class="docx-stepper tw:inline-flex tw:items-center tw:overflow-hidden tw:rounded-[calc(7px*var(--radius-scale,1))] tw:border tw:border-solid tw:border-transparent tw:bg-(--hover)">
              <button type="button" class="docx-stepper__btn tw:grid tw:h-[26px] tw:w-7 tw:cursor-pointer tw:place-items-center tw:border-0 tw:bg-transparent tw:text-content-muted tw:transition-colors tw:duration-100 tw:enabled:hover:bg-(--hover-strong) tw:enabled:hover:text-content-primary tw:disabled:cursor-default tw:disabled:opacity-35" :disabled="marginBottom <= 0" @click="marginBottom = Math.max(0, marginBottom - 1)">
                <Minus :size="12" />
              </button>
              <span class="docx-stepper__value tw:inline-flex tw:h-[26px] tw:min-w-[54px] tw:items-center tw:justify-center tw:border-x tw:border-y-0 tw:border-solid tw:border-x-(--border-subtle) tw:px-1 tw:font-nv-mono tw:text-[11.5px] tw:font-medium tw:text-content-secondary">{{ marginBottom }} мм</span>
              <button type="button" class="docx-stepper__btn tw:grid tw:h-[26px] tw:w-7 tw:cursor-pointer tw:place-items-center tw:border-0 tw:bg-transparent tw:text-content-muted tw:transition-colors tw:duration-100 tw:enabled:hover:bg-(--hover-strong) tw:enabled:hover:text-content-primary tw:disabled:cursor-default tw:disabled:opacity-35" @click="marginBottom++">
                <Plus :size="12" />
              </button>
            </div>
          </div>
          <div class="docx-field docx-field--row tw:flex tw:items-center tw:justify-between tw:gap-2.5">
            <span class="docx-field__label tw:text-[11px] tw:text-content-muted">{{ t('export.marginLeft') }}</span>
            <div class="docx-stepper tw:inline-flex tw:items-center tw:overflow-hidden tw:rounded-[calc(7px*var(--radius-scale,1))] tw:border tw:border-solid tw:border-transparent tw:bg-(--hover)">
              <button type="button" class="docx-stepper__btn tw:grid tw:h-[26px] tw:w-7 tw:cursor-pointer tw:place-items-center tw:border-0 tw:bg-transparent tw:text-content-muted tw:transition-colors tw:duration-100 tw:enabled:hover:bg-(--hover-strong) tw:enabled:hover:text-content-primary tw:disabled:cursor-default tw:disabled:opacity-35" :disabled="marginLeft <= 0" @click="marginLeft = Math.max(0, marginLeft - 1)">
                <Minus :size="12" />
              </button>
              <span class="docx-stepper__value tw:inline-flex tw:h-[26px] tw:min-w-[54px] tw:items-center tw:justify-center tw:border-x tw:border-y-0 tw:border-solid tw:border-x-(--border-subtle) tw:px-1 tw:font-nv-mono tw:text-[11.5px] tw:font-medium tw:text-content-secondary">{{ marginLeft }} мм</span>
              <button type="button" class="docx-stepper__btn tw:grid tw:h-[26px] tw:w-7 tw:cursor-pointer tw:place-items-center tw:border-0 tw:bg-transparent tw:text-content-muted tw:transition-colors tw:duration-100 tw:enabled:hover:bg-(--hover-strong) tw:enabled:hover:text-content-primary tw:disabled:cursor-default tw:disabled:opacity-35" @click="marginLeft++">
                <Plus :size="12" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>

    <section class="docx-group tw:grid tw:gap-[11px] tw:rounded-[calc(10px*var(--radius-scale,1))] tw:border tw:border-solid tw:border-transparent tw:bg-transparent tw:px-3 tw:pt-3 tw:pb-[13px]">
      <span class="docx-group__title tw:text-[10px] tw:font-semibold tw:tracking-[0.07em] tw:text-content-muted tw:uppercase">{{ t('export.sections.typography') }}</span>

      <div class="docx-field tw:grid tw:gap-[7px]">
        <span class="docx-field__label tw:text-[11px] tw:text-content-muted">{{ t('export.fontFamily') }}</span>
        <div class="docx-select-wrap tw:relative">
          <select v-model="fontFamily" class="docx-select tw:h-[30px] tw:w-full tw:cursor-pointer tw:appearance-none tw:rounded-[calc(7px*var(--radius-scale,1))] tw:border tw:border-solid tw:border-transparent tw:bg-(--input-bg) tw:pr-7 tw:pl-[9px] tw:font-nv-ui tw:text-xs tw:font-medium tw:text-content-secondary tw:focus-visible:border-accent tw:focus-visible:outline-none">
            <option value="">{{ t('export.fontDefault') }} (Calibri)</option>
            <option v-for="f in systemFonts" :key="f" :value="f">{{ f }}</option>
          </select>
        </div>
      </div>

      <div class="docx-field docx-field--row tw:flex tw:items-center tw:justify-between tw:gap-2.5">
        <span class="docx-field__label tw:text-[11px] tw:text-content-muted">{{ t('export.fontSize') }}</span>
        <div class="docx-stepper tw:inline-flex tw:items-center tw:overflow-hidden tw:rounded-[calc(7px*var(--radius-scale,1))] tw:border tw:border-solid tw:border-transparent tw:bg-(--hover)">
          <button type="button" class="docx-stepper__btn tw:grid tw:h-[26px] tw:w-7 tw:cursor-pointer tw:place-items-center tw:border-0 tw:bg-transparent tw:text-content-muted tw:transition-colors tw:duration-100 tw:enabled:hover:bg-(--hover-strong) tw:enabled:hover:text-content-primary tw:disabled:cursor-default tw:disabled:opacity-35" :disabled="fontSize <= 9" @click="fontSize = Math.max(9, fontSize - 1)">
            <Minus :size="12" />
          </button>
          <span class="docx-stepper__value tw:inline-flex tw:h-[26px] tw:min-w-[54px] tw:items-center tw:justify-center tw:border-x tw:border-y-0 tw:border-solid tw:border-x-(--border-subtle) tw:px-1 tw:font-nv-mono tw:text-[11.5px] tw:font-medium tw:text-content-secondary">{{ fontSize }}pt</span>
          <button type="button" class="docx-stepper__btn tw:grid tw:h-[26px] tw:w-7 tw:cursor-pointer tw:place-items-center tw:border-0 tw:bg-transparent tw:text-content-muted tw:transition-colors tw:duration-100 tw:enabled:hover:bg-(--hover-strong) tw:enabled:hover:text-content-primary tw:disabled:cursor-default tw:disabled:opacity-35" :disabled="fontSize >= 16" @click="fontSize = Math.min(16, fontSize + 1)">
            <Plus :size="12" />
          </button>
        </div>
      </div>

      <div class="docx-field docx-field--row tw:flex tw:items-center tw:justify-between tw:gap-2.5">
        <span class="docx-field__label tw:text-[11px] tw:text-content-muted">{{ t('export.lineSpacing') }}</span>
        <div class="docx-stepper tw:inline-flex tw:items-center tw:overflow-hidden tw:rounded-[calc(7px*var(--radius-scale,1))] tw:border tw:border-solid tw:border-transparent tw:bg-(--hover)">
          <button type="button" class="docx-stepper__btn tw:grid tw:h-[26px] tw:w-7 tw:cursor-pointer tw:place-items-center tw:border-0 tw:bg-transparent tw:text-content-muted tw:transition-colors tw:duration-100 tw:enabled:hover:bg-(--hover-strong) tw:enabled:hover:text-content-primary tw:disabled:cursor-default tw:disabled:opacity-35" :disabled="lineSpacing <= 0.5" @click="lineSpacing = Math.max(0.5, parseFloat((lineSpacing - 0.05).toFixed(2)))">
            <Minus :size="12" />
          </button>
          <span class="docx-stepper__value tw:inline-flex tw:h-[26px] tw:min-w-[54px] tw:items-center tw:justify-center tw:border-x tw:border-y-0 tw:border-solid tw:border-x-(--border-subtle) tw:px-1 tw:font-nv-mono tw:text-[11.5px] tw:font-medium tw:text-content-secondary">{{ lineSpacing.toFixed(2) }}</span>
          <button type="button" class="docx-stepper__btn tw:grid tw:h-[26px] tw:w-7 tw:cursor-pointer tw:place-items-center tw:border-0 tw:bg-transparent tw:text-content-muted tw:transition-colors tw:duration-100 tw:enabled:hover:bg-(--hover-strong) tw:enabled:hover:text-content-primary tw:disabled:cursor-default tw:disabled:opacity-35" :disabled="lineSpacing >= 3.0" @click="lineSpacing = Math.min(3.0, parseFloat((lineSpacing + 0.05).toFixed(2)))">
            <Plus :size="12" />
          </button>
        </div>
      </div>

      <div class="docx-field docx-field--row tw:flex tw:items-center tw:justify-between tw:gap-2.5">
        <span class="docx-field__label tw:text-[11px] tw:text-content-muted">{{ t('export.paragraphSpacing') }}</span>
        <div class="docx-stepper tw:inline-flex tw:items-center tw:overflow-hidden tw:rounded-[calc(7px*var(--radius-scale,1))] tw:border tw:border-solid tw:border-transparent tw:bg-(--hover)">
          <button type="button" class="docx-stepper__btn tw:grid tw:h-[26px] tw:w-7 tw:cursor-pointer tw:place-items-center tw:border-0 tw:bg-transparent tw:text-content-muted tw:transition-colors tw:duration-100 tw:enabled:hover:bg-(--hover-strong) tw:enabled:hover:text-content-primary tw:disabled:cursor-default tw:disabled:opacity-35" :disabled="paragraphSpacing <= 0" @click="paragraphSpacing = Math.max(0, paragraphSpacing - 1)">
            <Minus :size="12" />
          </button>
          <span class="docx-stepper__value tw:inline-flex tw:h-[26px] tw:min-w-[54px] tw:items-center tw:justify-center tw:border-x tw:border-y-0 tw:border-solid tw:border-x-(--border-subtle) tw:px-1 tw:font-nv-mono tw:text-[11.5px] tw:font-medium tw:text-content-secondary">{{ paragraphSpacing }} pt</span>
          <button type="button" class="docx-stepper__btn tw:grid tw:h-[26px] tw:w-7 tw:cursor-pointer tw:place-items-center tw:border-0 tw:bg-transparent tw:text-content-muted tw:transition-colors tw:duration-100 tw:enabled:hover:bg-(--hover-strong) tw:enabled:hover:text-content-primary tw:disabled:cursor-default tw:disabled:opacity-35" :disabled="paragraphSpacing >= 48" @click="paragraphSpacing = Math.min(48, paragraphSpacing + 1)">
            <Plus :size="12" />
          </button>
        </div>
      </div>
    </section>

    <section class="docx-group tw:grid tw:gap-[11px] tw:rounded-[calc(10px*var(--radius-scale,1))] tw:border tw:border-solid tw:border-transparent tw:bg-transparent tw:px-3 tw:pt-3 tw:pb-[13px]">
      <span class="docx-group__title tw:text-[10px] tw:font-semibold tw:tracking-[0.07em] tw:text-content-muted tw:uppercase">{{ t('export.sections.document') }}</span>

      <label
        v-for="toggle in documentToggles"
        :key="toggle.key"
        class="docx-toggle tw:flex tw:cursor-pointer tw:items-center tw:justify-between tw:gap-2.5 tw:text-xs tw:text-content-secondary tw:select-none"
        :class="{ 'docx-toggle--active': toggle.model.value }"
      >
        <span class="docx-toggle__label tw:text-[12.5px] tw:transition-colors tw:duration-150" :class="toggle.model.value ? 'tw:text-content-primary' : 'tw:text-content-muted'">{{ t(toggle.label) }}</span>
        <span class="toggle tw:relative tw:inline-flex">
          <input v-model="toggle.model.value" class="tw:peer tw:absolute tw:inset-0 tw:m-0 tw:cursor-pointer tw:opacity-0" type="checkbox" />
          <span class="toggle-ui tw:relative tw:h-[18px] tw:w-8 tw:rounded-full tw:border tw:border-solid tw:border-transparent tw:bg-(--hover-strong) tw:transition-[background,border-color] tw:duration-150 tw:peer-checked:border-accent tw:peer-checked:bg-accent tw:peer-focus-visible:outline-2 tw:peer-focus-visible:outline-offset-2 tw:peer-focus-visible:outline-focus-ring tw:after:absolute tw:after:top-px tw:after:left-px tw:after:size-3.5 tw:after:rounded-full tw:after:bg-white tw:after:shadow-(--shadow-raised) tw:after:transition-[left] tw:after:duration-150 tw:after:ease-[cubic-bezier(.2,.7,.3,1)] tw:after:content-[''] tw:peer-checked:after:left-[15px]" />
        </span>
      </label>
    </section>

    <section class="docx-group tw:grid tw:gap-[11px] tw:rounded-[calc(10px*var(--radius-scale,1))] tw:border tw:border-solid tw:border-transparent tw:bg-transparent tw:px-3 tw:pt-3 tw:pb-[13px]">
      <span class="docx-group__title tw:text-[10px] tw:font-semibold tw:tracking-[0.07em] tw:text-content-muted tw:uppercase">{{ t('export.sections.preview') }}</span>

      <div class="docx-field docx-field--row tw:flex tw:items-center tw:justify-between tw:gap-2.5">
        <span class="docx-field__label tw:text-[11px] tw:text-content-muted">{{ t('export.previewZoom') }}</span>
        <div class="docx-stepper tw:inline-flex tw:items-center tw:overflow-hidden tw:rounded-[calc(7px*var(--radius-scale,1))] tw:border tw:border-solid tw:border-transparent tw:bg-(--hover)">
          <button type="button" class="docx-stepper__btn tw:grid tw:h-[26px] tw:w-7 tw:cursor-pointer tw:place-items-center tw:border-0 tw:bg-transparent tw:text-content-muted tw:transition-colors tw:duration-100 tw:enabled:hover:bg-(--hover-strong) tw:enabled:hover:text-content-primary tw:disabled:cursor-default tw:disabled:opacity-35" :disabled="zoom <= 50 || fitWidth" @click="zoom = Math.max(50, zoom - 10)">
            <Minus :size="12" />
          </button>
          <span class="docx-stepper__value tw:inline-flex tw:h-[26px] tw:min-w-[54px] tw:items-center tw:justify-center tw:border-x tw:border-y-0 tw:border-solid tw:border-x-(--border-subtle) tw:px-1 tw:font-nv-mono tw:text-[11.5px] tw:font-medium tw:text-content-secondary">{{ zoom }}%</span>
          <button type="button" class="docx-stepper__btn tw:grid tw:h-[26px] tw:w-7 tw:cursor-pointer tw:place-items-center tw:border-0 tw:bg-transparent tw:text-content-muted tw:transition-colors tw:duration-100 tw:enabled:hover:bg-(--hover-strong) tw:enabled:hover:text-content-primary tw:disabled:cursor-default tw:disabled:opacity-35" :disabled="zoom >= 150 || fitWidth" @click="zoom = Math.min(150, zoom + 10)">
            <Plus :size="12" />
          </button>
        </div>
      </div>

      <label class="docx-toggle tw:flex tw:cursor-pointer tw:items-center tw:justify-between tw:gap-2.5 tw:text-xs tw:text-content-secondary tw:select-none" :class="{ 'docx-toggle--active': fitWidth }">
        <span class="docx-toggle__label tw:text-[12.5px] tw:transition-colors tw:duration-150" :class="fitWidth ? 'tw:text-content-primary' : 'tw:text-content-muted'">{{ t('export.fitWidth') }}</span>
        <span class="toggle">
          <input v-model="fitWidth" class="tw:accent-accent" type="checkbox" />
          <span class="toggle-ui" />
        </span>
      </label>
    </section>
  </aside>
</template>
