<script setup lang="ts">
import { computed } from 'vue'
import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignHorizontalDistributeCenter,
  AlignStartHorizontal,
  AlignStartVertical,
  AlignVerticalDistributeCenter,
  BringToFront,
  Copy,
  Group,
  Lock,
  MoveDown,
  MoveUp,
  SendToBack,
  Ungroup,
  Unlock,
  ExternalLink,
  GitBranchPlus,
  LayoutDashboard,
} from 'lucide-vue-next'
import { CANVAS_FONT_FAMILIES, type CanvasFontFamily } from '../../../core/canvas'
import type {
  CanvasAlignment,
  CanvasConnector,
  CanvasDistribution,
  CanvasElement,
  CanvasElementStyle,
} from '../../../core/canvas'
import NvButton from '../../../ui/primitives/NvButton.vue'
import NvColorPicker from '../../../ui/primitives/NvColorPicker.vue'
import NvNumberInput from '../../../ui/primitives/NvNumberInput.vue'
import NvRangeInput from '../../../ui/primitives/NvRangeInput.vue'
import NvSelect from '../../../ui/primitives/NvSelect.vue'
import NvTextInput from '../../../ui/primitives/NvTextInput.vue'

const props = defineProps<{
  selectionCount: number
  element: CanvasElement | null
  connector: CanvasConnector | null
  selectionLocked: boolean
  labels: Record<string, string>
}>()

const emit = defineEmits<{
  style: [patch: CanvasElementStyle]
  connector: [patch: Partial<CanvasConnector>]
  rotation: [value: number]
  alt: [value: string]
  lock: [locked: boolean]
  group: [grouped: boolean]
  arrange: [direction: 'front' | 'back' | 'forward' | 'backward']
  align: [alignment: CanvasAlignment]
  distribute: [direction: CanvasDistribution]
  duplicate: []
  element: [patch: Record<string, unknown>]
  'mindmap-child': []
  'mindmap-layout': []
  'open-note-link': []
}>()

const style = computed(() => props.element?.style ?? {})
const supportsFill = computed(() => ['shape', 'note', 'note-link', 'frame'].includes(props.element?.kind ?? ''))
const supportsText = computed(() => props.element?.kind === 'text' || props.element?.kind === 'shape')

const alignmentActions = [
  { value: 'left', icon: AlignStartVertical },
  { value: 'center', icon: AlignCenterVertical },
  { value: 'right', icon: AlignEndVertical },
  { value: 'top', icon: AlignStartHorizontal },
  { value: 'middle', icon: AlignCenterHorizontal },
  { value: 'bottom', icon: AlignEndHorizontal },
] as const

const routingOptions = computed(() => [
  { value: 'straight', label: props.labels.straight },
  { value: 'orthogonal', label: props.labels.orthogonal },
  { value: 'bezier', label: props.labels.bezier },
])

const capOptions = computed(() => [
  { value: 'none', label: props.labels.none },
  { value: 'arrow', label: props.labels.arrow },
  { value: 'dot', label: props.labels.dot },
])

const fontFamilyLabelKeys: Record<CanvasFontFamily, string> = {
  sans: 'fontSans',
  serif: 'fontSerif',
  mono: 'fontMono',
  handwriting: 'fontHandwriting',
}

const fontFamilyOptions = computed(() => CANVAS_FONT_FAMILIES.map(value => ({
  value,
  label: props.labels[fontFamilyLabelKeys[value]],
})))

function colorValue(value: string | undefined, fallback: string): string {
  if (!value) return fallback
  return /^#[0-9a-f]{8}$/i.test(value) ? value.slice(0, 7) : value
}

function updateStyleColor(property: 'fill' | 'stroke', value: string | null) {
  if (!value) return
  emit('style', property === 'fill' ? { fill: value } : { stroke: value })
}

function updateConnectorColor(value: string | null) {
  if (value) emit('connector', { color: value })
}

function updateTextColor(value: string | null) {
  if (value) emit('style', { textColor: value })
}

function updateFontFamily(value: string) {
  emit('style', { fontFamily: value as CanvasFontFamily })
}

function updateConnectorSelect(
  property: 'routing' | 'startCap' | 'endCap',
  value: string,
) {
  emit('connector', { [property]: value } as Partial<CanvasConnector>)
}
</script>

<template>
  <aside v-if="selectionCount" class="canvas-properties" :aria-label="labels.properties">
    <div class="canvas-properties__header">
      <span>{{ labels.properties }}</span>
      <span>{{ selectionCount }}</span>
    </div>

    <template v-if="element">
      <div v-if="supportsFill" class="canvas-properties__field" role="group" :aria-label="labels.fill">
        <span>{{ labels.fill }}</span>
        <NvColorPicker
          class="canvas-properties__control"
          :model-value="colorValue(style.fill, '#ffffff')"
          @update:model-value="updateStyleColor('fill', $event)"
        />
      </div>
      <div class="canvas-properties__field" role="group" :aria-label="labels.stroke">
        <span>{{ labels.stroke }}</span>
        <NvColorPicker
          class="canvas-properties__control"
          :model-value="colorValue(style.stroke, '#171717')"
          @update:model-value="updateStyleColor('stroke', $event)"
        />
      </div>
      <div class="canvas-properties__field" role="group" :aria-label="labels.strokeWidth">
        <span>{{ labels.strokeWidth }}</span>
        <NvRangeInput
          class="canvas-properties__control"
          :model-value="style.strokeWidth || 2"
          :min="1"
          :max="24"
          :step="1"
          :aria-label="labels.strokeWidth"
          show-value
          @update:model-value="emit('style', { strokeWidth: $event })"
        />
      </div>
      <div class="canvas-properties__field" role="group" :aria-label="labels.opacity">
        <span>{{ labels.opacity }}</span>
        <NvRangeInput
          class="canvas-properties__control"
          :model-value="style.opacity ?? 1"
          :min="0.1"
          :max="1"
          :step="0.05"
          :aria-label="labels.opacity"
          show-value
          @update:model-value="emit('style', { opacity: $event })"
        />
      </div>
      <div v-if="supportsText" class="canvas-properties__field" role="group" :aria-label="labels.fontSize">
        <span>{{ labels.fontSize }}</span>
        <NvNumberInput
          class="canvas-properties__control"
          :model-value="style.fontSize || 16"
          :min="8"
          :max="160"
          @update:model-value="emit('style', { fontSize: $event })"
        />
      </div>
      <div v-if="supportsText" class="canvas-properties__field" role="group" :aria-label="labels.textColor">
        <span>{{ labels.textColor }}</span>
        <NvColorPicker
          class="canvas-properties__control"
          :model-value="colorValue(style.textColor, '#171717')"
          @update:model-value="updateTextColor"
        />
      </div>
      <div v-if="supportsText" class="canvas-properties__field" role="group" :aria-label="labels.fontFamily">
        <span>{{ labels.fontFamily }}</span>
        <NvSelect
          class="canvas-properties__control"
          :model-value="style.fontFamily || 'sans'"
          :options="fontFamilyOptions"
          :min-width="132"
          @update:model-value="updateFontFamily"
        />
      </div>
      <div class="canvas-properties__field" role="group" :aria-label="labels.rotation">
        <span>{{ labels.rotation }}</span>
        <NvNumberInput
          class="canvas-properties__control"
          :model-value="element.rotation || 0"
          :min="-360"
          :max="360"
          @update:model-value="emit('rotation', $event)"
        />
      </div>
      <div v-if="element.kind === 'image'" class="canvas-properties__field">
        <span>{{ labels.alt }}</span>
        <NvTextInput
          class="canvas-properties__control"
          :model-value="element.alt || ''"
          :aria-label="labels.alt"
          @change="emit('alt', $event)"
        />
      </div>
      <div v-if="element.kind === 'frame'" class="canvas-properties__field">
        <span>{{ labels.frameTitle }}</span>
        <NvTextInput
          class="canvas-properties__control"
          :model-value="element.title"
          :aria-label="labels.frameTitle"
          @change="emit('element', { title: $event })"
        />
      </div>
      <div v-if="element.kind === 'frame'" class="canvas-properties__field" role="group" :aria-label="labels.presentationOrder">
        <span>{{ labels.presentationOrder }}</span>
        <NvNumberInput
          class="canvas-properties__control"
          :model-value="element.presentationOrder + 1"
          :min="1"
          :max="1000"
          @update:model-value="emit('element', { presentationOrder: Math.max(0, $event - 1) })"
        />
      </div>
      <NvButton
        v-if="element.kind === 'note-link'"
        class="canvas-properties__wide-action"
        variant="ghost"
        size="sm"
        @click="emit('open-note-link')"
      >
        <ExternalLink :size="15" /> {{ labels.openLinkedNote }}
      </NvButton>
      <div v-if="element.kind === 'shape' && element.mindMap" class="canvas-properties__mindmap">
        <NvButton variant="ghost" size="sm" @click="emit('mindmap-child')">
          <GitBranchPlus :size="15" /> {{ labels.addMindMapChild }}
        </NvButton>
        <NvButton variant="ghost" size="sm" @click="emit('mindmap-layout')">
          <LayoutDashboard :size="15" /> {{ labels.layoutMindMap }}
        </NvButton>
      </div>
    </template>

    <template v-if="connector">
      <div class="canvas-properties__field" role="group" :aria-label="labels.stroke">
        <span>{{ labels.stroke }}</span>
        <NvColorPicker
          class="canvas-properties__control"
          :model-value="colorValue(connector.color, '#737373')"
          @update:model-value="updateConnectorColor"
        />
      </div>
      <div class="canvas-properties__field" role="group" :aria-label="labels.strokeWidth">
        <span>{{ labels.strokeWidth }}</span>
        <NvRangeInput
          class="canvas-properties__control"
          :model-value="connector.width || 2"
          :min="1"
          :max="24"
          :step="1"
          :aria-label="labels.strokeWidth"
          show-value
          @update:model-value="emit('connector', { width: $event })"
        />
      </div>
      <div class="canvas-properties__field" role="group" :aria-label="labels.routing">
        <span>{{ labels.routing }}</span>
        <NvSelect
          class="canvas-properties__control"
          :model-value="connector.routing"
          :options="routingOptions"
          :min-width="132"
          @update:model-value="updateConnectorSelect('routing', $event)"
        />
      </div>
      <div class="canvas-properties__field" role="group" :aria-label="labels.startCap">
        <span>{{ labels.startCap }}</span>
        <NvSelect
          class="canvas-properties__control"
          :model-value="connector.startCap || 'none'"
          :options="capOptions"
          :min-width="132"
          @update:model-value="updateConnectorSelect('startCap', $event)"
        />
      </div>
      <div class="canvas-properties__field" role="group" :aria-label="labels.endCap">
        <span>{{ labels.endCap }}</span>
        <NvSelect
          class="canvas-properties__control"
          :model-value="connector.endCap || 'arrow'"
          :options="capOptions"
          :min-width="132"
          @update:model-value="updateConnectorSelect('endCap', $event)"
        />
      </div>
    </template>

    <div v-if="selectionCount > 1" class="canvas-properties__buttons">
      <NvButton
        v-for="item in alignmentActions"
        :key="item.value"
        variant="ghost"
        size="md"
        icon
        :title="labels[item.value]"
        :aria-label="labels[item.value]"
        @click="emit('align', item.value)"
      >
        <component :is="item.icon" :size="15" />
      </NvButton>
      <NvButton variant="ghost" size="md" icon :title="labels.distributeHorizontal" :aria-label="labels.distributeHorizontal" @click="emit('distribute', 'horizontal')">
        <AlignHorizontalDistributeCenter :size="15" />
      </NvButton>
      <NvButton variant="ghost" size="md" icon :title="labels.distributeVertical" :aria-label="labels.distributeVertical" @click="emit('distribute', 'vertical')">
        <AlignVerticalDistributeCenter :size="15" />
      </NvButton>
    </div>

    <div class="canvas-properties__buttons">
      <NvButton variant="ghost" size="md" icon :title="labels.duplicate" :aria-label="labels.duplicate" @click="emit('duplicate')"><Copy :size="15" /></NvButton>
      <NvButton variant="ghost" size="md" icon :title="labels.front" :aria-label="labels.front" @click="emit('arrange', 'front')"><BringToFront :size="15" /></NvButton>
      <NvButton variant="ghost" size="md" icon :title="labels.forward" :aria-label="labels.forward" @click="emit('arrange', 'forward')"><MoveUp :size="15" /></NvButton>
      <NvButton variant="ghost" size="md" icon :title="labels.backward" :aria-label="labels.backward" @click="emit('arrange', 'backward')"><MoveDown :size="15" /></NvButton>
      <NvButton variant="ghost" size="md" icon :title="labels.back" :aria-label="labels.back" @click="emit('arrange', 'back')"><SendToBack :size="15" /></NvButton>
      <NvButton variant="ghost" size="md" icon :title="labels.group" :aria-label="labels.group" @click="emit('group', true)"><Group :size="15" /></NvButton>
      <NvButton variant="ghost" size="md" icon :title="labels.ungroup" :aria-label="labels.ungroup" @click="emit('group', false)"><Ungroup :size="15" /></NvButton>
      <NvButton
        variant="ghost"
        size="md"
        icon
        :title="selectionLocked ? labels.unlock : labels.lock"
        :aria-label="selectionLocked ? labels.unlock : labels.lock"
        @click="emit('lock', !selectionLocked)"
      >
        <Unlock v-if="selectionLocked" :size="15" />
        <Lock v-else :size="15" />
      </NvButton>
    </div>
  </aside>
</template>

<style scoped>
.canvas-properties {
  position: absolute;
  z-index: 28;
  top: 76px;
  right: 16px;
  display: grid;
  width: 240px;
  gap: 10px;
  padding: 12px;
  border: 1px solid var(--border-subtle);
  border-radius: 14px;
  color: var(--text-secondary);
  background: color-mix(in srgb, var(--canvas-1) 92%, transparent);
  box-shadow: var(--shadow-2);
  backdrop-filter: blur(18px);
  font-size: 12px;
}

.canvas-properties__header,
.canvas-properties__field {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.canvas-properties__header {
  color: var(--text-primary);
  font-weight: 600;
}

.canvas-properties__field > span {
  min-width: 0;
  color: var(--text-2);
  line-height: 1.25;
}

.canvas-properties__control {
  width: 132px;
  flex: 0 0 132px;
}

.canvas-properties :deep(.canvas-properties__control .nv-color-picker__trigger),
.canvas-properties :deep(.canvas-properties__control .nv-select__trigger) {
  width: 100%;
  min-width: 0;
}

.canvas-properties__buttons {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 4px;
}

.canvas-properties__buttons :deep(.nv-btn) {
  width: 32px;
  min-width: 32px;
  justify-content: center;
  padding: 0;
}

.canvas-properties__buttons :deep(.nv-btn:hover),
.canvas-properties__buttons :deep(.nv-btn:focus-visible) {
  color: var(--accent);
}

.canvas-properties__wide-action,
.canvas-properties__mindmap :deep(.nv-btn) {
  width: 100%;
  justify-content: center;
}

.canvas-properties__mindmap {
  display: grid;
  gap: 6px;
}

@media (max-width: 760px) {
  .canvas-properties {
    top: auto;
    right: calc(12px + max(var(--safe-area-right), 0px));
    bottom: calc(84px + max(var(--safe-area-bottom), 0px));
    left: calc(12px + max(var(--safe-area-left), 0px));
    width: auto;
    max-height: 38vh;
    overflow-y: auto;
  }
}
</style>
