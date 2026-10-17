<script setup lang="ts">
import { onMounted, ref, useId } from 'vue'
import { useI18n } from 'vue-i18n'
import NvButton from '../../../ui/primitives/NvButton.vue'
import SettingsRow from './ui/SettingsRow.vue'
import { secureStore, SECRET_AI_API_KEY } from '../../../tauri/secureStore'

defineProps<{ disabled: boolean }>()

const { t } = useI18n()
const inputId = useId()
// The saved key is never read back into the UI: only whether one exists.
const draft = ref('')
const saved = ref(false)
const failed = ref(false)

onMounted(async () => {
  try {
    saved.value = (await secureStore.get(SECRET_AI_API_KEY)) !== null
  } catch {
    failed.value = true
  }
})

async function run(task: () => Promise<void>) {
  failed.value = false
  try {
    await task()
  } catch {
    failed.value = true
  }
}

function save() {
  const value = draft.value.trim()
  if (!value) return
  return run(async () => {
    await secureStore.set(SECRET_AI_API_KEY, value)
    draft.value = ''
    saved.value = true
  })
}

function clear() {
  return run(async () => {
    await secureStore.delete(SECRET_AI_API_KEY)
    draft.value = ''
    saved.value = false
  })
}
</script>

<template>
  <SettingsRow
    :title="t('settings.ai.apiKey.title')"
    :control-id="inputId"
    :disabled="disabled"
  >
    <template #description>
      <span v-if="failed" class="api-key-error tw:text-danger">{{ t('settings.ai.apiKey.error') }}</span>
      <span v-else-if="saved" class="api-key-saved">{{ t('settings.ai.apiKey.saved') }}</span>
      <span v-else>{{ t('settings.ai.apiKey.description') }}</span>
    </template>
    <div class="tw:flex tw:items-center tw:gap-2">
      <input
        :id="inputId"
        v-model="draft"
        class="ai-api-key-input tw:h-7 tw:min-w-[180px] tw:max-w-[220px] tw:px-2 tw:rounded-[calc(7px*var(--radius-scale,1))] tw:border tw:border-solid tw:border-transparent tw:bg-input-bg tw:text-content-primary tw:font-medium tw:text-xs tw:font-nv-ui tw:outline-none tw:transition-[background-color,box-shadow] tw:duration-[120ms] tw:focus:bg-surface-raised tw:focus:shadow-[0_0_0_2px_var(--input-ring)] tw:disabled:opacity-48 tw:disabled:pointer-events-none tw:placeholder:text-content-muted tw:placeholder:font-normal"
        type="password"
        autocomplete="off"
        spellcheck="false"
        :disabled="disabled"
        :placeholder="saved ? t('settings.ai.apiKey.replacePlaceholder') : t('settings.ai.apiKey.placeholder')"
        @keydown.enter.prevent="save"
      >
      <NvButton
        size="sm"
        :disabled="disabled || !draft.trim()"
        @click="save"
      >
        {{ saved ? t('settings.ai.apiKey.replace') : t('settings.ai.apiKey.save') }}
      </NvButton>
      <NvButton
        v-if="saved"
        size="sm"
        variant="ghost"
        :disabled="disabled"
        @click="clear"
      >
        {{ t('settings.ai.apiKey.clear') }}
      </NvButton>
    </div>
  </SettingsRow>
</template>
