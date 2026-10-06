<script setup lang="ts">
import { Check, Circle, Ellipse, Shapes, Square, Triangle } from '@lucide/vue'
import { computed, nextTick, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import NvButton from '../../../ui/primitives/NvButton.vue'
import NvPopupMenu from '../../../ui/primitives/NvPopupMenu.vue'
import { isNotebookShapeKind, type NotebookShapeKind } from '../../../core/notebook/shape'
import type { NotebookInputTool } from '../composables/useNotebookInput'

const props = defineProps<{ tool: NotebookInputTool }>()
const emit = defineEmits<{ 'update:tool': [tool: NotebookShapeKind] }>()
const { t } = useI18n()
const open = ref(false)
const trigger = ref<InstanceType<typeof NvButton> | null>(null)
const active = computed(() => isNotebookShapeKind(props.tool))
const shapes = computed(() => [
  { id: 'rectangle' as const, icon: Square, label: t('notebook.tools.rectangle') },
  { id: 'ellipse' as const, icon: Ellipse, label: t('notebook.tools.ellipse') },
  { id: 'circle' as const, icon: Circle, label: t('notebook.tools.circle') },
  { id: 'triangle' as const, icon: Triangle, label: t('notebook.tools.triangle') },
])

function select(shape: NotebookShapeKind): void {
  open.value = false
  emit('update:tool', shape)
  nextTick(() => trigger.value?.$el.focus())
}
</script>

<template>
  <NvPopupMenu v-model:open="open" placement="bottom" width="180px">
    <template #trigger>
      <NvButton
        ref="trigger" class="notebook-shape-trigger" variant="ghost" icon :active="active"
        :aria-label="t('notebook.tools.shapes')" :title="t('notebook.tools.shapes')"
        aria-haspopup="menu" :aria-expanded="open" :aria-pressed="active"
      >
        <Shapes :size="16" aria-hidden="true" />
      </NvButton>
    </template>
    <NvButton
      v-for="shape in shapes" :key="shape.id" class="nv-menu-item notebook-shape-option"
      variant="ghost" :aria-label="shape.label" role="menuitemradio"
      :aria-checked="tool === shape.id" @click.stop="select(shape.id)"
    >
      <component :is="shape.icon" :size="14" aria-hidden="true" />
      <span class="notebook-shape-option__label">{{ shape.label }}</span>
      <Check v-if="tool === shape.id" :size="14" aria-hidden="true" />
    </NvButton>
  </NvPopupMenu>
</template>

<style scoped>
.notebook-shape-option { width: 100%; height: 32px; justify-content: flex-start; gap: 8px; padding: 0 8px; font-size: 12px; }
.notebook-shape-option__label { flex: 1; text-align: left; }
.notebook-shape-option[aria-checked="true"] { background: var(--surface-subtle); color: var(--accent); }
@media (pointer: coarse) { .notebook-shape-option { height: 44px; } }
</style>
