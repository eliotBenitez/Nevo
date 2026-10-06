<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { X } from '@lucide/vue'
import { DRAW_TEMPLATES, type DrawTemplate, type DrawTemplateCategory } from '../../utils/draw/drawTemplates'
import { renderDrawToSvgString, DEFAULT_DRAW_DATA, type DrawStroke } from '../../utils/draw/drawEngine'
import { sanitizeSvg } from '../../utils/sanitizeSvg'

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
      previews.value = { ...previews.value, [tpl.id]: sanitizeSvg(svg) }
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
  <div
    class="draw-templates tw:absolute tw:right-4 tw:top-16 tw:z-6 tw:flex tw:flex-col tw:gap-2.5 tw:w-60 tw:max-h-[calc(100%-96px)] tw:overflow-y-auto tw:p-3 tw:border tw:border-solid tw:border-transparent tw:rounded-[14px] tw:bg-(--menu-bg) tw:shadow-(--shadow-overlay) tw:box-border tw:max-[719px]:top-[calc(114px+max(var(--safe-area-top),0px))] tw:max-[719px]:right-[calc(14px+max(var(--safe-area-right),0px))] tw:max-[719px]:left-[calc(14px+max(var(--safe-area-left),0px))] tw:max-[719px]:w-auto tw:max-[719px]:max-h-[min(52vh,420px)] tw:max-[719px]:overflow-y-auto"
    role="region"
    :aria-label="t('editor.draw.templates.title')"
  >
    <div class="draw-templates__header tw:flex tw:items-center tw:justify-between">
      <span class="draw-templates__title tw:text-[13px] tw:font-semibold tw:text-content-primary">{{ t('editor.draw.templates.title') }}</span>
      <button
        type="button"
        class="draw-templates__close tw:inline-flex tw:items-center tw:justify-center tw:size-6 tw:border-none tw:rounded-md tw:bg-transparent tw:text-content-secondary tw:hover:bg-(--hover-strong) tw:hover:text-content-primary"
        :title="t('editor.draw.templates.close')"
        @click="emit('close')"
      >
        <X :size="16" />
      </button>
    </div>

    <div v-for="group in grouped" :key="group.category" class="draw-templates__section tw:flex tw:flex-col tw:gap-1.5">
      <div class="draw-templates__label tw:text-[11px] tw:font-semibold tw:uppercase tw:tracking-[0.04em] tw:text-content-secondary">{{ t(`editor.draw.templates.${group.category}`) }}</div>
      <div class="draw-templates__grid tw:grid tw:grid-cols-2 tw:gap-2">
        <button
          v-for="tpl in group.items"
          :key="tpl.id"
          type="button"
          class="draw-templates__item tw:flex tw:flex-col tw:items-center tw:gap-1 tw:py-2 tw:px-1.5 tw:border tw:border-solid tw:border-transparent tw:rounded-[10px] tw:bg-surface-subtle tw:transition-[border-color,transform] tw:duration-100 tw:hover:border-accent tw:hover:-translate-y-px"
          :title="t(`editor.draw.templates.${tpl.id}`)"
          @click="onPick(tpl)"
        >
          <span class="draw-templates__thumb tw:flex tw:items-center tw:justify-center tw:w-full tw:h-[56px] tw:overflow-hidden tw:[&_svg]:max-w-full tw:[&_svg]:max-h-full" v-html="previews[tpl.id] ?? ''" />
          <span class="draw-templates__name tw:text-[11px] tw:text-content-secondary tw:text-center tw:leading-[1.2]">{{ t(`editor.draw.templates.${tpl.id}`) }}</span>
        </button>
      </div>
    </div>
  </div>
</template>
