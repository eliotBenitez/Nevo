<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { Copy, Pencil, Plus, Search, Trash2, X } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'
import type { TemplateDocument, TemplateFieldValues } from '../../../types/template'
import { templateCommands } from '../../../tauri/commands'
import { buildTemplateFieldDefaults, createEmptyTemplateContent, validateTemplateFieldValues } from '../../../utils/templates'
import NvButton from '../../../ui/primitives/NvButton.vue'
import NvCheckbox from '../../../ui/primitives/NvCheckbox.vue'
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
  if (!props.workspacePath) return
  loading.value = true
  error.value = null
  try {
    templates.value = await templateCommands.listTemplates(props.workspacePath)
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
  if (!props.workspacePath || template.builtIn) return
  if (!window.confirm(t('templates.deleteConfirm', { name: template.name }))) return
  try {
    await templateCommands.deleteTemplate(props.workspacePath, template.id)
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
  <Teleport to="body">
    <div v-if="open" class="template-modal-backdrop" @click.self="emit('close')">
      <section class="template-modal" role="dialog" aria-modal="true" :aria-label="t('templates.title')">
        <header class="template-modal__header">
          <div>
            <h2>{{ mode === 'create-note' ? t('templates.createTitle') : t('templates.insertTitle') }}</h2>
            <p>{{ t('templates.subtitle') }}</p>
          </div>
          <NvButton variant="ghost" size="sm" icon :aria-label="t('workspace.context.cancel')" @click="emit('close')">
            <X :size="16" />
          </NvButton>
        </header>

        <div class="template-modal__toolbar">
          <label class="template-search">
            <Search :size="15" />
            <input v-model="query" type="search" :placeholder="t('templates.search')" />
          </label>
          <NvButton size="sm" @click="startCreate"><Plus :size="14" />{{ t('templates.newTemplate') }}</NvButton>
        </div>

        <p v-if="error" class="template-error">{{ error }}</p>

        <div class="template-modal__body">
          <div class="template-list" :aria-busy="loading">
            <button
              v-for="template in filteredTemplates"
              :key="template.id"
              type="button"
              class="template-list__item"
              :class="{ 'template-list__item--active': selectedTemplate?.id === template.id }"
              @click="selectTemplate(template)"
            >
              <span class="template-list__icon">{{ template.icon }}</span>
              <span class="template-list__copy">
                <span class="template-list__name">{{ template.name }}</span>
                <span class="template-list__description">{{ template.description || template.id }}</span>
              </span>
              <span v-if="template.builtIn" class="template-pill">{{ t('templates.builtIn') }}</span>
            </button>
            <div v-if="!loading && !filteredTemplates.length" class="template-empty">{{ t('templates.empty') }}</div>
          </div>

          <aside v-if="selectedTemplate" class="template-detail">
            <div class="template-detail__heading">
              <div class="template-detail__icon">{{ selectedTemplate.icon }}</div>
              <div>
                <h3>{{ selectedTemplate.name }}</h3>
                <p>{{ selectedTemplate.description }}</p>
              </div>
            </div>

            <div v-if="selectedTemplate.fields.length" class="template-fields">
              <label
                v-for="field in selectedTemplate.fields"
                :key="field.id"
                class="template-field"
              >
                <span>{{ field.label }}<strong v-if="field.required">*</strong></span>
                <textarea
                  v-if="field.type === 'multiline'"
                  :value="stringFieldValue(field.id)"
                  rows="3"
                  @input="setStringFieldValue(field.id, ($event.target as HTMLTextAreaElement).value)"
                  @blur="touched = true"
                />
                <select
                  v-else-if="field.type === 'select'"
                  :value="stringFieldValue(field.id)"
                  @change="setStringFieldValue(field.id, ($event.target as HTMLSelectElement).value)"
                  @blur="touched = true"
                >
                  <option value=""></option>
                  <option v-for="option in field.options ?? []" :key="option" :value="option">{{ option }}</option>
                </select>
                <NvCheckbox
                  v-else-if="field.type === 'checkbox'"
                  :model-value="boolFieldValue(field.id)"
                  @update:model-value="setBoolFieldValue(field.id, $event); touched = true"
                />
                <input
                  v-else
                  :value="stringFieldValue(field.id)"
                  :type="field.type === 'date' ? 'date' : 'text'"
                  @input="setStringFieldValue(field.id, ($event.target as HTMLInputElement).value)"
                  @blur="touched = true"
                />
                <small v-if="touched && missingRequiredFields.includes(field.id)">{{ t('templates.required') }}</small>
              </label>
            </div>
            <div v-else class="template-no-fields">{{ t('templates.noFields') }}</div>

            <div class="template-actions">
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

        <footer class="template-modal__footer">
          <NvButton variant="ghost" @click="emit('close')">{{ t('workspace.context.cancel') }}</NvButton>
          <NvButton :disabled="!canUseTemplate" @click="submitTemplate">
            {{ mode === 'create-note' ? t('templates.createNote') : t('templates.insert') }}
          </NvButton>
        </footer>
      </section>

      <TemplateEditor
        v-if="editorOpen"
        :open="editorOpen"
        :mode="editorMode"
        :workspace-path="workspacePath"
        :template="editingTemplate"
        @close="editorOpen = false"
        @saved="onTemplateSaved"
      />
    </div>
  </Teleport>
</template>

<style scoped>
.template-modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1200;
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgb(8 10 14 / 0.54);
  backdrop-filter: blur(10px);
}

.template-modal {
  width: min(880px, calc(100vw - 32px));
  max-height: min(760px, calc(100vh - 32px));
  display: flex;
  flex-direction: column;
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
  background: var(--surface-1);
  color: var(--text-primary);
  box-shadow: var(--shadow-lg);
  overflow: hidden;
}

.template-modal__header,
.template-modal__footer,
.template-modal__toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  border-bottom: 1px solid var(--border-subtle);
}

.template-modal__header {
  justify-content: space-between;
}

.template-modal__header h2,
.template-detail h3 {
  margin: 0;
  font-size: 15px;
}

.template-modal__header p,
.template-detail p {
  margin: 3px 0 0;
  color: var(--text-secondary);
  font-size: 12px;
}

.template-modal__toolbar {
  justify-content: space-between;
}

.template-search {
  min-width: 240px;
  flex: 1;
  display: flex;
  align-items: center;
  gap: 8px;
  height: 34px;
  padding: 0 10px;
  border: 1px solid var(--border-subtle);
  border-radius: 7px;
  background: var(--surface-2);
}

.template-search input,
.template-field input,
.template-field textarea,
.template-field select {
  width: 100%;
  border: 1px solid var(--border-subtle);
  border-radius: 6px;
  background: var(--surface-2);
  color: var(--text-primary);
  padding: 7px 9px;
  font: inherit;
}

.template-search input {
  border: 0;
  padding: 0;
  outline: 0;
  background: transparent;
}

.template-modal__body {
  min-height: 360px;
  display: grid;
  grid-template-columns: minmax(260px, 0.92fr) minmax(300px, 1.08fr);
  overflow: hidden;
}

.template-list {
  overflow: auto;
  padding: 10px;
  border-right: 1px solid var(--border-subtle);
}

.template-list__item {
  width: 100%;
  display: grid;
  grid-template-columns: 32px 1fr auto;
  align-items: center;
  gap: 10px;
  padding: 10px;
  border: 1px solid transparent;
  border-radius: 7px;
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
}

.template-list__item:hover,
.template-list__item--active {
  border-color: var(--border-subtle);
  background: var(--surface-2);
}

.template-list__icon,
.template-detail__icon {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  border-radius: 7px;
  background: var(--accent-soft);
}

.template-list__copy {
  min-width: 0;
  display: grid;
  gap: 2px;
}

.template-list__name {
  font-size: 13px;
  font-weight: 650;
}

.template-list__description {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text-secondary);
  font-size: 12px;
}

.template-pill {
  border: 1px solid var(--border-subtle);
  border-radius: 999px;
  padding: 2px 7px;
  color: var(--text-secondary);
  font-size: 11px;
}

.template-detail {
  overflow: auto;
  padding: 16px;
}

.template-detail__heading {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  margin-bottom: 16px;
}

.template-fields {
  display: grid;
  gap: 12px;
}

.template-field {
  display: grid;
  gap: 6px;
  font-size: 12px;
  color: var(--text-secondary);
}

.template-field strong,
.template-field small,
.template-error {
  color: var(--danger, #ff6b6b);
}

.template-field--wide {
  grid-column: 1 / -1;
}

.template-no-fields,
.template-empty {
  color: var(--text-secondary);
  font-size: 12px;
}

.template-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 18px;
}

.template-modal__footer {
  justify-content: flex-end;
  margin-top: auto;
  border-top: 1px solid var(--border-subtle);
  border-bottom: 0;
}

.template-icon-btn {
  display: inline-grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border: 1px solid var(--border-subtle);
  border-radius: 6px;
  background: var(--surface-2);
  color: var(--text-secondary);
  cursor: pointer;
}

@media (max-width: 760px) {
  .template-modal__body {
    grid-template-columns: 1fr;
  }

  .template-list {
    max-height: 240px;
    border-right: 0;
    border-bottom: 1px solid var(--border-subtle);
  }
}
</style>
