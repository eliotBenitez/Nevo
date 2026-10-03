<script setup lang="ts">
import { Lock } from 'lucide-vue-next'
import type { ResizeHandle } from './useDrawEditor'

defineProps<{
  selectionScreen: {
    left: number
    top: number
    width: number
    height: number
    handles: { key: ResizeHandle; x: number; y: number }[]
    rotate: { x: number; y: number }
    topMid: { x: number; y: number }
  } | null
  marqueeStyle: Record<string, string> | null
  bindHighlight: {
    left: number
    top: number
    width: number
    height: number
  } | null
  selectionAllLocked: boolean
  rotateOffset: number
  bendHandle: { x: number; y: number } | null
}>()
</script>

<template>
  <!-- Подсветка фигуры-якоря под концом рисуемой стрелки (подсказка привязки). -->
  <div
    v-if="bindHighlight"
    class="draw-bind-highlight tw:absolute tw:z-3 tw:box-border tw:rounded tw:border-2 tw:border-solid tw:border-accent tw:bg-[color-mix(in_oklab,var(--accent)_10%,transparent)] tw:shadow-[0_0_0_3px_color-mix(in_oklab,var(--accent)_22%,transparent)] tw:pointer-events-none"
    :style="{
      left: `${bindHighlight.left}px`,
      top: `${bindHighlight.top}px`,
      width: `${bindHighlight.width}px`,
      height: `${bindHighlight.height}px`,
    }"
    aria-hidden="true"
  />
  <!-- Хром выделения: рамка + маркеры ресайза + маркер поворота (визуальный) -->
  <div
    v-if="selectionScreen"
    class="draw-selection tw:absolute tw:z-3 tw:box-border tw:border tw:border-solid tw:border-accent tw:pointer-events-none"
    :style="{
      left: `${selectionScreen.left}px`,
      top: `${selectionScreen.top}px`,
      width: `${selectionScreen.width}px`,
      height: `${selectionScreen.height}px`,
    }"
    aria-hidden="true"
  >
    <!-- Коннектор к маркеру поворота + сам маркер — скрыты для заблокированного выделения. -->
    <template v-if="!selectionAllLocked">
      <span
        class="draw-selection__rotate-line tw:absolute tw:w-px tw:bg-accent tw:opacity-60 tw:-translate-x-1/2"
        :style="{
          left: `${selectionScreen.topMid.x - selectionScreen.left}px`,
          top: `${selectionScreen.rotate.y - selectionScreen.top}px`,
          height: `${rotateOffset}px`,
        }"
      />
      <span
        class="draw-selection__rotate tw:absolute tw:size-[11px] tw:rounded-full tw:border-[1.5px] tw:border-solid tw:border-accent tw:bg-surface-navigation tw:-translate-1/2"
        :style="{ left: `${selectionScreen.rotate.x - selectionScreen.left}px`, top: `${selectionScreen.rotate.y - selectionScreen.top}px` }"
      />
      <span
        v-for="h in selectionScreen.handles"
        :key="h.key"
        class="draw-selection__handle tw:absolute tw:size-[9px] tw:rounded-[2px] tw:border-[1.5px] tw:border-solid tw:border-accent tw:bg-surface-navigation tw:-translate-1/2"
        :style="{ left: `${h.x - selectionScreen.left}px`, top: `${h.y - selectionScreen.top}px` }"
      />
    </template>
    <!-- Значок замка в углу рамки при полностью заблокированном выделении. -->
    <span
      v-if="selectionAllLocked"
      class="draw-selection__lock tw:absolute tw:-top-2 tw:-left-2 tw:flex tw:items-center tw:justify-center tw:size-[18px] tw:rounded tw:border-[1.5px] tw:border-solid tw:border-accent tw:bg-surface-navigation tw:text-accent"
    >
      <Lock :size="12" />
    </span>
  </div>
  <!-- Marquee (рамка выбора рамкой) -->
  <div
    v-if="marqueeStyle"
    class="draw-marquee tw:absolute tw:z-3 tw:border tw:border-solid tw:border-accent tw:bg-[color-mix(in_oklab,var(--accent)_12%,transparent)] tw:pointer-events-none"
    :style="marqueeStyle"
    aria-hidden="true"
  />
  <!-- Ручка изгиба bezier-стрелки -->
  <span
    v-if="bendHandle"
    class="draw-selection__bend tw:absolute tw:z-4 tw:size-[13px] tw:rounded-full tw:border-2 tw:border-solid tw:border-surface-navigation tw:bg-accent tw:shadow-(--shadow-raised) tw:pointer-events-none tw:-translate-1/2"
    :style="{ left: `${bendHandle.x}px`, top: `${bendHandle.y}px` }"
    aria-hidden="true"
  />
</template>
