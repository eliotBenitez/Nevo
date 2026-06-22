<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { X } from 'lucide-vue-next'
import { DRAW_TEMPLATES, type DrawTemplate, type DrawTemplateCategory } from '../../utils/draw/drawTemplates'
import { renderDrawToSvgString, DEFAULT_DRAW_DATA, type DrawStroke } from '../../utils/draw/drawEngine'

const emit = defineEmits<{
  insert: [strokes: DrawStroke[]]
  close: []
}>()

const { t } = useI18n()

// SVG-превью каждого шаблона (lazy: считаем после монтирования через тот же
// движок рендера, что и сам холст — поэтому миниатюра 1:1 совпадает со вставкой).
const previews = ref<Record<string, string>>({})

const CATEGORIES: DrawTemplateCategory[] = ['ui', 'diagram']
const grouped = computed(() =>
  CATEGORIES.map((category) => ({
    category,
    items: DRAW_TEMPLATES.filter((tpl) => tpl.category === category),
  })).filter((g) => g.items.length > 0),
)

onMounted(async () => {
  for (const tpl of DRAW_TEMPLATES) {
    try {
      const svg = await renderDrawToSvgString({ ...DEFAULT_DRAW_DATA, strokes: tpl.build() }, 8)
      previews.value = { ...previews.value, [tpl.id]: svg }
    } catch {
      // Превью не критично — кнопка останется без миниатюры.
    }
  }
})

function onPick(tpl: DrawTemplate) {
  emit('insert', tpl.build())
}
</script>

<template>
  <div class="draw-templates" role="region" :aria-label="t('editor.draw.templates.title')">
    <div class="draw-templates__header">
      <span class="draw-templates__title">{{ t('editor.draw.templates.title') }}</span>
      <button
        type="button"
        class="draw-templates__close"
        :title="t('editor.draw.templates.close')"
        @click="emit('close')"
      >
        <X :size="16" />
      </button>
    </div>

    <div v-for="group in grouped" :key="group.category" class="draw-templates__section">
      <div class="draw-templates__label">{{ t(`editor.draw.templates.${group.category}`) }}</div>
      <div class="draw-templates__grid">
        <button
          v-for="tpl in group.items"
          :key="tpl.id"
          type="button"
          class="draw-templates__item"
          :title="t(`editor.draw.templates.${tpl.id}`)"
          @click="onPick(tpl)"
        >
          <span class="draw-templates__thumb" v-html="previews[tpl.id] ?? ''" />
          <span class="draw-templates__name">{{ t(`editor.draw.templates.${tpl.id}`) }}</span>
        </button>
      </div>
    </div>
  </div>
</template>
