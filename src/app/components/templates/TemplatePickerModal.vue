<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { Copy, Pencil, Plus, Search, Trash2 } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import type { TemplateDocument, TemplateFieldValues } from '../../../types/template'
import { useWorkspaceStore } from '../../../stores/workspace'
import { buildTemplateFieldDefaults, createEmptyTemplateContent, validateTemplateFieldValues } from '../../../utils/templates'
import NvButton from '../../../ui/primitives/NvButton.vue'
import NvCheckbox from '../../../ui/primitives/NvCheckbox.vue'
import NvDatePicker from '../../../ui/primitives/NvDatePicker.vue'
import NvModal from '../../../ui/primitives/NvModal.vue'
import NvSelect from '../../../ui/primitives/NvSelect.vue'
import NvTextInput from '../../../ui/primitives/NvTextInput.vue'
import { useConfirmDialog } from '../../../ui/composables/useConfirmDialog'
import TemplateEditor from './TemplateEditor.vue'

type Mode = 'create-note' | 'insert'

const props = defineProps<{
  open: boolean
  mode: Mode
  workspacePath: string | null
  workspaceName?: string
  defaultTemplateId?: string
  noteTitle?: string
}>()

const emit = defineEmits<{
  close: []
  use: [payload: { template: TemplateDocument; fieldValues: TemplateFieldValues }]
}>()

const { t, locale } = useI18n()
const { confirm } = useConfirmDialog()
// Templates come from the workspace backend: built-ins for either kind, user
// templates from disk locally and from the workspace document on cloud.
const workspaceStore = useWorkspaceStore()

const loading = ref(false)
const error = ref<string | null>(null)
const query = ref('')
const templates = ref<TemplateDocument[]>([])
const selectedId = ref<string | null>(null)
const fieldValues = reactive<TemplateFieldValues>({})
const touched = ref(false)
const editorOpen = ref(false)
const editorMode = ref<'create' | 'edit' | 'duplicate'>('create')
const editingTemplate = reactive<TemplateDocument>({
  id: '',
  name: '',
  icon: '📄',
  description: '',
  content: createEmptyTemplateContent(),
  fields: [],
  createdAt: '',
  updatedAt: '',
})

const selectedTemplate = computed(() => templates.value.find(template => template.id === selectedId.value) ?? templates.value[0] ?? null)
const missingRequiredFields = computed(() => selectedTemplate.value ? validateTemplateFieldValues(selectedTemplate.value, fieldValues) : [])
const canUseTemplate = computed(() => !!selectedTemplate.value && missingRequiredFields.value.length === 0)
const filteredTemplates = computed(() => {
  const term = query.value.trim().toLowerCase()
  if (!term) return templates.value
  return templates.value.filter(template => [
    template.name,
    template.description,
    template.id,
  ].some(value => value.toLowerCase().includes(term)))
})

function duplicateName(name: string): string {
  return `${name} ${t('templates.copySuffix')}`
}

function localizeTemplateError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err)
  const keyByMessage: Record<string, string> = {
    'Invalid template id': 'templates.errors.invalidId',
    'Template name is required': 'templates.errors.templateNameRequired',
    'Template content must be a doc node': 'templates.errors.contentDoc',
    'Built-in template ids are reserved': 'templates.errors.reservedId',
    'Built-in templates cannot be edited': 'templates.errors.builtInEdit',
    'Built-in templates cannot be deleted': 'templates.errors.builtInDelete',
    'Template not found': 'templates.errors.notFound',
  }
  const key = keyByMessage[message]
  if (key) return t(key)
  const requiredMatch = message.match(/^Required field '([^']+)' is missing$/)
  if (requiredMatch) return t('templates.errors.requiredFieldMissing', { field: requiredMatch[1] })
  return message
}

async function loadTemplates() {
  const backend = workspaceStore.backend
  if (!backend) return
  loading.value = true
  error.value = null
  try {
    templates.value = await backend.listTemplates()
    selectedId.value = templates.value.find(template => template.id === props.defaultTemplateId)?.id
      ?? templates.value.find(template => template.id === 'blank')?.id
      ?? templates.value[0]?.id
      ?? null
    resetFieldValues()
  } catch (err) {
    error.value = localizeTemplateError(err)
  } finally {
    loading.value = false
  }
}

function resetFieldValues() {
  for (const key of Object.keys(fieldValues)) delete fieldValues[key]
  const defaults = selectedTemplate.value ? buildTemplateFieldDefaults(selectedTemplate.value.fields, {
    note: props.noteTitle ? { title: props.noteTitle } : undefined,
    workspaceName: props.workspaceName ?? '',
  }) : {}
  for (const [key, value] of Object.entries(defaults)) fieldValues[key] = value
  touched.value = false
}

function selectTemplate(template: TemplateDocument) {
  selectedId.value = template.id
  resetFieldValues()
}

function submitTemplate() {
  touched.value = true
  if (!selectedTemplate.value || !canUseTemplate.value) return
  emit('use', { template: selectedTemplate.value, fieldValues: { ...fieldValues } })
}

function startCreate() {
  editorMode.value = 'create'
  Object.assign(editingTemplate, {
    id: '',
    name: '',
    icon: '📄',
    description: '',
    content: createEmptyTemplateContent(),
    fields: [],
    createdAt: '',
    updatedAt: '',
    builtIn: false,
  })
  editorOpen.value = true
}

function startEdit(template: TemplateDocument) {
  editorMode.value = template.builtIn ? 'duplicate' : 'edit'
  Object.assign(editingTemplate, JSON.parse(JSON.stringify({
    ...template,
    id: template.builtIn ? `${template.id}-copy` : template.id,
    name: template.builtIn ? duplicateName(template.name) : template.name,
    builtIn: false,
  })))
  editorOpen.value = true
}

function duplicateTemplate(template: TemplateDocument) {
  editorMode.value = 'duplicate'
  Object.assign(editingTemplate, JSON.parse(JSON.stringify({
    ...template,
    id: `${template.id}-copy`,
    name: duplicateName(template.name),
    builtIn: false,
  })))
  editorOpen.value = true
}

async function onTemplateSaved(saved: TemplateDocument) {
  await loadTemplates()
  selectedId.value = saved.id
  resetFieldValues()
  editorOpen.value = false
}

async function deleteTemplate(template: TemplateDocument) {
  if (!workspaceStore.backend || template.builtIn) return
  if (!await confirm({
    message: t('templates.deleteConfirm', { name: template.name }),
    confirmLabel: t('confirmDialog.delete'),
    variant: 'danger',
  })) return
  try {
    await workspaceStore.backend.deleteTemplate(template.id)
    await loadTemplates()
  } catch (err) {
    error.value = localizeTemplateError(err)
  }
}

function stringFieldValue(id: string): string {
  const value = fieldValues[id]
  return typeof value === 'string' ? value : ''
}

function setStringFieldValue(id: string, value: string) {
  fieldValues[id] = value
}

function boolFieldValue(id: string): boolean {
  return fieldValues[id] === true
}

function setBoolFieldValue(id: string, value: boolean) {
  fieldValues[id] = value
}

watch(() => props.open, (open) => {
  if (open) void loadTemplates()
  else editorOpen.value = false
})

watch(selectedId, resetFieldValues)
watch(locale, () => {
  if (props.open) void loadTemplates()
})

function onGlobalKeyDown(event: KeyboardEvent) {
  if (!props.open || event.key !== 'Escape') return
  if (document.body.classList.contains('nv-select-open')) return

  event.preventDefault()
  event.stopPropagation()
  
  if (editorOpen.value) {
    editorOpen.value = false
  } else {
    emit('close')
  }
}

onMounted(() => {
  window.addEventListener('keydown', onGlobalKeyDown, true)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onGlobalKeyDown, true)
})
</script>

<template>
  <NvModal
    :open="open"
    size="lg"
    :title="mode === 'create-note' ? t('templates.createTitle') : t('templates.insertTitle')"
    :description="t('templates.subtitle')"
    panel-class="template-picker-panel"
    @close="emit('close')"
  >
    <div class="template-modal__toolbar tw:flex tw:items-center tw:justify-between tw:gap-3 tw:px-4 tw:py-3.5 tw:border-x-0 tw:border-t-0 tw:border-b tw:border-solid tw:border-border-subtle">
      <label class="template-search tw:min-w-[240px] tw:flex-1 tw:flex tw:items-center tw:gap-2 tw:h-[34px] tw:px-2.5 tw:border tw:border-solid tw:border-border-subtle tw:rounded-[calc(7px*var(--radius-scale,1))] tw:bg-surface-overlay">
        <Search :size="15" />
        <input v-model="query" class="tw:w-full tw:border-0 tw:p-0 tw:outline-none tw:bg-transparent tw:text-content-primary tw:font-inherit" type="search" :placeholder="t('templates.search')" />
      </label>
      <NvButton size="sm" @click="startCreate"><Plus :size="14" />{{ t('templates.newTemplate') }}</NvButton>
    </div>

    <p v-if="error" class="template-error tw:text-danger tw:text-xs tw:m-0 tw:px-4 tw:pt-2">{{ error }}</p>

    <div class="template-modal__body tw:flex-1 tw:min-h-[360px] tw:grid tw:grid-cols-[minmax(260px,0.92fr)_minmax(300px,1.08fr)] tw:overflow-hidden tw:max-[760px]:grid-cols-1">
      <div class="template-list tw:overflow-auto tw:p-2.5 tw:border-y-0 tw:border-l-0 tw:border-r tw:border-solid tw:border-border-subtle tw:max-[760px]:max-h-[240px] tw:max-[760px]:border-r-0 tw:max-[760px]:border-b tw:max-[760px]:border-b-border-subtle" :aria-busy="loading">
        <button
          v-for="template in filteredTemplates"
          :key="template.id"
          type="button"
          class="template-list__item tw:w-full tw:grid tw:grid-cols-[32px_1fr_auto] tw:items-center tw:gap-2.5 tw:p-2.5 tw:border tw:border-solid tw:rounded-[calc(7px*var(--radius-scale,1))] tw:text-inherit tw:text-left tw:cursor-pointer tw:hover:border-border-subtle tw:hover:bg-surface-overlay"
          :class="selectedTemplate?.id === template.id ? 'template-list__item--active tw:border-border-subtle tw:bg-surface-overlay' : 'tw:border-transparent tw:bg-transparent'"
          @click="selectTemplate(template)"
        >
          <span class="template-list__icon tw:grid tw:place-items-center tw:size-8 tw:rounded-[calc(7px*var(--radius-scale,1))] tw:bg-(--accent-soft)">{{ template.icon }}</span>
          <span class="template-list__copy tw:min-w-0 tw:grid tw:gap-0.5">
            <span class="template-list__name tw:text-[13px] tw:font-semibold">{{ template.name }}</span>
            <span class="template-list__description tw:overflow-hidden tw:text-ellipsis tw:whitespace-nowrap tw:text-content-secondary tw:text-xs">{{ template.description || template.id }}</span>
          </span>
          <span v-if="template.builtIn" class="template-pill tw:border tw:border-solid tw:border-border-subtle tw:rounded-full tw:py-0.5 tw:px-[7px] tw:text-content-secondary tw:text-[11px]">{{ t('templates.builtIn') }}</span>
        </button>
        <div v-if="!loading && !filteredTemplates.length" class="template-empty tw:text-content-secondary tw:text-xs">{{ t('templates.empty') }}</div>
      </div>

      <aside v-if="selectedTemplate" class="template-detail tw:overflow-auto tw:p-4">
        <div class="template-detail__heading tw:flex tw:gap-3 tw:items-start tw:mb-4 tw:[&_h3]:m-0 tw:[&_h3]:text-[15px] tw:[&_p]:mt-[3px] tw:[&_p]:mb-0 tw:[&_p]:text-content-secondary tw:[&_p]:text-xs">
          <div class="template-detail__icon tw:grid tw:place-items-center tw:size-8 tw:rounded-[calc(7px*var(--radius-scale,1))] tw:bg-(--accent-soft)">{{ selectedTemplate.icon }}</div>
          <div>
            <h3>{{ selectedTemplate.name }}</h3>
            <p>{{ selectedTemplate.description }}</p>
          </div>
        </div>

        <div v-if="selectedTemplate.fields.length" class="template-fields tw:grid tw:gap-3">
          <label
            v-for="field in selectedTemplate.fields"
            :key="field.id"
            class="template-field tw:grid tw:gap-1.5 tw:text-xs tw:text-content-secondary tw:[&_strong]:text-danger tw:[&_small]:text-danger"
          >
            <span>{{ field.label }}<strong v-if="field.required">*</strong></span>
            <textarea
              v-if="field.type === 'multiline'"
              class="tw:w-full tw:resize-y tw:rounded-[calc(8px*var(--radius-scale,1))] tw:border tw:border-solid tw:border-transparent tw:bg-(--input-bg) tw:px-2.5 tw:py-2 tw:font-nv-ui tw:text-[13px] tw:text-content-primary tw:caret-accent tw:outline-none tw:focus-visible:bg-surface-raised tw:focus-visible:shadow-[0_0_0_2px_var(--input-ring)]"
              :value="stringFieldValue(field.id)"
              rows="3"
              @input="setStringFieldValue(field.id, ($event.target as HTMLTextAreaElement).value)"
              @blur="touched = true"
            />
            <NvSelect
              v-else-if="field.type === 'select'"
              :model-value="stringFieldValue(field.id)"
              :options="(field.options ?? []).map(option => ({ value: option, label: option }))"
              placeholder=""
              @update:model-value="setStringFieldValue(field.id, $event); touched = true"
            />
            <NvCheckbox
              v-else-if="field.type === 'checkbox'"
              :model-value="boolFieldValue(field.id)"
              @update:model-value="setBoolFieldValue(field.id, $event); touched = true"
            />
            <NvDatePicker
              v-else-if="field.type === 'date'"
              class="tw:w-full tw:[&_.ndp-trigger]:w-full tw:[&_.ndp-trigger]:h-[34px]"
              :model-value="stringFieldValue(field.id) || null"
              @update:model-value="setStringFieldValue(field.id, $event ?? ''); touched = true"
            />
            <NvTextInput
              v-else
              class="tw:w-full"
              size="md"
              :model-value="stringFieldValue(field.id)"
              @update:model-value="setStringFieldValue(field.id, $event)"
              @blur="touched = true"
            />
            <small v-if="touched && missingRequiredFields.includes(field.id)">{{ t('templates.required') }}</small>
          </label>
        </div>
        <div v-else class="template-no-fields tw:text-content-secondary tw:text-xs">{{ t('templates.noFields') }}</div>

        <div class="template-actions tw:flex tw:flex-wrap tw:gap-2 tw:mt-[18px]">
          <NvButton variant="ghost" size="sm" @click="startEdit(selectedTemplate)">
            <Pencil :size="14" />{{ selectedTemplate.builtIn ? t('templates.duplicateEdit') : t('templates.edit') }}
          </NvButton>
          <NvButton variant="ghost" size="sm" @click="duplicateTemplate(selectedTemplate)">
            <Copy :size="14" />{{ t('templates.duplicate') }}
          </NvButton>
          <NvButton v-if="!selectedTemplate.builtIn" variant="ghost" size="sm" @click="deleteTemplate(selectedTemplate)">
            <Trash2 :size="14" />{{ t('templates.delete') }}
          </NvButton>
        </div>
      </aside>
    </div>

    <template #footer>
      <NvButton variant="ghost" @click="emit('close')">{{ t('workspace.context.cancel') }}</NvButton>
      <NvButton :disabled="!canUseTemplate" @click="submitTemplate">
        {{ mode === 'create-note' ? t('templates.createNote') : t('templates.insert') }}
      </NvButton>
    </template>
  </NvModal>

  <!-- TemplateEditor is an inline, backdrop-less panel (out of scope for this
       migration) that previously stacked on top of the picker as a later
       sibling inside the same teleported backdrop. NvModal owns its own
       Teleport now, so this needs its own to land after it in <body> and
       keep stacking above the picker panel. -->
  <Teleport to="body">
    <TemplateEditor
      v-if="editorOpen"
      :open="editorOpen"
      :mode="editorMode"
      :workspace-path="workspacePath"
      :template="editingTemplate"
      @close="editorOpen = false"
      @saved="onTemplateSaved"
    />
  </Teleport>
</template>

<!-- The panel element lives inside NvModal's template and is teleported to
     <body>, so a scoped rule would not reach it. Fills NvModal's body
     edge-to-edge instead of the primitive's own 18px inset, matching
     WorkspaceSettingsModal's `settings-modal-panel` treatment for the same
     full-bleed multi-pane layout. -->
<style>
.template-picker-panel .nv-modal__body {
  display: flex;
  flex-direction: column;
  min-height: 0;
  padding: 0;
  overflow: hidden;
}
</style>
