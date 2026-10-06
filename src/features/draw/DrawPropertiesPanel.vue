<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import {
  AlignStartVertical,
  AlignCenterVertical,
  AlignEndVertical,
  AlignStartHorizontal,
  AlignCenterHorizontal,
  AlignEndHorizontal,
  AlignHorizontalSpaceAround,
  AlignVerticalSpaceAround,
  FlipHorizontal2,
  FlipVertical2,
  Group,
  Ungroup,
  Lock,
  Unlock,
  ArrowLeft,
  ArrowRight,
  Dot,
  Minus,
} from '@lucide/vue'
import NvColorPicker from '../../ui/primitives/NvColorPicker.vue'
import type { ColorOption } from '../../utils/colorConversion'
import type { DrawArrowShape, DrawArrowCap, DrawFillStyle, DrawStrokeStyle } from '../../utils/draw/drawEngine'

const props = defineProps<{
  activeStyle: {
    color: string
    size: number
    fillColor: string
    fillStyle: DrawFillStyle
    strokeStyle: DrawStrokeStyle
    opacity: number
    roughness: number
    arrowShape: DrawArrowShape
    startCap: DrawArrowCap
    endCap: DrawArrowCap
    fontFamily: string
    fontSize: number
  }
  palette: string[]
  showFill: boolean
  showGeometry: boolean
  showArrow: boolean
  showText: boolean
  selectionCount: number
  canGroup: boolean
  canUngroup: boolean
  canAlign: boolean
  canDistribute: boolean
  hasLocked: boolean
  hasUnlocked: boolean
}>()

const emit = defineEmits<{
  'update:strokeColor': [v: string]
  'update:fillColor': [v: string]
  'update:fillStyle': [v: DrawFillStyle]
  'update:size': [v: number]
  'update:strokeStyle': [v: DrawStrokeStyle]
  'update:opacity': [v: number]
  'update:roughness': [v: number]
  'update:arrowShape': [v: DrawArrowShape]
  'update:startCap': [v: DrawArrowCap]
  'update:endCap': [v: DrawArrowCap]
  'update:fontFamily': [v: string]
  'update:fontSize': [v: number]
  'align': [mode: 'left' | 'centerH' | 'right' | 'top' | 'centerV' | 'bottom']
  'distribute': [axis: 'h' | 'v']
  'flip': [axis: 'h' | 'v']
  'group': []
  'ungroup': []
  'lock': []
  'unlock': []
}>()

const { t } = useI18n()

// Опции цвета обводки из палитры редактора
const strokeColorOptions = (): ColorOption[] => props.palette.map((c) => ({ color: c }))

// Roughness: три уровня — Архитектор, Художник, Карикатурист
const ROUGHNESS_LEVELS = [0, 1.5, 3] as const

function activeRoughnessIndex(): number {
  const r = props.activeStyle.roughness
  let minDist = Infinity
  let idx = 0
  ROUGHNESS_LEVELS.forEach((val, i) => {
    const d = Math.abs(r - val)
    if (d < minDist) { minDist = d; idx = i }
  })
  return idx
}
</script>

<template>
  <div class="draw-properties tw:absolute tw:left-4 tw:top-1/2 tw:z-6 tw:flex tw:flex-col tw:gap-2.5 tw:w-[200px] tw:max-h-[calc(100%-120px)] tw:overflow-y-auto tw:p-3 tw:border tw:border-solid tw:border-transparent tw:rounded-[14px] tw:bg-(--menu-bg) tw:shadow-(--shadow-overlay) tw:box-border tw:-translate-y-1/2 tw:max-[719px]:top-auto tw:max-[719px]:right-[calc(12px+max(var(--safe-area-right),0px))] tw:max-[719px]:bottom-[calc(84px+max(var(--safe-area-bottom),0px))] tw:max-[719px]:left-[calc(12px+max(var(--safe-area-left),0px))] tw:max-[719px]:w-auto tw:max-[719px]:max-h-[min(38vh,330px)] tw:max-[719px]:translate-y-0">
    <!-- Секция: Действия (выравнивание, распределение, отражение, группировка, блокировка) -->
    <div v-if="selectionCount > 0" class="draw-properties__section tw:flex tw:flex-col tw:gap-1.5">
      <div class="draw-properties__label tw:text-[11px] tw:font-medium tw:text-content-muted tw:uppercase tw:tracking-[0.04em] tw:select-none">{{ t('editor.draw.actions.title') }}</div>

      <!-- Ряд выравнивания (6 кнопок) — только при ≥2 не-заблокированных -->
      <div v-if="canAlign" class="draw-properties__segs tw:flex tw:flex-row tw:gap-1 tw:flex-wrap">
        <button
          type="button"
          class="draw-properties__seg draw-properties__seg--icon tw:flex-1 tw:min-w-0 tw:h-7 tw:border tw:border-solid tw:rounded-md tw:text-[11px] tw:cursor-pointer tw:transition-colors tw:duration-100 tw:whitespace-nowrap tw:overflow-hidden tw:[text-overflow:ellipsis] tw:inline-flex tw:items-center tw:justify-center tw:p-0 tw:text-content-secondary tw:bg-transparent tw:border-transparent tw:hover:bg-(--hover-strong) tw:hover:text-content-primary"
          :title="t('editor.draw.actions.alignLeft')"
          @click="emit('align', 'left')"
        ><component :is="AlignStartVertical" :size="16" /></button>
        <button
          type="button"
          class="draw-properties__seg draw-properties__seg--icon tw:flex-1 tw:min-w-0 tw:h-7 tw:border tw:border-solid tw:rounded-md tw:text-[11px] tw:cursor-pointer tw:transition-colors tw:duration-100 tw:whitespace-nowrap tw:overflow-hidden tw:[text-overflow:ellipsis] tw:inline-flex tw:items-center tw:justify-center tw:p-0 tw:text-content-secondary tw:bg-transparent tw:border-transparent tw:hover:bg-(--hover-strong) tw:hover:text-content-primary"
          :title="t('editor.draw.actions.alignCenterH')"
          @click="emit('align', 'centerH')"
        ><component :is="AlignCenterVertical" :size="16" /></button>
        <button
          type="button"
          class="draw-properties__seg draw-properties__seg--icon tw:flex-1 tw:min-w-0 tw:h-7 tw:border tw:border-solid tw:rounded-md tw:text-[11px] tw:cursor-pointer tw:transition-colors tw:duration-100 tw:whitespace-nowrap tw:overflow-hidden tw:[text-overflow:ellipsis] tw:inline-flex tw:items-center tw:justify-center tw:p-0 tw:text-content-secondary tw:bg-transparent tw:border-transparent tw:hover:bg-(--hover-strong) tw:hover:text-content-primary"
          :title="t('editor.draw.actions.alignRight')"
          @click="emit('align', 'right')"
        ><component :is="AlignEndVertical" :size="16" /></button>
        <button
          type="button"
          class="draw-properties__seg draw-properties__seg--icon tw:flex-1 tw:min-w-0 tw:h-7 tw:border tw:border-solid tw:rounded-md tw:text-[11px] tw:cursor-pointer tw:transition-colors tw:duration-100 tw:whitespace-nowrap tw:overflow-hidden tw:[text-overflow:ellipsis] tw:inline-flex tw:items-center tw:justify-center tw:p-0 tw:text-content-secondary tw:bg-transparent tw:border-transparent tw:hover:bg-(--hover-strong) tw:hover:text-content-primary"
          :title="t('editor.draw.actions.alignTop')"
          @click="emit('align', 'top')"
        ><component :is="AlignStartHorizontal" :size="16" /></button>
        <button
          type="button"
          class="draw-properties__seg draw-properties__seg--icon tw:flex-1 tw:min-w-0 tw:h-7 tw:border tw:border-solid tw:rounded-md tw:text-[11px] tw:cursor-pointer tw:transition-colors tw:duration-100 tw:whitespace-nowrap tw:overflow-hidden tw:[text-overflow:ellipsis] tw:inline-flex tw:items-center tw:justify-center tw:p-0 tw:text-content-secondary tw:bg-transparent tw:border-transparent tw:hover:bg-(--hover-strong) tw:hover:text-content-primary"
          :title="t('editor.draw.actions.alignCenterV')"
          @click="emit('align', 'centerV')"
        ><component :is="AlignCenterHorizontal" :size="16" /></button>
        <button
          type="button"
          class="draw-properties__seg draw-properties__seg--icon tw:flex-1 tw:min-w-0 tw:h-7 tw:border tw:border-solid tw:rounded-md tw:text-[11px] tw:cursor-pointer tw:transition-colors tw:duration-100 tw:whitespace-nowrap tw:overflow-hidden tw:[text-overflow:ellipsis] tw:inline-flex tw:items-center tw:justify-center tw:p-0 tw:text-content-secondary tw:bg-transparent tw:border-transparent tw:hover:bg-(--hover-strong) tw:hover:text-content-primary"
          :title="t('editor.draw.actions.alignBottom')"
          @click="emit('align', 'bottom')"
        ><component :is="AlignEndHorizontal" :size="16" /></button>
      </div>

      <!-- Ряд распределения (2 кнопки) — только при ≥3 не-заблокированных -->
      <div v-if="canDistribute" class="draw-properties__segs tw:flex tw:flex-row tw:gap-1 tw:flex-wrap">
        <button
          type="button"
          class="draw-properties__seg draw-properties__seg--icon tw:flex-1 tw:min-w-0 tw:h-7 tw:border tw:border-solid tw:rounded-md tw:text-[11px] tw:cursor-pointer tw:transition-colors tw:duration-100 tw:whitespace-nowrap tw:overflow-hidden tw:[text-overflow:ellipsis] tw:inline-flex tw:items-center tw:justify-center tw:p-0 tw:text-content-secondary tw:bg-transparent tw:border-transparent tw:hover:bg-(--hover-strong) tw:hover:text-content-primary"
          :title="t('editor.draw.actions.distributeH')"
          @click="emit('distribute', 'h')"
        ><component :is="AlignHorizontalSpaceAround" :size="16" /></button>
        <button
          type="button"
          class="draw-properties__seg draw-properties__seg--icon tw:flex-1 tw:min-w-0 tw:h-7 tw:border tw:border-solid tw:rounded-md tw:text-[11px] tw:cursor-pointer tw:transition-colors tw:duration-100 tw:whitespace-nowrap tw:overflow-hidden tw:[text-overflow:ellipsis] tw:inline-flex tw:items-center tw:justify-center tw:p-0 tw:text-content-secondary tw:bg-transparent tw:border-transparent tw:hover:bg-(--hover-strong) tw:hover:text-content-primary"
          :title="t('editor.draw.actions.distributeV')"
          @click="emit('distribute', 'v')"
        ><component :is="AlignVerticalSpaceAround" :size="16" /></button>
      </div>

      <!-- Ряд отражения (2 кнопки) — всегда при выделении -->
      <div class="draw-properties__segs tw:flex tw:flex-row tw:gap-1 tw:flex-wrap">
        <button
          type="button"
          class="draw-properties__seg draw-properties__seg--icon tw:flex-1 tw:min-w-0 tw:h-7 tw:border tw:border-solid tw:rounded-md tw:text-[11px] tw:cursor-pointer tw:transition-colors tw:duration-100 tw:whitespace-nowrap tw:overflow-hidden tw:[text-overflow:ellipsis] tw:inline-flex tw:items-center tw:justify-center tw:p-0 tw:text-content-secondary tw:bg-transparent tw:border-transparent tw:hover:bg-(--hover-strong) tw:hover:text-content-primary"
          :title="t('editor.draw.actions.flipH')"
          @click="emit('flip', 'h')"
        ><component :is="FlipHorizontal2" :size="16" /></button>
        <button
          type="button"
          class="draw-properties__seg draw-properties__seg--icon tw:flex-1 tw:min-w-0 tw:h-7 tw:border tw:border-solid tw:rounded-md tw:text-[11px] tw:cursor-pointer tw:transition-colors tw:duration-100 tw:whitespace-nowrap tw:overflow-hidden tw:[text-overflow:ellipsis] tw:inline-flex tw:items-center tw:justify-center tw:p-0 tw:text-content-secondary tw:bg-transparent tw:border-transparent tw:hover:bg-(--hover-strong) tw:hover:text-content-primary"
          :title="t('editor.draw.actions.flipV')"
          @click="emit('flip', 'v')"
        ><component :is="FlipVertical2" :size="16" /></button>
      </div>

      <!-- Ряд группировки и блокировки -->
      <div class="draw-properties__segs tw:flex tw:flex-row tw:gap-1 tw:flex-wrap">
        <button
          v-if="canGroup"
          type="button"
          class="draw-properties__seg draw-properties__seg--icon tw:flex-1 tw:min-w-0 tw:h-7 tw:border tw:border-solid tw:rounded-md tw:text-[11px] tw:cursor-pointer tw:transition-colors tw:duration-100 tw:whitespace-nowrap tw:overflow-hidden tw:[text-overflow:ellipsis] tw:inline-flex tw:items-center tw:justify-center tw:p-0 tw:text-content-secondary tw:bg-transparent tw:border-transparent tw:hover:bg-(--hover-strong) tw:hover:text-content-primary"
          :title="t('editor.draw.actions.group')"
          @click="emit('group')"
        ><component :is="Group" :size="16" /></button>
        <button
          v-if="canUngroup"
          type="button"
          class="draw-properties__seg draw-properties__seg--icon tw:flex-1 tw:min-w-0 tw:h-7 tw:border tw:border-solid tw:rounded-md tw:text-[11px] tw:cursor-pointer tw:transition-colors tw:duration-100 tw:whitespace-nowrap tw:overflow-hidden tw:[text-overflow:ellipsis] tw:inline-flex tw:items-center tw:justify-center tw:p-0 tw:text-content-secondary tw:bg-transparent tw:border-transparent tw:hover:bg-(--hover-strong) tw:hover:text-content-primary"
          :title="t('editor.draw.actions.ungroup')"
          @click="emit('ungroup')"
        ><component :is="Ungroup" :size="16" /></button>
        <button
          v-if="hasUnlocked"
          type="button"
          class="draw-properties__seg draw-properties__seg--icon tw:flex-1 tw:min-w-0 tw:h-7 tw:border tw:border-solid tw:rounded-md tw:text-[11px] tw:cursor-pointer tw:transition-colors tw:duration-100 tw:whitespace-nowrap tw:overflow-hidden tw:[text-overflow:ellipsis] tw:inline-flex tw:items-center tw:justify-center tw:p-0 tw:text-content-secondary tw:bg-transparent tw:border-transparent tw:hover:bg-(--hover-strong) tw:hover:text-content-primary"
          :title="t('editor.draw.actions.lock')"
          @click="emit('lock')"
        ><component :is="Lock" :size="16" /></button>
        <button
          v-if="hasLocked"
          type="button"
          class="draw-properties__seg draw-properties__seg--icon tw:flex-1 tw:min-w-0 tw:h-7 tw:border tw:border-solid tw:rounded-md tw:text-[11px] tw:cursor-pointer tw:transition-colors tw:duration-100 tw:whitespace-nowrap tw:overflow-hidden tw:[text-overflow:ellipsis] tw:inline-flex tw:items-center tw:justify-center tw:p-0 tw:text-content-secondary tw:bg-transparent tw:border-transparent tw:hover:bg-(--hover-strong) tw:hover:text-content-primary"
          :title="t('editor.draw.actions.unlock')"
          @click="emit('unlock')"
        ><component :is="Unlock" :size="16" /></button>
      </div>
    </div>

    <!-- Секция: Обводка -->
    <div class="draw-properties__section tw:flex tw:flex-col tw:gap-1.5">
      <div class="draw-properties__label tw:text-[11px] tw:font-medium tw:text-content-muted tw:uppercase tw:tracking-[0.04em] tw:select-none">{{ t('editor.draw.props.stroke') }}</div>
      <NvColorPicker
        :model-value="activeStyle.color"
        :colors="strokeColorOptions()"
        display="popover"
        @update:model-value="(v) => emit('update:strokeColor', v ?? '#1e1e1e')"
      />
    </div>

    <!-- Секция: Заливка (только для замкнутых фигур) -->
    <template v-if="showFill">
      <div class="draw-properties__section tw:flex tw:flex-col tw:gap-1.5">
        <div class="draw-properties__label tw:text-[11px] tw:font-medium tw:text-content-muted tw:uppercase tw:tracking-[0.04em] tw:select-none">{{ t('editor.draw.props.fill') }}</div>
        <NvColorPicker
          :model-value="activeStyle.fillColor === 'transparent' ? null : activeStyle.fillColor"
          :colors="strokeColorOptions()"
          :allow-none="true"
          display="popover"
          @update:model-value="(v) => emit('update:fillColor', v ?? 'transparent')"
        />
        <!-- Стиль заливки: hachure / solid / cross-hatch -->
        <div class="draw-properties__segs tw:flex tw:flex-row tw:gap-1 tw:flex-wrap">
          <button
            type="button"
            class="draw-properties__seg tw:flex-1 tw:min-w-0 tw:h-7 tw:px-1.5 tw:border tw:border-solid tw:rounded-md tw:text-[11px] tw:cursor-pointer tw:transition-colors tw:duration-100 tw:whitespace-nowrap tw:overflow-hidden tw:[text-overflow:ellipsis]"
            :class="(activeStyle.fillStyle === 'hachure') ? 'is-active tw:bg-[color-mix(in_oklab,var(--accent)_18%,transparent)] tw:text-accent tw:border-[color-mix(in_oklab,var(--accent)_40%,transparent)]' : 'tw:text-content-secondary tw:bg-transparent tw:border-transparent tw:hover:bg-(--hover-strong) tw:hover:text-content-primary'"
            :title="t('editor.draw.props.hachure')"
            @click="emit('update:fillStyle', 'hachure')"
          >{{ t('editor.draw.props.hachure') }}</button>
          <button
            type="button"
            class="draw-properties__seg tw:flex-1 tw:min-w-0 tw:h-7 tw:px-1.5 tw:border tw:border-solid tw:rounded-md tw:text-[11px] tw:cursor-pointer tw:transition-colors tw:duration-100 tw:whitespace-nowrap tw:overflow-hidden tw:[text-overflow:ellipsis]"
            :class="(activeStyle.fillStyle === 'solid') ? 'is-active tw:bg-[color-mix(in_oklab,var(--accent)_18%,transparent)] tw:text-accent tw:border-[color-mix(in_oklab,var(--accent)_40%,transparent)]' : 'tw:text-content-secondary tw:bg-transparent tw:border-transparent tw:hover:bg-(--hover-strong) tw:hover:text-content-primary'"
            :title="t('editor.draw.props.fillSolid')"
            @click="emit('update:fillStyle', 'solid')"
          >{{ t('editor.draw.props.fillSolid') }}</button>
          <button
            type="button"
            class="draw-properties__seg tw:flex-1 tw:min-w-0 tw:h-7 tw:px-1.5 tw:border tw:border-solid tw:rounded-md tw:text-[11px] tw:cursor-pointer tw:transition-colors tw:duration-100 tw:whitespace-nowrap tw:overflow-hidden tw:[text-overflow:ellipsis]"
            :class="(activeStyle.fillStyle === 'cross-hatch') ? 'is-active tw:bg-[color-mix(in_oklab,var(--accent)_18%,transparent)] tw:text-accent tw:border-[color-mix(in_oklab,var(--accent)_40%,transparent)]' : 'tw:text-content-secondary tw:bg-transparent tw:border-transparent tw:hover:bg-(--hover-strong) tw:hover:text-content-primary'"
            :title="t('editor.draw.props.crossHatch')"
            @click="emit('update:fillStyle', 'cross-hatch')"
          >{{ t('editor.draw.props.crossHatch') }}</button>
        </div>
      </div>
    </template>

    <!-- Секция: Толщина -->
    <div v-if="!showText" class="draw-properties__section tw:flex tw:flex-col tw:gap-1.5">
      <div class="draw-properties__label tw:text-[11px] tw:font-medium tw:text-content-muted tw:uppercase tw:tracking-[0.04em] tw:select-none">{{ t('editor.draw.props.width') }}</div>
      <input
        type="range"
        class="draw-properties__range tw:w-full tw:accent-(--accent) tw:cursor-pointer"
        min="1"
        max="30"
        step="1"
        :value="activeStyle.size"
        @input="emit('update:size', Number(($event.target as HTMLInputElement).value))"
      >
    </div>

    <!-- Секция: Шрифт (семейство шрифтов) -->
    <div v-if="showText" class="draw-properties__section tw:flex tw:flex-col tw:gap-1.5">
      <div class="draw-properties__label tw:text-[11px] tw:font-medium tw:text-content-muted tw:uppercase tw:tracking-[0.04em] tw:select-none">{{ t('editor.draw.props.fontFamily') }}</div>
      <div class="draw-properties__segs tw:flex tw:flex-row tw:gap-1 tw:flex-wrap">
        <button
          type="button"
          class="draw-properties__seg tw:flex-1 tw:min-w-0 tw:h-7 tw:px-1.5 tw:border tw:border-solid tw:rounded-md tw:text-[11px] tw:cursor-pointer tw:transition-colors tw:duration-100 tw:whitespace-nowrap tw:overflow-hidden tw:[text-overflow:ellipsis]"
          :class="(activeStyle.fontFamily === 'sans-serif') ? 'is-active tw:bg-[color-mix(in_oklab,var(--accent)_18%,transparent)] tw:text-accent tw:border-[color-mix(in_oklab,var(--accent)_40%,transparent)]' : 'tw:text-content-secondary tw:bg-transparent tw:border-transparent tw:hover:bg-(--hover-strong) tw:hover:text-content-primary'"
          :title="t('editor.draw.props.sansSerif')"
          @click="emit('update:fontFamily', 'sans-serif')"
        >{{ t('editor.draw.props.sansSerif') }}</button>
        <button
          type="button"
          class="draw-properties__seg tw:flex-1 tw:min-w-0 tw:h-7 tw:px-1.5 tw:border tw:border-solid tw:rounded-md tw:text-[11px] tw:cursor-pointer tw:transition-colors tw:duration-100 tw:whitespace-nowrap tw:overflow-hidden tw:[text-overflow:ellipsis]"
          :class="(activeStyle.fontFamily === 'serif') ? 'is-active tw:bg-[color-mix(in_oklab,var(--accent)_18%,transparent)] tw:text-accent tw:border-[color-mix(in_oklab,var(--accent)_40%,transparent)]' : 'tw:text-content-secondary tw:bg-transparent tw:border-transparent tw:hover:bg-(--hover-strong) tw:hover:text-content-primary'"
          :title="t('editor.draw.props.serif')"
          @click="emit('update:fontFamily', 'serif')"
        >{{ t('editor.draw.props.serif') }}</button>
        <button
          type="button"
          class="draw-properties__seg tw:flex-1 tw:min-w-0 tw:h-7 tw:px-1.5 tw:border tw:border-solid tw:rounded-md tw:text-[11px] tw:cursor-pointer tw:transition-colors tw:duration-100 tw:whitespace-nowrap tw:overflow-hidden tw:[text-overflow:ellipsis]"
          :class="(activeStyle.fontFamily === 'monospace') ? 'is-active tw:bg-[color-mix(in_oklab,var(--accent)_18%,transparent)] tw:text-accent tw:border-[color-mix(in_oklab,var(--accent)_40%,transparent)]' : 'tw:text-content-secondary tw:bg-transparent tw:border-transparent tw:hover:bg-(--hover-strong) tw:hover:text-content-primary'"
          :title="t('editor.draw.props.monospace')"
          @click="emit('update:fontFamily', 'monospace')"
        >{{ t('editor.draw.props.monospace') }}</button>
      </div>
    </div>

    <!-- Секция: Размер текста -->
    <div v-if="showText" class="draw-properties__section tw:flex tw:flex-col tw:gap-1.5">
      <div class="draw-properties__label tw:text-[11px] tw:font-medium tw:text-content-muted tw:uppercase tw:tracking-[0.04em] tw:select-none">{{ t('editor.draw.props.fontSize') }}</div>
      <input
        type="range"
        class="draw-properties__range tw:w-full tw:accent-(--accent) tw:cursor-pointer"
        min="12"
        max="120"
        step="1"
        :value="activeStyle.fontSize"
        @input="emit('update:fontSize', Number(($event.target as HTMLInputElement).value))"
      >
    </div>

    <!-- Секция: Стиль линии (только для roughjs-геометрии) -->
    <div v-if="showGeometry" class="draw-properties__section tw:flex tw:flex-col tw:gap-1.5">
      <div class="draw-properties__label tw:text-[11px] tw:font-medium tw:text-content-muted tw:uppercase tw:tracking-[0.04em] tw:select-none">{{ t('editor.draw.props.lineStyle') }}</div>
      <div class="draw-properties__segs tw:flex tw:flex-row tw:gap-1 tw:flex-wrap">
        <button
          type="button"
          class="draw-properties__seg tw:flex-1 tw:min-w-0 tw:h-7 tw:px-1.5 tw:border tw:border-solid tw:rounded-md tw:text-[11px] tw:cursor-pointer tw:transition-colors tw:duration-100 tw:whitespace-nowrap tw:overflow-hidden tw:[text-overflow:ellipsis]"
          :class="(activeStyle.strokeStyle === 'solid') ? 'is-active tw:bg-[color-mix(in_oklab,var(--accent)_18%,transparent)] tw:text-accent tw:border-[color-mix(in_oklab,var(--accent)_40%,transparent)]' : 'tw:text-content-secondary tw:bg-transparent tw:border-transparent tw:hover:bg-(--hover-strong) tw:hover:text-content-primary'"
          :title="t('editor.draw.props.solid')"
          @click="emit('update:strokeStyle', 'solid')"
        >{{ t('editor.draw.props.solid') }}</button>
        <button
          type="button"
          class="draw-properties__seg tw:flex-1 tw:min-w-0 tw:h-7 tw:px-1.5 tw:border tw:border-solid tw:rounded-md tw:text-[11px] tw:cursor-pointer tw:transition-colors tw:duration-100 tw:whitespace-nowrap tw:overflow-hidden tw:[text-overflow:ellipsis]"
          :class="(activeStyle.strokeStyle === 'dashed') ? 'is-active tw:bg-[color-mix(in_oklab,var(--accent)_18%,transparent)] tw:text-accent tw:border-[color-mix(in_oklab,var(--accent)_40%,transparent)]' : 'tw:text-content-secondary tw:bg-transparent tw:border-transparent tw:hover:bg-(--hover-strong) tw:hover:text-content-primary'"
          :title="t('editor.draw.props.dashed')"
          @click="emit('update:strokeStyle', 'dashed')"
        >{{ t('editor.draw.props.dashed') }}</button>
        <button
          type="button"
          class="draw-properties__seg tw:flex-1 tw:min-w-0 tw:h-7 tw:px-1.5 tw:border tw:border-solid tw:rounded-md tw:text-[11px] tw:cursor-pointer tw:transition-colors tw:duration-100 tw:whitespace-nowrap tw:overflow-hidden tw:[text-overflow:ellipsis]"
          :class="(activeStyle.strokeStyle === 'dotted') ? 'is-active tw:bg-[color-mix(in_oklab,var(--accent)_18%,transparent)] tw:text-accent tw:border-[color-mix(in_oklab,var(--accent)_40%,transparent)]' : 'tw:text-content-secondary tw:bg-transparent tw:border-transparent tw:hover:bg-(--hover-strong) tw:hover:text-content-primary'"
          :title="t('editor.draw.props.dotted')"
          @click="emit('update:strokeStyle', 'dotted')"
        >{{ t('editor.draw.props.dotted') }}</button>
      </div>
    </div>

    <!-- Секция: Тип стрелки (только для инструмента/выделения arrow) -->
    <div v-if="showArrow" class="draw-properties__section tw:flex tw:flex-col tw:gap-1.5">
      <div class="draw-properties__label tw:text-[11px] tw:font-medium tw:text-content-muted tw:uppercase tw:tracking-[0.04em] tw:select-none">{{ t('editor.draw.props.arrowShape') }}</div>
      <div class="draw-properties__segs tw:flex tw:flex-row tw:gap-1 tw:flex-wrap">
        <button
          type="button"
          class="draw-properties__seg tw:flex-1 tw:min-w-0 tw:h-7 tw:px-1.5 tw:border tw:border-solid tw:rounded-md tw:text-[11px] tw:cursor-pointer tw:transition-colors tw:duration-100 tw:whitespace-nowrap tw:overflow-hidden tw:[text-overflow:ellipsis]"
          :class="(activeStyle.arrowShape === 'straight') ? 'is-active tw:bg-[color-mix(in_oklab,var(--accent)_18%,transparent)] tw:text-accent tw:border-[color-mix(in_oklab,var(--accent)_40%,transparent)]' : 'tw:text-content-secondary tw:bg-transparent tw:border-transparent tw:hover:bg-(--hover-strong) tw:hover:text-content-primary'"
          :title="t('editor.draw.props.arrowStraight')"
          @click="emit('update:arrowShape', 'straight')"
        >{{ t('editor.draw.props.arrowStraight') }}</button>
        <button
          type="button"
          class="draw-properties__seg tw:flex-1 tw:min-w-0 tw:h-7 tw:px-1.5 tw:border tw:border-solid tw:rounded-md tw:text-[11px] tw:cursor-pointer tw:transition-colors tw:duration-100 tw:whitespace-nowrap tw:overflow-hidden tw:[text-overflow:ellipsis]"
          :class="(activeStyle.arrowShape === 'orthogonal') ? 'is-active tw:bg-[color-mix(in_oklab,var(--accent)_18%,transparent)] tw:text-accent tw:border-[color-mix(in_oklab,var(--accent)_40%,transparent)]' : 'tw:text-content-secondary tw:bg-transparent tw:border-transparent tw:hover:bg-(--hover-strong) tw:hover:text-content-primary'"
          :title="t('editor.draw.props.arrowElbow')"
          @click="emit('update:arrowShape', 'orthogonal')"
        >{{ t('editor.draw.props.arrowElbow') }}</button>
        <button
          type="button"
          class="draw-properties__seg tw:flex-1 tw:min-w-0 tw:h-7 tw:px-1.5 tw:border tw:border-solid tw:rounded-md tw:text-[11px] tw:cursor-pointer tw:transition-colors tw:duration-100 tw:whitespace-nowrap tw:overflow-hidden tw:[text-overflow:ellipsis]"
          :class="(activeStyle.arrowShape === 'bezier') ? 'is-active tw:bg-[color-mix(in_oklab,var(--accent)_18%,transparent)] tw:text-accent tw:border-[color-mix(in_oklab,var(--accent)_40%,transparent)]' : 'tw:text-content-secondary tw:bg-transparent tw:border-transparent tw:hover:bg-(--hover-strong) tw:hover:text-content-primary'"
          :title="t('editor.draw.props.arrowCurved')"
          @click="emit('update:arrowShape', 'bezier')"
        >{{ t('editor.draw.props.arrowCurved') }}</button>
      </div>
    </div>

    <!-- Секция: Концы стрелки (наконечники начала/конца) -->
    <div v-if="showArrow" class="draw-properties__section tw:flex tw:flex-col tw:gap-1.5">
      <div class="draw-properties__label tw:text-[11px] tw:font-medium tw:text-content-muted tw:uppercase tw:tracking-[0.04em] tw:select-none">{{ t('editor.draw.props.arrowEnds') }}</div>
      <div class="draw-properties__caprow tw:flex tw:flex-col tw:gap-1">
        <span class="draw-properties__sublabel tw:text-[11px] tw:text-content-secondary">{{ t('editor.draw.props.capStart') }}</span>
        <div class="draw-properties__segs tw:flex tw:flex-row tw:gap-1 tw:flex-wrap">
          <button
            type="button"
            class="draw-properties__seg draw-properties__seg--icon tw:flex-1 tw:min-w-0 tw:h-7 tw:border tw:border-solid tw:rounded-md tw:text-[11px] tw:cursor-pointer tw:transition-colors tw:duration-100 tw:whitespace-nowrap tw:overflow-hidden tw:[text-overflow:ellipsis] tw:inline-flex tw:items-center tw:justify-center tw:p-0"
            :class="(activeStyle.startCap === 'arrow') ? 'is-active tw:bg-[color-mix(in_oklab,var(--accent)_18%,transparent)] tw:text-accent tw:border-[color-mix(in_oklab,var(--accent)_40%,transparent)]' : 'tw:text-content-secondary tw:bg-transparent tw:border-transparent tw:hover:bg-(--hover-strong) tw:hover:text-content-primary'"
            :title="t('editor.draw.props.capArrow')"
            @click="emit('update:startCap', 'arrow')"
          ><component :is="ArrowLeft" :size="16" /></button>
          <button
            type="button"
            class="draw-properties__seg draw-properties__seg--icon tw:flex-1 tw:min-w-0 tw:h-7 tw:border tw:border-solid tw:rounded-md tw:text-[11px] tw:cursor-pointer tw:transition-colors tw:duration-100 tw:whitespace-nowrap tw:overflow-hidden tw:[text-overflow:ellipsis] tw:inline-flex tw:items-center tw:justify-center tw:p-0"
            :class="(activeStyle.startCap === 'dot') ? 'is-active tw:bg-[color-mix(in_oklab,var(--accent)_18%,transparent)] tw:text-accent tw:border-[color-mix(in_oklab,var(--accent)_40%,transparent)]' : 'tw:text-content-secondary tw:bg-transparent tw:border-transparent tw:hover:bg-(--hover-strong) tw:hover:text-content-primary'"
            :title="t('editor.draw.props.capDot')"
            @click="emit('update:startCap', 'dot')"
          ><component :is="Dot" :size="16" /></button>
          <button
            type="button"
            class="draw-properties__seg draw-properties__seg--icon tw:flex-1 tw:min-w-0 tw:h-7 tw:border tw:border-solid tw:rounded-md tw:text-[11px] tw:cursor-pointer tw:transition-colors tw:duration-100 tw:whitespace-nowrap tw:overflow-hidden tw:[text-overflow:ellipsis] tw:inline-flex tw:items-center tw:justify-center tw:p-0"
            :class="(activeStyle.startCap === 'none') ? 'is-active tw:bg-[color-mix(in_oklab,var(--accent)_18%,transparent)] tw:text-accent tw:border-[color-mix(in_oklab,var(--accent)_40%,transparent)]' : 'tw:text-content-secondary tw:bg-transparent tw:border-transparent tw:hover:bg-(--hover-strong) tw:hover:text-content-primary'"
            :title="t('editor.draw.props.capNone')"
            @click="emit('update:startCap', 'none')"
          ><component :is="Minus" :size="16" /></button>
        </div>
      </div>
      <div class="draw-properties__caprow tw:flex tw:flex-col tw:gap-1">
        <span class="draw-properties__sublabel tw:text-[11px] tw:text-content-secondary">{{ t('editor.draw.props.capEnd') }}</span>
        <div class="draw-properties__segs tw:flex tw:flex-row tw:gap-1 tw:flex-wrap">
          <button
            type="button"
            class="draw-properties__seg draw-properties__seg--icon tw:flex-1 tw:min-w-0 tw:h-7 tw:border tw:border-solid tw:rounded-md tw:text-[11px] tw:cursor-pointer tw:transition-colors tw:duration-100 tw:whitespace-nowrap tw:overflow-hidden tw:[text-overflow:ellipsis] tw:inline-flex tw:items-center tw:justify-center tw:p-0"
            :class="(activeStyle.endCap === 'arrow') ? 'is-active tw:bg-[color-mix(in_oklab,var(--accent)_18%,transparent)] tw:text-accent tw:border-[color-mix(in_oklab,var(--accent)_40%,transparent)]' : 'tw:text-content-secondary tw:bg-transparent tw:border-transparent tw:hover:bg-(--hover-strong) tw:hover:text-content-primary'"
            :title="t('editor.draw.props.capArrow')"
            @click="emit('update:endCap', 'arrow')"
          ><component :is="ArrowRight" :size="16" /></button>
          <button
            type="button"
            class="draw-properties__seg draw-properties__seg--icon tw:flex-1 tw:min-w-0 tw:h-7 tw:border tw:border-solid tw:rounded-md tw:text-[11px] tw:cursor-pointer tw:transition-colors tw:duration-100 tw:whitespace-nowrap tw:overflow-hidden tw:[text-overflow:ellipsis] tw:inline-flex tw:items-center tw:justify-center tw:p-0"
            :class="(activeStyle.endCap === 'dot') ? 'is-active tw:bg-[color-mix(in_oklab,var(--accent)_18%,transparent)] tw:text-accent tw:border-[color-mix(in_oklab,var(--accent)_40%,transparent)]' : 'tw:text-content-secondary tw:bg-transparent tw:border-transparent tw:hover:bg-(--hover-strong) tw:hover:text-content-primary'"
            :title="t('editor.draw.props.capDot')"
            @click="emit('update:endCap', 'dot')"
          ><component :is="Dot" :size="16" /></button>
          <button
            type="button"
            class="draw-properties__seg draw-properties__seg--icon tw:flex-1 tw:min-w-0 tw:h-7 tw:border tw:border-solid tw:rounded-md tw:text-[11px] tw:cursor-pointer tw:transition-colors tw:duration-100 tw:whitespace-nowrap tw:overflow-hidden tw:[text-overflow:ellipsis] tw:inline-flex tw:items-center tw:justify-center tw:p-0"
            :class="(activeStyle.endCap === 'none') ? 'is-active tw:bg-[color-mix(in_oklab,var(--accent)_18%,transparent)] tw:text-accent tw:border-[color-mix(in_oklab,var(--accent)_40%,transparent)]' : 'tw:text-content-secondary tw:bg-transparent tw:border-transparent tw:hover:bg-(--hover-strong) tw:hover:text-content-primary'"
            :title="t('editor.draw.props.capNone')"
            @click="emit('update:endCap', 'none')"
          ><component :is="Minus" :size="16" /></button>
        </div>
      </div>
    </div>

    <!-- Секция: Небрежность (только для roughjs-геометрии) -->
    <div v-if="showGeometry" class="draw-properties__section tw:flex tw:flex-col tw:gap-1.5">
      <div class="draw-properties__label tw:text-[11px] tw:font-medium tw:text-content-muted tw:uppercase tw:tracking-[0.04em] tw:select-none">{{ t('editor.draw.props.sloppiness') }}</div>
      <div class="draw-properties__segs tw:flex tw:flex-row tw:gap-1 tw:flex-wrap">
        <button
          type="button"
          class="draw-properties__seg tw:flex-1 tw:min-w-0 tw:h-7 tw:px-1.5 tw:border tw:border-solid tw:rounded-md tw:text-[11px] tw:cursor-pointer tw:transition-colors tw:duration-100 tw:whitespace-nowrap tw:overflow-hidden tw:[text-overflow:ellipsis]"
          :class="(activeRoughnessIndex() === 0) ? 'is-active tw:bg-[color-mix(in_oklab,var(--accent)_18%,transparent)] tw:text-accent tw:border-[color-mix(in_oklab,var(--accent)_40%,transparent)]' : 'tw:text-content-secondary tw:bg-transparent tw:border-transparent tw:hover:bg-(--hover-strong) tw:hover:text-content-primary'"
          :title="t('editor.draw.props.architect')"
          @click="emit('update:roughness', 0)"
        >{{ t('editor.draw.props.architect') }}</button>
        <button
          type="button"
          class="draw-properties__seg tw:flex-1 tw:min-w-0 tw:h-7 tw:px-1.5 tw:border tw:border-solid tw:rounded-md tw:text-[11px] tw:cursor-pointer tw:transition-colors tw:duration-100 tw:whitespace-nowrap tw:overflow-hidden tw:[text-overflow:ellipsis]"
          :class="(activeRoughnessIndex() === 1) ? 'is-active tw:bg-[color-mix(in_oklab,var(--accent)_18%,transparent)] tw:text-accent tw:border-[color-mix(in_oklab,var(--accent)_40%,transparent)]' : 'tw:text-content-secondary tw:bg-transparent tw:border-transparent tw:hover:bg-(--hover-strong) tw:hover:text-content-primary'"
          :title="t('editor.draw.props.artist')"
          @click="emit('update:roughness', 1.5)"
        >{{ t('editor.draw.props.artist') }}</button>
        <button
          type="button"
          class="draw-properties__seg tw:flex-1 tw:min-w-0 tw:h-7 tw:px-1.5 tw:border tw:border-solid tw:rounded-md tw:text-[11px] tw:cursor-pointer tw:transition-colors tw:duration-100 tw:whitespace-nowrap tw:overflow-hidden tw:[text-overflow:ellipsis]"
          :class="(activeRoughnessIndex() === 2) ? 'is-active tw:bg-[color-mix(in_oklab,var(--accent)_18%,transparent)] tw:text-accent tw:border-[color-mix(in_oklab,var(--accent)_40%,transparent)]' : 'tw:text-content-secondary tw:bg-transparent tw:border-transparent tw:hover:bg-(--hover-strong) tw:hover:text-content-primary'"
          :title="t('editor.draw.props.cartoonist')"
          @click="emit('update:roughness', 3)"
        >{{ t('editor.draw.props.cartoonist') }}</button>
      </div>
    </div>

    <!-- Секция: Прозрачность -->
    <div class="draw-properties__section tw:flex tw:flex-col tw:gap-1.5">
      <div class="draw-properties__label tw:text-[11px] tw:font-medium tw:text-content-muted tw:uppercase tw:tracking-[0.04em] tw:select-none">{{ t('editor.draw.props.opacity') }}</div>
      <input
        type="range"
        class="draw-properties__range tw:w-full tw:accent-(--accent) tw:cursor-pointer"
        min="0"
        max="1"
        step="0.1"
        :value="activeStyle.opacity"
        @input="emit('update:opacity', Number(($event.target as HTMLInputElement).value))"
      >
    </div>
  </div>
</template>
