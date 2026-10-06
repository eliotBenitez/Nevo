<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { House, Folder, FileText } from '@lucide/vue'
import { WORKSPACE_TEMPLATE_STARTERS, type WorkspaceTemplateId } from '../workspaceTemplates'

const props = defineProps<{
  name: string
  glyph: string
  gradient: string
  template: WorkspaceTemplateId
}>()

const { t } = useI18n()

function starterIcon(kind: 'folder' | 'note') {
  return kind === 'folder' ? Folder : FileText
}
</script>

<template>
  <aside class="cw-side tw:flex tw:min-h-0 tw:w-[340px] tw:shrink-0 tw:flex-col tw:gap-3 tw:overflow-y-auto tw:py-8 tw:px-7 tw:max-[959px]:w-auto tw:max-[959px]:gap-2 tw:max-[959px]:pt-5 tw:max-[959px]:pb-0 tw:max-[719px]:pt-4 tw:max-[719px]:pr-[calc(20px+max(var(--safe-area-right),0px))] tw:max-[719px]:pl-[calc(20px+max(var(--safe-area-left),0px))]">
    <div class="cw-eyebrow tw:m-0 tw:font-nv-mono tw:text-[11px] tw:leading-[1.2] tw:font-medium tw:tracking-[0.07em] tw:uppercase tw:text-content-muted">{{ t('onboarding.create.previewLabel') }}</div>
    <h3 class="cw-side-title tw:m-0 tw:text-xl tw:font-semibold tw:tracking-[-0.015em] tw:text-content-primary">{{ t('onboarding.create.sideTitle') }}</h3>
    <p class="cw-side-body tw:m-0 tw:text-[13px] tw:leading-[1.6] tw:text-content-secondary">{{ t('onboarding.create.sideBody') }}</p>

    <div class="cw-preview tw:mt-auto tw:rounded-[14px] tw:bg-surface-canvas tw:px-2.5 tw:py-3.5 tw:shadow-[var(--shadow-raised)] tw:max-[959px]:hidden">
      <div class="cw-ws-head tw:flex tw:items-center tw:gap-2.5 tw:px-0.5 tw:pb-2.5">
        <span class="cw-ws-glyph tw:grid tw:h-[30px] tw:w-[30px] tw:shrink-0 tw:place-items-center tw:rounded-lg tw:text-[13px] tw:font-semibold tw:text-content-on-accent" :style="{ background: props.gradient }" aria-hidden="true">{{ props.glyph }}</span>
        <div class="cw-ws-head-text tw:min-w-0">
          <div class="cw-ws-name tw:truncate tw:text-[13.5px] tw:leading-[1.2] tw:font-semibold tw:text-content-primary">{{ props.name.trim() || t('onboarding.create.namePlaceholder') }}</div>
          <div class="cw-ws-meta tw:text-[11.5px] tw:text-content-muted">
            {{ t('onboarding.create.previewMeta', { template: t(`onboarding.create.templates.${props.template}.name`) }) }}
          </div>
        </div>
      </div>
      <div class="cw-nav tw:flex tw:flex-col tw:gap-px">
        <div class="cw-nav-item tw:flex tw:h-[30px] tw:items-center tw:gap-[9px] tw:rounded-lg tw:bg-[var(--surface-selected)] tw:px-2 tw:text-[13px] tw:font-medium tw:text-content-primary">
          <House :size="14" class="tw:shrink-0 tw:text-accent" />
          <span>{{ t('workspace.system.home') }}</span>
        </div>
        <div v-for="item in WORKSPACE_TEMPLATE_STARTERS[props.template]" :key="item.key" class="cw-nav-item tw:flex tw:h-[30px] tw:items-center tw:gap-[9px] tw:rounded-lg tw:px-2 tw:text-[13px] tw:text-content-secondary">
          <component :is="starterIcon(item.kind)" :size="14" class="tw:shrink-0 tw:text-content-muted" />
          <span>{{ t(`onboarding.create.templates.${props.template}.starter.${item.key}`) }}</span>
        </div>
      </div>
    </div>
  </aside>
</template>
