<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { ChevronDown, ChevronUp, Plus, Trash2, X } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'
import type { BlockNode } from '../../../types/note'
import type { TemplateDocument, TemplateField, TemplateFieldType } from '../../../types/template'
import { templateCommands } from '../../../tauri/commands'
import { plainTextToNoteContent, noteContentToPlainText } from '../../../utils/noteContent'
import NvButton from '../../../ui/primitives/NvButton.vue'
import NvSelect from '../../../ui/primitives/NvSelect.vue'
import NvIconPicker from '../../../ui/primitives/NvIconPicker.vue'
import NvCheckbox from '../../../ui/primitives/NvCheckbox.vue'

const props = defineProps<{
  open: boolean
  mode: 'create' | 'edit' | 'duplicate'
  workspacePath: string | null
  template: TemplateDocument
}>()

const emit = defineEmits<{
  close: []
  saved: [template: TemplateDocument]
}>()

const { t } = useI18n()

const saving = ref(false)
const error = ref<string | null>(null)
const iconPickerOpen = ref(false)
const iconPickerTriggerRef = ref<HTMLElement | null>(null)
const iconPickerPosition = ref({ top: 0, left: 0 })
const editingTemplate = reactive<TemplateDocument>({ ...props.template })
const editingPlainText = ref(noteContentToPlainText(props.template.content))

const fieldTypeOptions = computed(() => (['text', 'multiline', 'date', 'select', 'checkbox'] as TemplateFieldType[]).map(value => ({
  value,
  label: t(`templates.fieldTypes.${value}`),
})))

function updateIconPickerPosition() {
  if (!iconPickerTriggerRef.value) return
  const rect = iconPickerTriggerRef.value.getBoundingClientRect()
  iconPickerPosition.value = {
    top: rect.bottom + 8,
    left: Math.min(rect.left, window.innerWidth - 320 - 16),
  }
}

function toggleIconPicker() {
  iconPickerOpen.value = !iconPickerOpen.value
  if (iconPickerOpen.value) {
    updateIconPickerPosition()
  }
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
  return message
}

function slugify(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80)
}

function normalizeEditableTemplate(): TemplateDocument {
  const id = slugify(editingTemplate.id || editingTemplate.name)
  return {
    ...JSON.parse(JSON.stringify(editingTemplate)),
    id,
    name: editingTemplate.name.trim(),
    icon: editingTemplate.icon.trim() || '📄',
    description: editingTemplate.description.trim(),
    content: plainTextToNoteContent(editingPlainText.value) as BlockNode,
    fields: editingTemplate.fields.map(field => ({
      ...field,
      id: slugify(field.id || field.label),
      label: field.label.trim() || field.id,
      options: field.type === 'select' ? (field.options ?? []).filter(Boolean) : undefined,
    })),
    builtIn: false,
  }
}

async function saveEditableTemplate() {
  if (!props.workspacePath) return
  const template = normalizeEditableTemplate()
  if (!template.id || !template.name) {
    error.value = t('templates.errors.nameRequired')
    return
  }
  saving.value = true
  error.value = null
  try {
    const saved = props.mode === 'edit'
      ? await templateCommands.updateTemplate(props.workspacePath, template.id, template)
      : await templateCommands.createTemplate(props.workspacePath, template)
    emit('saved', saved)
  } catch (err) {
    error.value = localizeTemplateError(err)
  } finally {
    saving.value = false
  }
}

function addField() {
  editingTemplate.fields.push({
    id: `field-${editingTemplate.fields.length + 1}`,
    label: t('templates.fieldLabel'),
    type: 'text',
    required: false,
    defaultValue: '',
  })
}

function removeField(index: number) {
  editingTemplate.fields.splice(index, 1)
}

function moveField(index: number, direction: -1 | 1) {
  const target = index + direction
  if (target < 0 || target >= editingTemplate.fields.length) return
  const [field] = editingTemplate.fields.splice(index, 1)
  editingTemplate.fields.splice(target, 0, field)
}

function updateSelectOptions(field: TemplateField, value: string) {
  field.options = value.split('\n').map(option => option.trim()).filter(Boolean)
}

function onGlobalKeyDown(event: KeyboardEvent) {
  if (!props.open || event.key !== 'Escape') return
  if (document.body.classList.contains('nv-select-open')) return

  event.preventDefault()
  event.stopPropagation()
  
  if (iconPickerOpen.value) {
    iconPickerOpen.value = false
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

watch(() => props.template, (newTpl) => {
  Object.assign(editingTemplate, JSON.parse(JSON.stringify(newTpl)))
  editingPlainText.value = noteContentToPlainText(newTpl.content)
  iconPickerOpen.value = false
  error.value = null
}, { deep: true })
</script>

<template>
  <section class="template-editor" role="dialog" aria-modal="true" :aria-label="t('templates.editorTitle')">
    <header class="template-editor__header">
      <div>
        <h2>{{ t('templates.editorTitle') }}</h2>
        <p>{{ t('templates.editorSubtitle') }}</p>
      </div>
      <NvButton variant="ghost" size="sm" icon @click="emit('close')">
        <X :size="16" />
      </NvButton>
    </header>

    <div class="template-editor__body">
      <div class="template-editor__grid">
        <label class="template-field">
          <span>{{ t('templates.name') }}</span>
          <input v-model="editingTemplate.name" type="text" />
        </label>
        <label class="template-field">
          <span>{{ t('templates.id') }}</span>
          <input v-model="editingTemplate.id" type="text" :disabled="mode === 'edit'" />
        </label>
        <div class="template-field">
          <span>{{ t('templates.icon') }}</span>
          <div class="template-icon-picker-anchor">
            <button ref="iconPickerTriggerRef" type="button" class="template-icon-trigger" @click="toggleIconPicker">
              {{ editingTemplate.icon }}
            </button>
            <Teleport to="body">
              <div
                v-if="iconPickerOpen"
                class="template-icon-picker-popover"
                :style="{ top: `${iconPickerPosition.top}px`, left: `${iconPickerPosition.left}px` }"
              >
                <NvIconPicker
                  :value="editingTemplate.icon"
                  @select="(val) => { editingTemplate.icon = val; iconPickerOpen = false }"
                  @close="iconPickerOpen = false"
                />
              </div>
            </Teleport>
          </div>
        </div>
        <label class="template-field template-field--wide">
          <span>{{ t('templates.description') }}</span>
          <input v-model="editingTemplate.description" type="text" />
        </label>
        <label class="template-field template-field--wide">
          <span>{{ t('templates.content') }}</span>
          <textarea v-model="editingPlainText" rows="8" :placeholder="t('templates.contentPlaceholder')" />
        </label>
      </div>

      <div class="template-editor__fields">
        <div class="template-editor__section-head">
          <h3>{{ t('templates.fields') }}</h3>
          <NvButton variant="ghost" size="xs" @click="addField">
            <Plus :size="13" />{{ t('templates.addField') }}
          </NvButton>
        </div>
        
        <p v-if="error" class="template-error">{{ error }}</p>

        <div v-for="(field, index) in editingTemplate.fields" :key="`${field.id}-${index}`" class="template-field-card">
          <div class="template-field-card__main">
            <div class="template-field-group">
              <span class="template-field-label">{{ t('templates.fieldLabel') }}</span>
              <input v-model="field.label" :placeholder="t('templates.fieldLabel')" />
            </div>
            <div class="template-field-group">
              <span class="template-field-label">{{ t('templates.fieldId') }}</span>
              <input v-model="field.id" :placeholder="t('templates.fieldId')" />
            </div>
            <div class="template-field-group">
              <span class="template-field-label">{{ t('templates.type') }}</span>
              <div class="template-field-type-row">
                <NvSelect v-model="field.type" :options="fieldTypeOptions" />
                <NvCheckbox v-model="field.required" :label="t('templates.requiredShort')" />
              </div>
            </div>
          </div>

          <div v-if="field.type !== 'checkbox'" class="template-field-card__extra">
            <div class="template-field-group">
              <span class="template-field-label">{{ t('templates.defaultValue') }}</span>
              <input v-model="field.defaultValue" :placeholder="t('templates.defaultValue')" />
            </div>
            <div v-if="field.type === 'select'" class="template-field-group">
              <span class="template-field-label">{{ t('templates.options') }}</span>
              <textarea :value="(field.options ?? []).join('\n')" rows="2" :placeholder="t('templates.options')" @input="updateSelectOptions(field, ($event.target as HTMLTextAreaElement).value)" />
            </div>
          </div>

          <div class="template-field-card__actions">
            <NvButton variant="ghost" size="xs" icon :title="t('workspace.context.moveUp')" @click="moveField(index, -1)">
              <ChevronUp :size="13" />
            </NvButton>
            <NvButton variant="ghost" size="xs" icon :title="t('workspace.context.moveDown')" @click="moveField(index, 1)">
              <ChevronDown :size="13" />
            </NvButton>
            <NvButton variant="danger" size="xs" icon :title="t('workspace.context.delete')" @click="removeField(index)">
              <Trash2 :size="13" />
            </NvButton>
          </div>
        </div>
      </div>
    </div>

    <footer class="template-editor__footer">
      <NvButton variant="ghost" @click="emit('close')">{{ t('workspace.context.cancel') }}</NvButton>
      <NvButton :disabled="saving" @click="saveEditableTemplate">{{ t('templates.save') }}</NvButton>
    </footer>
  </section>
</template>

<style scoped>
.template-editor {
  position: fixed;
  width: min(760px, calc(100vw - 32px));
  max-height: min(820px, calc(100vh - 32px));
  display: flex;
  flex-direction: column;
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
  background: var(--surface-1);
  color: var(--text-primary);
  box-shadow: var(--shadow-2xl);
  overflow: hidden;
}

.template-editor__header,
.template-editor__footer {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  border-bottom: 1px solid var(--border-subtle);
}

.template-editor__header {
  justify-content: space-between;
}

.template-editor__header h2,
.template-editor__section-head h3 {
  margin: 0;
  font-size: 15px;
}

.template-editor__header p {
  margin: 3px 0 0;
  color: var(--text-secondary);
  font-size: 12px;
}

.template-editor__body {
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}

.template-editor__grid,
.template-editor__fields {
  padding: 14px 16px;
}

.template-editor__grid {
  display: grid;
  grid-template-columns: 1fr 1fr auto;
  gap: 12px;
}

.template-editor__fields {
  display: grid;
  gap: 12px;
}

.template-editor__section-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 4px;
}

.template-field-card {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  padding-right: 48px;
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
  background: var(--surface-2);
}

.template-field-card__main {
  display: grid;
  grid-template-columns: 1fr 1fr 1.2fr;
  gap: 16px;
}

.template-field-card__extra {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  padding-top: 12px;
  border-top: 1px dashed var(--border-subtle);
}

.template-field-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.template-field-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.02em;
}

.template-field {
  display: grid;
  gap: 6px;
  font-size: 12px;
  color: var(--text-secondary);
}

.template-field input,
.template-field textarea,
.template-field-group input,
.template-field-group textarea {
  width: 100%;
  border: 1px solid var(--border-subtle);
  border-radius: 6px;
  background: var(--surface-2);
  color: var(--text-primary);
  padding: 7px 9px;
  font: inherit;
}

.template-field--wide {
  grid-column: 1 / -1;
}

.template-field-type-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.template-field-type-row :deep(.nv-select) {
  flex: 1;
}

.template-field-card__actions {
  position: absolute;
  top: 12px;
  right: 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
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

.template-icon-btn--danger:hover {
  background: var(--danger-soft, #ff6b6b22);
  color: var(--danger, #ff6b6b);
  border-color: var(--danger, #ff6b6b);
}

.template-icon-picker-anchor {
  position: relative;
}

.template-icon-trigger {
  display: grid;
  place-items: center;
  width: 100%;
  height: 34px;
  border: 1px solid var(--border-subtle);
  border-radius: 6px;
  background: var(--surface-2);
  color: var(--text-primary);
  font-size: 16px;
  cursor: pointer;
}

.template-icon-picker-popover {
  position: fixed;
  z-index: 3000;
  width: 320px;
  height: 400px;
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
  background: var(--surface-1);
  box-shadow: var(--shadow-xl);
  overflow: hidden;
}

.template-editor__footer {
  justify-content: flex-end;
  border-top: 1px solid var(--border-subtle);
  border-bottom: 0;
}

.template-error {
  color: var(--danger, #ff6b6b);
  font-size: 12px;
  margin: 0 0 8px;
}

@media (max-width: 760px) {
  .template-editor__grid,
  .template-field-card__main,
  .template-field-card__extra {
    grid-template-columns: 1fr;
  }

  .template-field-card {
    padding-right: 16px;
    padding-bottom: 56px;
  }

  .template-field-card__actions {
    position: static;
    flex-direction: row;
    justify-content: flex-end;
    margin-top: 12px;
  }
}
</style>
