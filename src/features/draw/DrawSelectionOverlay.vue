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
    class="draw-bind-highlight"
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
    class="draw-selection"
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
        class="draw-selection__rotate-line"
        :style="{
          left: `${selectionScreen.topMid.x - selectionScreen.left}px`,
          top: `${selectionScreen.rotate.y - selectionScreen.top}px`,
          height: `${rotateOffset}px`,
        }"
      />
      <span
        class="draw-selection__rotate"
        :style="{ left: `${selectionScreen.rotate.x - selectionScreen.left}px`, top: `${selectionScreen.rotate.y - selectionScreen.top}px` }"
      />
      <span
        v-for="h in selectionScreen.handles"
        :key="h.key"
        class="draw-selection__handle"
        :style="{ left: `${h.x - selectionScreen.left}px`, top: `${h.y - selectionScreen.top}px` }"
      />
    </template>
    <!-- Значок замка в углу рамки при полностью заблокированном выделении. -->
    <span v-if="selectionAllLocked" class="draw-selection__lock">
      <Lock :size="12" />
    </span>
  </div>
  <!-- Marquee (рамка выбора рамкой) -->
  <div v-if="marqueeStyle" class="draw-marquee" :style="marqueeStyle" aria-hidden="true" />
  <!-- Ручка изгиба bezier-стрелки -->
  <span
    v-if="bendHandle"
    class="draw-selection__bend"
    :style="{ left: `${bendHandle.x}px`, top: `${bendHandle.y}px` }"
    aria-hidden="true"
  />
</template>
