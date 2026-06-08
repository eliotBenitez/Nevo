import type {
  KanbanBoard,
  KanbanBoardCardViewSettings,
  KanbanCard,
  KanbanCardField,
  KanbanCardPropValue,
  KanbanPropertyDef,
  KanbanPropertyOption,
  KanbanPropertyType,
} from '../../../types/kanban'

export const DEFAULT_BOARD_CARD_VIEW_SETTINGS: Required<Pick<KanbanBoardCardViewSettings, 'showCardPreview' | 'cardDensity'>> = {
  showCardPreview: true,
  cardDensity: 'comfortable',
}

export interface KanbanFieldDescriptor {
  id: string
  name: string
  type: KanbanPropertyType
  options?: KanbanPropertyOption[]
}

export function createKanbanId() {
  return (crypto as Crypto).randomUUID()
}

export function cloneStatusProperties(card: Pick<KanbanCard, 'properties'>): Record<string, KanbanCardPropValue> {
  const properties = isRecordObject(card.properties) ? card.properties as Record<string, KanbanCardPropValue> : {}
  return { ...properties }
}

export function getBoardStatusProperty(board: Pick<KanbanBoard, 'propertyDefinitions' | 'statusPropertyId'>): KanbanPropertyDef | null {
  if (!Array.isArray(board.propertyDefinitions)) return null
  return board.propertyDefinitions.find(prop => prop.id === board.statusPropertyId) ?? null
}

export function getBoardColumns(board: Pick<KanbanBoard, 'propertyDefinitions' | 'statusPropertyId'>): KanbanPropertyOption[] {
  return getBoardStatusProperty(board)?.options ?? []
}

export function getCardStatusValue(
  card: Pick<KanbanCard, 'properties'>,
  board: Pick<KanbanBoard, 'statusPropertyId'>,
): string {
  const value = cloneStatusProperties(card)[board.statusPropertyId]
  return typeof value === 'string' ? value : ''
}

export function normalizeCard(board: KanbanBoard, card: KanbanCard): KanbanCard {
  return {
    ...card,
    properties: cloneStatusProperties(card),
    fields: normalizeCardFields(board, card),
  }
}

export function normalizeBoard(board: KanbanBoard): KanbanBoard {
  return {
    ...board,
    propertyDefinitions: Array.isArray(board.propertyDefinitions) ? board.propertyDefinitions : [],
    viewSettings: normalizeViewSettings(board.viewSettings),
  }
}

export function normalizeViewSettings(settings: KanbanBoard['viewSettings']): KanbanBoard['viewSettings'] {
  const boardSettings = settings && typeof settings === 'object' && !Array.isArray(settings)
    ? settings.board
    : undefined

  return {
    board: {
      visiblePropertyIds: Array.isArray(boardSettings?.visiblePropertyIds)
        ? boardSettings.visiblePropertyIds.filter((id): id is string => typeof id === 'string')
        : undefined,
      propertyOrder: Array.isArray(boardSettings?.propertyOrder)
        ? boardSettings.propertyOrder.filter((id): id is string => typeof id === 'string')
        : undefined,
      showCardPreview: typeof boardSettings?.showCardPreview === 'boolean'
        ? boardSettings.showCardPreview
        : DEFAULT_BOARD_CARD_VIEW_SETTINGS.showCardPreview,
      cardDensity: boardSettings?.cardDensity === 'compact' || boardSettings?.cardDensity === 'comfortable'
        ? boardSettings.cardDensity
        : DEFAULT_BOARD_CARD_VIEW_SETTINGS.cardDensity,
    },
  }
}

export function normalizeCardFields(
  board: Pick<KanbanBoard, 'propertyDefinitions' | 'statusPropertyId'>,
  card: Partial<Pick<KanbanCard, 'fields' | 'properties'>>,
): KanbanCardField[] {
  const explicitFields = Array.isArray(card.fields)
    ? card.fields.map(normalizeField).filter((field): field is KanbanCardField => field !== null)
    : []

  if (explicitFields.length > 0) {
    return explicitFields.sort((a, b) => a.order - b.order).map((field, index) => ({ ...field, order: index }))
  }

  const legacyProperties = isObjectRecord(card.properties) ? card.properties : {}
  const legacyDefs = Array.isArray(board.propertyDefinitions)
    ? board.propertyDefinitions.filter(def => def.id !== board.statusPropertyId)
    : []

  return legacyDefs
    .map(def => legacyDefinitionToField(def, legacyProperties[def.id]))
    .filter((field): field is KanbanCardField => field !== null)
    .sort((a, b) => a.order - b.order)
    .map((field, index) => ({ ...field, order: index }))
}

export function serializeCardProperties(
  board: Pick<KanbanBoard, 'statusPropertyId' | 'propertyDefinitions'>,
  card: Pick<KanbanCard, 'properties'>,
  fields: KanbanCardField[],
  statusValue: string,
): Record<string, KanbanCardPropValue> {
  const base = cloneStatusProperties(card)
  const legacyFieldIds = new Set([
    ...fields.map(field => field.id),
    ...(Array.isArray(board.propertyDefinitions)
      ? board.propertyDefinitions.filter(def => def.id !== board.statusPropertyId).map(def => def.id)
      : []),
  ])

  for (const key of legacyFieldIds) {
    delete base[key]
  }

  if (statusValue) {
    base[board.statusPropertyId] = statusValue
  } else {
    delete base[board.statusPropertyId]
  }

  return base
}

export function getCardFieldDescriptors(cards: KanbanCard[], types?: KanbanPropertyType[]): KanbanFieldDescriptor[] {
  const descriptorMap = new Map<string, KanbanFieldDescriptor>()
  for (const card of cards) {
    for (const field of card.fields ?? []) {
      if (types && !types.includes(field.type)) continue
      const id = getFieldDescriptorId(field.name, field.type)
      const existing = descriptorMap.get(id)
      if (!existing) {
        descriptorMap.set(id, {
          id,
          name: field.name,
          type: field.type,
          options: mergeOptions([], field.options ?? []),
        })
        continue
      }

      descriptorMap.set(id, {
        ...existing,
        options: mergeOptions(existing.options ?? [], field.options ?? []),
      })
    }
  }

  return Array.from(descriptorMap.values()).sort((a, b) => a.name.localeCompare(b.name))
}

export function getFieldDescriptorId(name: string, type: KanbanPropertyType) {
  return `${type}::${name.trim().toLocaleLowerCase()}`
}

export function findCardField(card: Pick<KanbanCard, 'fields'>, descriptor: Pick<KanbanFieldDescriptor, 'id'>): KanbanCardField | null {
  const fields = Array.isArray(card.fields) ? card.fields : []
  return fields.find(field => getFieldDescriptorId(field.name, field.type) === descriptor.id) ?? null
}

export function cloneCardFields(card: Pick<KanbanCard, 'fields'>): KanbanCardField[] {
  return (card.fields ?? []).map(field => ({
    ...field,
    options: field.options ? field.options.map(option => ({ ...option })) : undefined,
    value: cloneFieldValue(field.value),
  }))
}

export function normalizeFieldValue(type: KanbanPropertyType, value: unknown): KanbanCardPropValue {
  if (type === 'multi_select') return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
  if (type === 'checkbox') return typeof value === 'boolean' ? value : false
  if (type === 'number') return typeof value === 'number' ? value : null
  if (type === 'date' || type === 'text' || type === 'select') return typeof value === 'string' ? value : null
  return null
}

function normalizeField(field: unknown): KanbanCardField | null {
  if (!isRecordObject(field)) return null
  const rawField = field as Record<string, unknown>
  const id = typeof rawField.id === 'string' ? rawField.id : createKanbanId()
  const name = typeof rawField.name === 'string' ? rawField.name : ''
  const type = isPropertyType(rawField.type) ? rawField.type : null
  if (!type) return null
  const rawOptions = Array.isArray(rawField.options) ? rawField.options : null

  return {
    id,
    name,
    type,
    value: normalizeFieldValue(type, rawField.value),
    options: rawOptions
      ? rawOptions
        .filter(isRecordObject)
        .map(option => ({
          id: typeof option.id === 'string' ? option.id : createKanbanId(),
          name: typeof option.name === 'string' ? option.name : '',
          color: typeof option.color === 'string' ? option.color : undefined,
        }))
      : undefined,
    order: typeof rawField.order === 'number' ? rawField.order : 0,
  }
}

function legacyDefinitionToField(def: KanbanPropertyDef, value: unknown): KanbanCardField | null {
  if (!isPropertyType(def.type)) return null
  return {
    id: def.id,
    name: def.name,
    type: def.type,
    value: normalizeFieldValue(def.type, value),
    options: def.options ? def.options.map(option => ({ ...option })) : undefined,
    order: def.order,
  }
}

function mergeOptions(existing: KanbanPropertyOption[], incoming: KanbanPropertyOption[]) {
  const options = new Map(existing.map(option => [option.name.trim().toLocaleLowerCase(), option]))
  for (const option of incoming) {
    const key = option.name.trim().toLocaleLowerCase()
    if (!key) continue
    if (!options.has(key)) options.set(key, option)
  }
  return Array.from(options.values())
}

function cloneFieldValue(value: KanbanCardPropValue): KanbanCardPropValue {
  return Array.isArray(value) ? [...value] : value
}

function isPropertyType(value: unknown): value is KanbanPropertyType {
  return value === 'text'
    || value === 'select'
    || value === 'multi_select'
    || value === 'date'
    || value === 'number'
    || value === 'checkbox'
}

export interface TaskProgress {
  total: number
  done: number
  pct: number
}

export function computeTaskProgress(content: unknown): TaskProgress | null {
  let total = 0
  let done = 0
  function walk(node: unknown): void {
    if (!node || typeof node !== 'object') return
    const n = node as Record<string, unknown>
    if (n.type === 'checklist_item') {
      total++
      if (n.attrs && typeof n.attrs === 'object' && (n.attrs as Record<string, unknown>).checked === true) {
        done++
      }
    }
    if (Array.isArray(n.content)) n.content.forEach(walk)
  }
  walk(content)
  return total > 0 ? { total, done, pct: Math.round((done / total) * 100) } : null
}

function isObjectRecord(value: unknown): value is Record<string, KanbanCardPropValue> {
  return isRecordObject(value)
}

function isRecordObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}
