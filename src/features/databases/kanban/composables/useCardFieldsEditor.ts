import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { KanbanCard, KanbanCardField, KanbanPropertyType } from '../../../../types/kanban'
import { cloneCardFields, createKanbanId, normalizeFieldValue } from '../kanbanFields'

/** Local custom-field editing state + operations for the Kanban card modal,
 *  extracted from KanbanCardModal. Owns `localFields` and the per-field number
 *  drafts; `markDirty` is invoked on every mutation. */
export function useCardFieldsEditor(card: KanbanCard, markDirty: () => void) {
  const { t } = useI18n()

  const localFields = ref<KanbanCardField[]>(cloneCardFields(card))
  const numberFieldDrafts = ref<Record<string, { value: number; isNull: boolean }>>({})

  function resetFields(nextCard: KanbanCard) {
    localFields.value = cloneCardFields(nextCard)
  }

  function syncFieldOrders() {
    localFields.value = localFields.value.map((field, index) => ({ ...field, order: index }))
  }

  function syncNumberFieldDrafts(fields: KanbanCardField[]) {
    const nextDrafts: Record<string, { value: number; isNull: boolean }> = {}

    for (const field of fields) {
      if (field.type !== 'number') continue
      const existing = numberFieldDrafts.value[field.id]

      nextDrafts[field.id] = typeof field.value === 'number'
        ? { value: field.value, isNull: false }
        : { value: existing?.value ?? 0, isNull: true }
    }

    numberFieldDrafts.value = nextDrafts
  }

  watch(localFields, fields => {
    syncNumberFieldDrafts(fields)
  }, { deep: true, immediate: true })

  function numberFieldModelValue(fieldId: string) {
    return numberFieldDrafts.value[fieldId]?.value ?? 0
  }

  function numberFieldIsNull(fieldId: string) {
    return numberFieldDrafts.value[fieldId]?.isNull ?? true
  }

  function updateNumberFieldValue(fieldId: string, value: number) {
    numberFieldDrafts.value = {
      ...numberFieldDrafts.value,
      [fieldId]: { value, isNull: false },
    }
    updateFieldValue(fieldId, value)
  }

  function clearNumberFieldValue(fieldId: string) {
    const currentValue = numberFieldDrafts.value[fieldId]?.value ?? 0
    numberFieldDrafts.value = {
      ...numberFieldDrafts.value,
      [fieldId]: { value: currentValue, isNull: true },
    }
    updateFieldValue(fieldId, null)
  }

  function createField(type: KanbanPropertyType) {
    const options = type === 'select' || type === 'multi_select'
      ? [{ id: createKanbanId(), name: t('kanban.card.optionDefault') }]
      : undefined

    const field: KanbanCardField = {
      id: createKanbanId(),
      name: t('kanban.card.newField'),
      type,
      value: normalizeFieldValue(type, null),
      options,
      order: localFields.value.length,
    }

    if (type === 'text') field.value = ''
    if (type === 'multi_select') field.value = []
    if (type === 'checkbox') field.value = false

    localFields.value = [...localFields.value, field]
    syncFieldOrders()
    markDirty()
  }

  function updateFieldType(fieldId: string, type: KanbanPropertyType) {
    localFields.value = localFields.value.map(field => {
      if (field.id !== fieldId) return field
      const nextField: KanbanCardField = {
        ...field,
        type,
        value: normalizeFieldValue(type, field.value),
        options: type === 'select' || type === 'multi_select'
          ? (field.options?.length ? field.options : [{ id: createKanbanId(), name: t('kanban.card.optionDefault') }])
          : undefined,
      }
      if (type === 'text' && nextField.value === null) nextField.value = ''
      if (type === 'multi_select' && nextField.value === null) nextField.value = []
      if (type === 'checkbox' && nextField.value === null) nextField.value = false
      return nextField
    })
    markDirty()
  }

  function updateFieldValue(fieldId: string, value: KanbanCardField['value']) {
    localFields.value = localFields.value.map(field =>
      field.id === fieldId ? { ...field, value } : field,
    )
    markDirty()
  }

  function updateFieldName(fieldId: string, name: string) {
    localFields.value = localFields.value.map(field =>
      field.id === fieldId ? { ...field, name } : field,
    )
    markDirty()
  }

  function removeField(fieldId: string) {
    localFields.value = localFields.value.filter(field => field.id !== fieldId)
    syncFieldOrders()
    markDirty()
  }

  function addFieldOption(fieldId: string) {
    localFields.value = localFields.value.map(field => {
      if (field.id !== fieldId) return field
      return {
        ...field,
        options: [...(field.options ?? []), { id: createKanbanId(), name: t('kanban.card.optionDefault') }],
      }
    })
    markDirty()
  }

  function updateFieldOption(fieldId: string, optionId: string, name: string) {
    localFields.value = localFields.value.map(field => {
      if (field.id !== fieldId) return field
      return {
        ...field,
        options: (field.options ?? []).map(option => option.id === optionId ? { ...option, name } : option),
      }
    })
    markDirty()
  }

  function removeFieldOption(fieldId: string, optionId: string) {
    localFields.value = localFields.value.map(field => {
      if (field.id !== fieldId) return field
      const nextOptions = (field.options ?? []).filter(option => option.id !== optionId)
      const nextValue = field.type === 'multi_select' && Array.isArray(field.value)
        ? field.value.filter(value => value !== optionId)
        : field.type === 'select' && field.value === optionId
          ? null
          : field.value

      return {
        ...field,
        options: nextOptions,
        value: nextValue,
      }
    })
    markDirty()
  }

  function toggleMultiSelect(field: KanbanCardField, optionId: string, checked: boolean) {
    const current = Array.isArray(field.value) ? [...field.value] : []
    updateFieldValue(
      field.id,
      checked ? [...current, optionId] : current.filter(value => value !== optionId),
    )
  }

  function selectOptions(field: KanbanCardField) {
    return (field.options ?? []).map(option => ({ value: option.id, label: option.name }))
  }

  function optionLabel(field: KanbanCardField, optionId: string) {
    return field.options?.find(option => option.id === optionId)?.name ?? optionId
  }

  function hasFieldOptions(field: KanbanCardField) {
    return field.type === 'select' || field.type === 'multi_select'
  }

  return {
    localFields,
    resetFields,
    numberFieldModelValue,
    numberFieldIsNull,
    updateNumberFieldValue,
    clearNumberFieldValue,
    createField,
    updateFieldType,
    updateFieldValue,
    updateFieldName,
    removeField,
    addFieldOption,
    updateFieldOption,
    removeFieldOption,
    toggleMultiSelect,
    selectOptions,
    optionLabel,
    hasFieldOptions,
  }
}
