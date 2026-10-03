<script setup lang="ts">
import { useI18n } from 'vue-i18n'
const { t } = useI18n()
</script>

<template>
  <div class="privacy-badge tw:flex tw:items-center tw:gap-2 tw:rounded-full tw:border tw:border-transparent tw:bg-surface-subtle tw:py-1.5 tw:pr-2.5 tw:pl-2 tw:text-[11px] tw:text-content-secondary">
    <span class="dot tw:h-1.5 tw:w-1.5 tw:shrink-0 tw:rounded-full tw:bg-[var(--success)]" />
    {{ t('onboarding.welcome.localFirst') }}
  </div>
</template>
