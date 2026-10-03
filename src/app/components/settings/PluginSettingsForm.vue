<script setup lang="ts">
import { onMounted, reactive } from 'vue'
import { useI18n } from 'vue-i18n'
import { useWorkspaceStore } from '../../../stores/workspace'
import { pluginSecretKey, secureStore } from '../../../tauri/secureStore'
import type { PluginManifest, PluginSettingField } from '../../../types/workspace'
import NvNumberInput from '../../../ui/primitives/NvNumberInput.vue'
import NvSelect from '../../../ui/primitives/NvSelect.vue'
import NvToggle from '../../../ui/primitives/NvToggle.vue'

const props = defineProps<{ plugin: PluginManifest }>()

const { t, te } = useI18n()
const workspaceStore = useWorkspaceStore()

/**
 * Manifest-provided labels/descriptions/option labels may be raw display
 * strings (user/marketplace plugins) or i18n keys (bundled system plugins,
 * e.g. `settings.plugins.githubSync.fields.repo`). Resolve through `t()`
 * only when the value is a real translation key, otherwise show it as-is.
 */
function label(value: string | undefined, fallback: string): string {
  if (value && te(value)) return t(value)
  return value ?? fallback
}

function selectOptions(field: PluginSettingField): { value: string; label: string }[] {
  return (field.options ?? []).map(option => ({
    value: option.value,
    label: label(option.label, option.value),
  }))
}

const secretDraft = reactive<Record<string, string>>({})
const secretHasValue = reactive<Record<string, boolean>>({})
const secretTouched = reactive<Record<string, boolean>>({})
const secretFlash = reactive<Record<string, boolean>>({})

function rawValue(field: PluginSettingField): unknown {
  const stored = workspaceStore.getPluginSetting(props.plugin.id, field.key)
  return stored !== undefined ? stored : field.default
}

function stringValue(field: PluginSettingField): string {
  const v = rawValue(field)
  if (typeof v === 'string') return v
  return v == null ? '' : String(v)
}

function numberValue(field: PluginSettingField): number {
  const v = rawValue(field)
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : (field.min ?? 0)
}

function boolValue(field: PluginSettingField): boolean {
  return rawValue(field) === true
}

async function updateSetting(field: PluginSettingField, value: unknown) {
  await workspaceStore.setPluginSetting(props.plugin.id, field.key, value)
}

function secretPlaceholder(field: PluginSettingField): string {
  if (secretHasValue[field.key]) return '••••••••'
  if (field.placeholder) return label(field.placeholder, field.placeholder)
  return t('settings.plugins.settings.secretPlaceholder')
}

function placeholderText(field: PluginSettingField): string | undefined {
  return field.placeholder ? label(field.placeholder, field.placeholder) : undefined
}

function onSecretInput(field: PluginSettingField, value: string) {
  secretDraft[field.key] = value
  secretTouched[field.key] = true
}

function flashSaved(key: string) {
  secretFlash[key] = true
  setTimeout(() => { secretFlash[key] = false }, 1500)
}

async function onSecretBlur(field: PluginSettingField) {
  if (!secretTouched[field.key]) return
  secretTouched[field.key] = false
  const value = secretDraft[field.key] ?? ''
  const key = pluginSecretKey(props.plugin.id, field.key)
  if (value === '') {
    await secureStore.delete(key)
    secretHasValue[field.key] = false
  } else {
    await secureStore.set(key, value)
    secretHasValue[field.key] = true
    flashSaved(field.key)
  }
  secretDraft[field.key] = ''
}

onMounted(async () => {
  const fields = props.plugin.settingsSchema ?? []
  for (const field of fields) {
    if (!field.secret) continue
    try {
      const value = await secureStore.get(pluginSecretKey(props.plugin.id, field.key))
      secretHasValue[field.key] = !!value
    } catch {
      secretHasValue[field.key] = false
    }
  }
})
</script>

<template>
  <div v-if="plugin.settingsSchema?.length" class="plugin-settings-form tw:mt-2">
    <div
      v-for="field in plugin.settingsSchema"
      :key="field.key"
      class="settings-row settings-row--border tw:grid tw:min-w-0 tw:py-3"
      :class="field.type === 'textarea' && !field.secret
        ? 'settings-row--stack tw:grid-cols-[minmax(0,1fr)] tw:items-stretch tw:gap-2'
        : 'tw:grid-cols-[minmax(0,1fr)_auto] tw:items-center tw:gap-5 tw:max-[980px]:grid-cols-[minmax(0,1fr)] tw:max-[980px]:items-stretch tw:max-[980px]:gap-2'"
    >
      <div class="row-copy tw:min-w-0">
        <div class="row-title tw:text-content-primary tw:text-[13.5px] tw:font-[550] tw:[overflow-wrap:anywhere]">{{ label(field.label, field.key) }}</div>
        <div v-if="field.description" class="row-sub tw:mt-0.5 tw:text-content-muted tw:text-xs tw:leading-[1.45] tw:[overflow-wrap:anywhere]">{{ label(field.description, field.description) }}</div>
      </div>

      <NvToggle
        v-if="field.type === 'checkbox'"
        :aria-label="label(field.label, field.key)"
        :model-value="boolValue(field)"
        @update:model-value="v => updateSetting(field, v)"
      />

      <NvSelect
        v-else-if="field.type === 'select'"
        :model-value="stringValue(field)"
        :options="selectOptions(field)"
        @update:model-value="v => updateSetting(field, v)"
      />

      <NvNumberInput
        v-else-if="field.type === 'number'"
        :model-value="numberValue(field)"
        :min="field.min"
        :max="field.max"
        :step="field.step"
        @update:model-value="v => updateSetting(field, v)"
      />

      <textarea
        v-else-if="field.type === 'textarea' && !field.secret"
        class="ui-input plugin-settings-form__textarea tw:w-[220px] tw:min-h-16 tw:py-2 tw:px-2.5 tw:resize-y tw:font-medium tw:text-[12.5px] tw:font-nv-ui"
        :value="stringValue(field)"
        :placeholder="placeholderText(field)"
        rows="3"
        @change="e => updateSetting(field, (e.target as HTMLTextAreaElement).value)"
      />

      <div v-else-if="field.secret" class="plugin-settings-form__secret tw:flex tw:items-center tw:gap-2">
        <input
          class="ui-input"
          type="password"
          :placeholder="secretPlaceholder(field)"
          :value="secretDraft[field.key] ?? ''"
          @input="e => onSecretInput(field, (e.target as HTMLInputElement).value)"
          @blur="onSecretBlur(field)"
        >
        <span v-if="secretFlash[field.key]" class="plugin-settings-form__badge tw:text-content-muted tw:text-[11px] tw:font-nv-mono tw:whitespace-nowrap">{{ t('settings.plugins.settings.saved') }}</span>
        <span v-else-if="secretHasValue[field.key]" class="plugin-settings-form__badge tw:text-content-muted tw:text-[11px] tw:font-nv-mono tw:whitespace-nowrap">{{ t('settings.plugins.settings.secretSet') }}</span>
      </div>

      <input
        v-else
        class="ui-input"
        :type="field.type === 'password' ? 'password' : 'text'"
        :value="stringValue(field)"
        :placeholder="placeholderText(field)"
        @change="e => updateSetting(field, (e.target as HTMLInputElement).value)"
      >
    </div>
  </div>
</template>
