<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { WorkspaceTemplateId } from '../workspaceTemplates'
import { nextRovingIndex } from '../rovingIndex'

const props = defineProps<{
  templates: readonly WorkspaceTemplateId[]
  selected: WorkspaceTemplateId
}>()

const emit = defineEmits<{ select: [template: WorkspaceTemplateId] }>()

const { t } = useI18n()
const templateButtons = ref<(HTMLButtonElement | null)[]>([])

function onKeydown(event: KeyboardEvent, index: number) {
  const next = nextRovingIndex(event.key, index, props.templates.length)
  if (next === null) return
  event.preventDefault()
  emit('select', props.templates[next])
  requestAnimationFrame(() => templateButtons.value[next]?.focus())
}
</script>

<template>
  <div class="cw-field tw:flex tw:min-w-0 tw:flex-col tw:gap-1.5 tw:min-[1200px]:gap-2">
    <span class="cw-flabel tw:text-[12.5px] tw:font-semibold tw:text-content-primary tw:min-[1200px]:text-sm tw:min-[1600px]:text-[15px]">{{ t('onboarding.create.templateLabel') }}</span>
    <p class="cw-help tw:m-0 tw:text-[11.5px] tw:text-content-muted tw:min-[1200px]:text-[13px] tw:min-[1200px]:leading-[1.5] tw:min-[1600px]:text-sm">{{ t('onboarding.create.templateHint') }}</p>
  </div>
  <div class="cw-templates tw:grid tw:grid-cols-2 tw:gap-2 tw:min-[1200px]:gap-3 tw:max-[719px]:grid-cols-1" role="radiogroup" :aria-label="t('onboarding.create.templateLabel')">
    <button
      v-for="(tpl, i) in templates"
      :key="tpl"
      :ref="el => (templateButtons[i] = el as HTMLButtonElement | null)"
      type="button"
      role="radio"
      class="cw-template-card tw:flex tw:cursor-pointer tw:items-start tw:gap-2.5 tw:rounded-xl tw:border tw:bg-(--surface-raised) tw:px-3 tw:py-2.5 tw:text-left tw:focus-visible:outline-2 tw:focus-visible:outline-offset-2 tw:focus-visible:outline-focus-ring tw:min-[1200px]:gap-3 tw:min-[1200px]:rounded-[14px] tw:min-[1200px]:px-[18px] tw:min-[1200px]:py-4 tw:min-[1600px]:px-5 tw:min-[1600px]:py-[18px]"
      :class="selected === tpl ? 'is-selected tw:border-accent tw:shadow-[0_0_0_1px_var(--accent)]' : 'tw:border-line-default tw:hover:bg-[color-mix(in_oklab,var(--surface-raised)_80%,var(--text-primary)_8%)]'"
      :aria-checked="selected === tpl"
      :tabindex="selected === tpl ? 0 : -1"
      @click="emit('select', tpl)"
      @keydown="onKeydown($event, i)"
    >
      <span class="cw-radio tw:mt-px tw:h-4 tw:w-4 tw:shrink-0 tw:rounded-full tw:border-solid tw:min-[1200px]:size-[18px]" :class="selected === tpl ? 'is-selected tw:border-[5px] tw:border-accent tw:min-[1200px]:border-[6px]' : 'tw:border-[1.5px] tw:border-line-strong'" aria-hidden="true" />
      <span class="cw-template-copy tw:flex tw:min-w-0 tw:flex-col tw:gap-0.5 tw:min-[1200px]:gap-[3px]">
        <span class="cw-template-name tw:text-[12.5px] tw:font-medium tw:text-content-primary tw:min-[1200px]:text-[15px] tw:min-[1600px]:text-base">{{ t(`onboarding.create.templates.${tpl}.name`) }}</span>
        <span class="cw-template-sub tw:text-[11.5px] tw:text-content-muted tw:min-[1200px]:text-[13px] tw:min-[1600px]:text-sm">{{ t(`onboarding.create.templates.${tpl}.sub`) }}</span>
      </span>
    </button>
  </div>
</template>
