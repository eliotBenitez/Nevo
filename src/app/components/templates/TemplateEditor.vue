<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { ChevronDown, ChevronUp, Plus, Trash2, X } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'
import type { BlockNode } from '../../../types/note'
import type { TemplateDocument, TemplateField, TemplateFieldType } from '../../../types/template'
import { useWorkspaceStore } from '../../../stores/workspace'
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
const workspaceStore = useWorkspaceStore()

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
  const backend = workspaceStore.backend
  if (!backend) return
  const template = normalizeEditableTemplate()
  if (!template.id || !template.name) {
    error.value = t('templates.errors.nameRequired')
    return
  }
  saving.value = true
  error.value = null
  try {
    const saved = props.mode === 'edit'
      ? await backend.updateTemplate(template.id, template)
      : await backend.createTemplate(template)
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
  <section class="template-editor tw:fixed tw:inset-0 tw:z-[var(--z-popover)] tw:m-auto tw:w-[min(760px,calc(100vw-32px))] tw:max-h-[min(820px,calc(100vh-32px))] tw:flex tw:flex-col tw:border tw:border-solid tw:border-border-subtle tw:rounded-[calc(8px*var(--radius-scale,1))] tw:bg-surface-raised tw:text-content-primary tw:shadow-2xl tw:overflow-hidden" role="dialog" aria-modal="true" :aria-label="t('templates.editorTitle')">
    <header class="template-editor__header tw:flex tw:items-center tw:justify-between tw:gap-3 tw:px-4 tw:py-3.5 tw:border-b tw:border-solid tw:border-border-subtle [&_h2]:tw:m-0 [&_h2]:tw:text-[15px] [&_p]:tw:mt-[3px] [&_p]:tw:mb-0 [&_p]:tw:text-content-secondary [&_p]:tw:text-xs">
      <div>
        <h2>{{ t('templates.editorTitle') }}</h2>
        <p>{{ t('templates.editorSubtitle') }}</p>
      </div>
      <NvButton variant="ghost" size="sm" icon @click="emit('close')">
        <X :size="16" />
      </NvButton>
    </header>

    <div class="template-editor__body tw:overflow-y-auto tw:flex tw:flex-col">
      <div class="template-editor__grid tw:p-4 tw:grid tw:grid-cols-[1fr_1fr_auto] tw:gap-3 max-[760px]:tw:grid-cols-1">
        <label class="template-field tw:grid tw:gap-1.5 tw:text-xs tw:text-content-secondary [&_input]:tw:w-full [&_input]:tw:border [&_input]:tw:border-solid [&_input]:tw:border-border-subtle [&_input]:tw:rounded-[calc(6px*var(--radius-scale,1))] [&_input]:tw:bg-surface-overlay [&_input]:tw:text-content-primary [&_input]:tw:py-[7px] [&_input]:tw:px-[9px] [&_input]:tw:font-inherit [&_textarea]:tw:w-full [&_textarea]:tw:border [&_textarea]:tw:border-solid [&_textarea]:tw:border-border-subtle [&_textarea]:tw:rounded-[calc(6px*var(--radius-scale,1))] [&_textarea]:tw:bg-surface-overlay [&_textarea]:tw:text-content-primary [&_textarea]:tw:py-[7px] [&_textarea]:tw:px-[9px] [&_textarea]:tw:font-inherit">
          <span>{{ t('templates.name') }}</span>
          <input v-model="editingTemplate.name" type="text" />
        </label>
        <label class="template-field tw:grid tw:gap-1.5 tw:text-xs tw:text-content-secondary [&_input]:tw:w-full [&_input]:tw:border [&_input]:tw:border-solid [&_input]:tw:border-border-subtle [&_input]:tw:rounded-[calc(6px*var(--radius-scale,1))] [&_input]:tw:bg-surface-overlay [&_input]:tw:text-content-primary [&_input]:tw:py-[7px] [&_input]:tw:px-[9px] [&_input]:tw:font-inherit [&_textarea]:tw:w-full [&_textarea]:tw:border [&_textarea]:tw:border-solid [&_textarea]:tw:border-border-subtle [&_textarea]:tw:rounded-[calc(6px*var(--radius-scale,1))] [&_textarea]:tw:bg-surface-overlay [&_textarea]:tw:text-content-primary [&_textarea]:tw:py-[7px] [&_textarea]:tw:px-[9px] [&_textarea]:tw:font-inherit">
          <span>{{ t('templates.id') }}</span>
          <input v-model="editingTemplate.id" type="text" :disabled="mode === 'edit'" />
        </label>
        <div class="template-field tw:grid tw:gap-1.5 tw:text-xs tw:text-content-secondary [&_input]:tw:w-full [&_input]:tw:border [&_input]:tw:border-solid [&_input]:tw:border-border-subtle [&_input]:tw:rounded-[calc(6px*var(--radius-scale,1))] [&_input]:tw:bg-surface-overlay [&_input]:tw:text-content-primary [&_input]:tw:py-[7px] [&_input]:tw:px-[9px] [&_input]:tw:font-inherit [&_textarea]:tw:w-full [&_textarea]:tw:border [&_textarea]:tw:border-solid [&_textarea]:tw:border-border-subtle [&_textarea]:tw:rounded-[calc(6px*var(--radius-scale,1))] [&_textarea]:tw:bg-surface-overlay [&_textarea]:tw:text-content-primary [&_textarea]:tw:py-[7px] [&_textarea]:tw:px-[9px] [&_textarea]:tw:font-inherit">
          <span>{{ t('templates.icon') }}</span>
          <div class="template-icon-picker-anchor tw:relative">
            <button ref="iconPickerTriggerRef" type="button" class="template-icon-trigger tw:grid tw:place-items-center tw:w-full tw:h-[34px] tw:border tw:border-solid tw:border-border-subtle tw:rounded-[calc(6px*var(--radius-scale,1))] tw:bg-surface-overlay tw:text-content-primary tw:text-base tw:cursor-pointer" @click="toggleIconPicker">
              {{ editingTemplate.icon }}
            </button>
            <Teleport to="body">
              <div
                v-if="iconPickerOpen"
                class="template-icon-picker-popover tw:fixed tw:z-[3000] tw:w-[320px] tw:h-[400px] tw:border tw:border-solid tw:border-border-subtle tw:rounded-[calc(8px*var(--radius-scale,1))] tw:bg-surface-raised tw:shadow-xl tw:overflow-hidden"
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
        <label class="template-field template-field--wide tw:col-span-full tw:grid tw:gap-1.5 tw:text-xs tw:text-content-secondary [&_input]:tw:w-full [&_input]:tw:border [&_input]:tw:border-solid [&_input]:tw:border-border-subtle [&_input]:tw:rounded-[calc(6px*var(--radius-scale,1))] [&_input]:tw:bg-surface-overlay [&_input]:tw:text-content-primary [&_input]:tw:py-[7px] [&_input]:tw:px-[9px] [&_input]:tw:font-inherit [&_textarea]:tw:w-full [&_textarea]:tw:border [&_textarea]:tw:border-solid [&_textarea]:tw:border-border-subtle [&_textarea]:tw:rounded-[calc(6px*var(--radius-scale,1))] [&_textarea]:tw:bg-surface-overlay [&_textarea]:tw:text-content-primary [&_textarea]:tw:py-[7px] [&_textarea]:tw:px-[9px] [&_textarea]:tw:font-inherit">
          <span>{{ t('templates.description') }}</span>
          <input v-model="editingTemplate.description" type="text" />
        </label>
        <label class="template-field template-field--wide tw:col-span-full tw:grid tw:gap-1.5 tw:text-xs tw:text-content-secondary [&_input]:tw:w-full [&_input]:tw:border [&_input]:tw:border-solid [&_input]:tw:border-border-subtle [&_input]:tw:rounded-[calc(6px*var(--radius-scale,1))] [&_input]:tw:bg-surface-overlay [&_input]:tw:text-content-primary [&_input]:tw:py-[7px] [&_input]:tw:px-[9px] [&_input]:tw:font-inherit [&_textarea]:tw:w-full [&_textarea]:tw:border [&_textarea]:tw:border-solid [&_textarea]:tw:border-border-subtle [&_textarea]:tw:rounded-[calc(6px*var(--radius-scale,1))] [&_textarea]:tw:bg-surface-overlay [&_textarea]:tw:text-content-primary [&_textarea]:tw:py-[7px] [&_textarea]:tw:px-[9px] [&_textarea]:tw:font-inherit">
          <span>{{ t('templates.content') }}</span>
          <textarea v-model="editingPlainText" rows="8" :placeholder="t('templates.contentPlaceholder')" />
        </label>
      </div>

      <div class="template-editor__fields tw:p-4 tw:grid tw:gap-3">
        <div class="template-editor__section-head tw:flex tw:justify-between tw:items-center tw:mb-1 [&_h3]:tw:m-0 [&_h3]:tw:text-[15px]">
          <h3>{{ t('templates.fields') }}</h3>
          <NvButton variant="ghost" size="xs" @click="addField">
            <Plus :size="13" />{{ t('templates.addField') }}
          </NvButton>
        </div>
        
        <p v-if="error" class="template-error tw:text-danger tw:text-xs tw:m-0 tw:mb-2">{{ error }}</p>

        <div v-for="(field, index) in editingTemplate.fields" :key="`${field.id}-${index}`" class="template-field-card tw:relative tw:flex tw:flex-col tw:gap-3 tw:p-4 tw:pr-12 tw:border tw:border-solid tw:border-border-subtle tw:rounded-[calc(8px*var(--radius-scale,1))] tw:bg-surface-overlay max-[760px]:tw:pr-4 max-[760px]:tw:pb-14">
          <div class="template-field-card__main tw:grid tw:grid-cols-[1fr_1fr_1.2fr] tw:gap-4 max-[760px]:tw:grid-cols-1">
            <div class="template-field-group tw:flex tw:flex-col tw:gap-1.5 [&_input]:tw:w-full [&_input]:tw:border [&_input]:tw:border-solid [&_input]:tw:border-border-subtle [&_input]:tw:rounded-[calc(6px*var(--radius-scale,1))] [&_input]:tw:bg-surface-overlay [&_input]:tw:text-content-primary [&_input]:tw:py-[7px] [&_input]:tw:px-[9px] [&_input]:tw:font-inherit [&_textarea]:tw:w-full [&_textarea]:tw:border [&_textarea]:tw:border-solid [&_textarea]:tw:border-border-subtle [&_textarea]:tw:rounded-[calc(6px*var(--radius-scale,1))] [&_textarea]:tw:bg-surface-overlay [&_textarea]:tw:text-content-primary [&_textarea]:tw:py-[7px] [&_textarea]:tw:px-[9px] [&_textarea]:tw:font-inherit">
              <span class="template-field-label tw:text-[11px] tw:font-semibold tw:text-content-secondary tw:uppercase tw:tracking-[0.02em]">{{ t('templates.fieldLabel') }}</span>
              <input v-model="field.label" :placeholder="t('templates.fieldLabel')" />
            </div>
            <div class="template-field-group tw:flex tw:flex-col tw:gap-1.5 [&_input]:tw:w-full [&_input]:tw:border [&_input]:tw:border-solid [&_input]:tw:border-border-subtle [&_input]:tw:rounded-[calc(6px*var(--radius-scale,1))] [&_input]:tw:bg-surface-overlay [&_input]:tw:text-content-primary [&_input]:tw:py-[7px] [&_input]:tw:px-[9px] [&_input]:tw:font-inherit [&_textarea]:tw:w-full [&_textarea]:tw:border [&_textarea]:tw:border-solid [&_textarea]:tw:border-border-subtle [&_textarea]:tw:rounded-[calc(6px*var(--radius-scale,1))] [&_textarea]:tw:bg-surface-overlay [&_textarea]:tw:text-content-primary [&_textarea]:tw:py-[7px] [&_textarea]:tw:px-[9px] [&_textarea]:tw:font-inherit">
              <span class="template-field-label tw:text-[11px] tw:font-semibold tw:text-content-secondary tw:uppercase tw:tracking-[0.02em]">{{ t('templates.fieldId') }}</span>
              <input v-model="field.id" :placeholder="t('templates.fieldId')" />
            </div>
            <div class="template-field-group tw:flex tw:flex-col tw:gap-1.5 [&_input]:tw:w-full [&_input]:tw:border [&_input]:tw:border-solid [&_input]:tw:border-border-subtle [&_input]:tw:rounded-[calc(6px*var(--radius-scale,1))] [&_input]:tw:bg-surface-overlay [&_input]:tw:text-content-primary [&_input]:tw:py-[7px] [&_input]:tw:px-[9px] [&_input]:tw:font-inherit [&_textarea]:tw:w-full [&_textarea]:tw:border [&_textarea]:tw:border-solid [&_textarea]:tw:border-border-subtle [&_textarea]:tw:rounded-[calc(6px*var(--radius-scale,1))] [&_textarea]:tw:bg-surface-overlay [&_textarea]:tw:text-content-primary [&_textarea]:tw:py-[7px] [&_textarea]:tw:px-[9px] [&_textarea]:tw:font-inherit">
              <span class="template-field-label tw:text-[11px] tw:font-semibold tw:text-content-secondary tw:uppercase tw:tracking-[0.02em]">{{ t('templates.type') }}</span>
              <div class="template-field-type-row tw:flex tw:items-center tw:gap-3 [&_.nv-select]:tw:flex-1">
                <NvSelect v-model="field.type" :options="fieldTypeOptions" />
                <NvCheckbox v-model="field.required" :label="t('templates.requiredShort')" />
              </div>
            </div>
          </div>

          <div v-if="field.type !== 'checkbox'" class="template-field-card__extra tw:grid tw:grid-cols-2 tw:gap-4 tw:pt-3 tw:border-t tw:border-dashed tw:border-border-subtle max-[760px]:tw:grid-cols-1">
            <div class="template-field-group tw:flex tw:flex-col tw:gap-1.5 [&_input]:tw:w-full [&_input]:tw:border [&_input]:tw:border-solid [&_input]:tw:border-border-subtle [&_input]:tw:rounded-[calc(6px*var(--radius-scale,1))] [&_input]:tw:bg-surface-overlay [&_input]:tw:text-content-primary [&_input]:tw:py-[7px] [&_input]:tw:px-[9px] [&_input]:tw:font-inherit [&_textarea]:tw:w-full [&_textarea]:tw:border [&_textarea]:tw:border-solid [&_textarea]:tw:border-border-subtle [&_textarea]:tw:rounded-[calc(6px*var(--radius-scale,1))] [&_textarea]:tw:bg-surface-overlay [&_textarea]:tw:text-content-primary [&_textarea]:tw:py-[7px] [&_textarea]:tw:px-[9px] [&_textarea]:tw:font-inherit">
              <span class="template-field-label tw:text-[11px] tw:font-semibold tw:text-content-secondary tw:uppercase tw:tracking-[0.02em]">{{ t('templates.defaultValue') }}</span>
              <input v-model="field.defaultValue" :placeholder="t('templates.defaultValue')" />
            </div>
            <div v-if="field.type === 'select'" class="template-field-group tw:flex tw:flex-col tw:gap-1.5 [&_input]:tw:w-full [&_input]:tw:border [&_input]:tw:border-solid [&_input]:tw:border-border-subtle [&_input]:tw:rounded-[calc(6px*var(--radius-scale,1))] [&_input]:tw:bg-surface-overlay [&_input]:tw:text-content-primary [&_input]:tw:py-[7px] [&_input]:tw:px-[9px] [&_input]:tw:font-inherit [&_textarea]:tw:w-full [&_textarea]:tw:border [&_textarea]:tw:border-solid [&_textarea]:tw:border-border-subtle [&_textarea]:tw:rounded-[calc(6px*var(--radius-scale,1))] [&_textarea]:tw:bg-surface-overlay [&_textarea]:tw:text-content-primary [&_textarea]:tw:py-[7px] [&_textarea]:tw:px-[9px] [&_textarea]:tw:font-inherit">
              <span class="template-field-label tw:text-[11px] tw:font-semibold tw:text-content-secondary tw:uppercase tw:tracking-[0.02em]">{{ t('templates.options') }}</span>
              <textarea :value="(field.options ?? []).join('\n')" rows="2" :placeholder="t('templates.options')" @input="updateSelectOptions(field, ($event.target as HTMLTextAreaElement).value)" />
            </div>
          </div>

          <div class="template-field-card__actions tw:absolute tw:top-3 tw:right-3 tw:flex tw:flex-col tw:gap-1.5 max-[760px]:tw:static max-[760px]:tw:flex-row max-[760px]:tw:justify-end max-[760px]:tw:mt-3">
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

    <footer class="template-editor__footer tw:flex tw:items-center tw:justify-end tw:gap-3 tw:px-4 tw:py-3.5 tw:border-t tw:border-solid tw:border-border-subtle">
      <NvButton variant="ghost" @click="emit('close')">{{ t('workspace.context.cancel') }}</NvButton>
      <NvButton :disabled="saving" @click="saveEditableTemplate">{{ t('templates.save') }}</NvButton>
    </footer>
  </section>
</template>
