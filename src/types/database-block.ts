export type DbFieldType = 'text' | 'number' | 'date' | 'select' | 'multi_select' | 'checkbox' | 'url'

export type DbChartKind = 'bar' | 'line' | 'area' | 'pie'

export type DbAggregate = 'sum' | 'count' | 'avg' | 'min' | 'max'

export type DbViewType = 'table' | 'list' | 'chart' | 'cards'

export type DbTableColorScheme = 'neutral' | 'blue' | 'green' | 'amber' | 'lavender'

export type DbFilterOperator =
  | 'contains'
  | 'not_contains'
  | 'is'
  | 'is_not'
  | 'is_empty'
  | 'is_not_empty'
  | 'eq'
  | 'neq'
  | 'gt'
  | 'lt'
  | 'gte'
  | 'lte'
  | 'before'
  | 'after'
  | 'has_any'
  | 'has_all'
  | 'has_none'

export type DbSortDirection = 'asc' | 'desc'

export type DbCellValue = string | string[] | number | boolean | null

export interface DbFieldOption {
  id: string
  name: string
  color?: string
}

export interface DbField {
  id: string
  name: string
  type: DbFieldType
  options?: DbFieldOption[]
  width?: number
}

export interface DbRecord {
  id: string
  cells: Record<string, DbCellValue>
}

export interface DbFilterRule {
  id: string
  fieldId: string
  operator: DbFilterOperator
  value: string | string[]
}

export interface DbSortRule {
  id: string
  fieldId: string
  direction: DbSortDirection
}

export interface DbChartConfig {
  kind: DbChartKind
  xField: string
  /** First selected value field, retained for documents created before chart series. */
  yField: string
  /** Transitional representation used by diagrams saved before chart series. */
  yFields?: string[]
  /** Explicit series configuration. An empty array means that records are counted. */
  series?: DbChartSeries[]
  aggregate: DbAggregate
}

export interface DbChartSeries {
  id: string
  fieldId: string
}

export interface DbViewStyle {
  gridLines: boolean
  stripedRows: boolean
  compact: boolean
  showRowNumbers: boolean
  rowColorScheme: DbTableColorScheme
}

export interface DbView {
  id: string
  name: string
  type: DbViewType
  filters: DbFilterRule[]
  sorts: DbSortRule[]
  chart?: DbChartConfig
  style?: DbViewStyle
}

/** Legacy in-document representation. It is kept only so existing notes can be
 * opened and migrated without ever discarding their rows. */
export interface DatabaseBlockDataV1 {
  version: 1
  title: string
  fields: DbField[]
  records: DbRecord[]
  activeView: string
  views: DbView[]
}

/**
 * The current representation deliberately contains no records. Records live in
 * DatabaseRepository and are fetched in small ranges by the database node view.
 */
export interface DatabaseBlockDataV2 {
  version: 2
  databaseId: string
  rowCount: number
  title: string
  fields: DbField[]
  activeView: string
  views: DbView[]
}

export type DatabaseBlockData = DatabaseBlockDataV1 | DatabaseBlockDataV2
export type DatabaseBlockMetadata = DatabaseBlockDataV2

export function createDbId(prefix = 'db'): string {
  const rand =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2) + Date.now().toString(36)
  return `${prefix}_${rand}`
}

export function defaultViewStyle(): DbViewStyle {
  return { gridLines: true, stripedRows: false, compact: false, showRowNumbers: true, rowColorScheme: 'neutral' }
}

export function createDefaultDatabaseData(): DatabaseBlockData {
  const nameField: DbField = { id: createDbId('f'), name: 'Name', type: 'text', width: 220 }
  const view: DbView = {
    id: createDbId('v'),
    name: 'Table',
    type: 'table',
    filters: [],
    sorts: [],
    style: defaultViewStyle(),
  }
  return {
    version: 2,
    databaseId: createDbId('database'),
    rowCount: 0,
    title: '',
    fields: [nameField],
    activeView: view.id,
    views: [view],
  }
}

function coerceField(raw: unknown): DbField | null {
  if (!raw || typeof raw !== 'object') return null
  const obj = raw as Record<string, unknown>
  const type = obj.type
  const allowed: DbFieldType[] = ['text', 'number', 'date', 'select', 'multi_select', 'checkbox', 'url']
  if (typeof obj.id !== 'string' || typeof obj.name !== 'string' || !allowed.includes(type as DbFieldType)) {
    return null
  }
  const field: DbField = { id: obj.id, name: obj.name, type: type as DbFieldType }
  if (Array.isArray(obj.options)) {
    field.options = obj.options
      .filter((o): o is Record<string, unknown> => !!o && typeof o === 'object')
      .filter(o => typeof o.id === 'string' && typeof o.name === 'string')
      .map(o => ({ id: o.id as string, name: o.name as string, color: typeof o.color === 'string' ? o.color : undefined }))
  }
  if (typeof obj.width === 'number' && obj.width > 0) field.width = obj.width
  return field
}

function coerceRecord(raw: unknown): DbRecord | null {
  if (!raw || typeof raw !== 'object') return null
  const obj = raw as Record<string, unknown>
  if (typeof obj.id !== 'string') return null
  const cells: Record<string, DbCellValue> = {}
  if (obj.cells && typeof obj.cells === 'object') {
    for (const [key, value] of Object.entries(obj.cells as Record<string, unknown>)) {
      if (
        value === null ||
        typeof value === 'string' ||
        typeof value === 'number' ||
        typeof value === 'boolean' ||
        (Array.isArray(value) && value.every(v => typeof v === 'string'))
      ) {
        cells[key] = value as DbCellValue
      }
    }
  }
  return { id: obj.id, cells }
}

function coerceView(raw: unknown): DbView | null {
  if (!raw || typeof raw !== 'object') return null
  const obj = raw as Record<string, unknown>
  const allowed: DbViewType[] = ['table', 'list', 'chart', 'cards']
  if (typeof obj.id !== 'string' || !allowed.includes(obj.type as DbViewType)) return null
  const view: DbView = {
    id: obj.id,
    name: typeof obj.name === 'string' ? obj.name : 'View',
    type: obj.type as DbViewType,
    filters: Array.isArray(obj.filters) ? (obj.filters as DbFilterRule[]) : [],
    sorts: Array.isArray(obj.sorts) ? (obj.sorts as DbSortRule[]) : [],
  }
  if (obj.chart && typeof obj.chart === 'object') {
    const chart = obj.chart as Record<string, unknown>
    const kinds: DbChartKind[] = ['bar', 'line', 'area', 'pie']
    const aggregates: DbAggregate[] = ['sum', 'count', 'avg', 'min', 'max']
    const legacyYFields = Array.isArray(chart.yFields)
      ? [...new Set(chart.yFields.filter((fieldId): fieldId is string => typeof fieldId === 'string'))]
      : []
    const legacyYField = typeof chart.yField === 'string' ? chart.yField : ''
    if (!legacyYFields.length && legacyYField) legacyYFields.push(legacyYField)
    const seenFieldIds = new Set<string>()
    const series = Array.isArray(chart.series)
      ? chart.series
        .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
        .filter(item => typeof item.id === 'string' && typeof item.fieldId === 'string')
        .filter(item => {
          if (seenFieldIds.has(item.fieldId as string)) return false
          seenFieldIds.add(item.fieldId as string)
          return true
        })
        .map(item => ({ id: item.id as string, fieldId: item.fieldId as string }))
      : legacyYFields.map(fieldId => ({ id: createDbId('series'), fieldId }))
    const yFields = series.map(item => item.fieldId)
    view.chart = {
      kind: kinds.includes(chart.kind as DbChartKind) ? chart.kind as DbChartKind : 'bar',
      xField: typeof chart.xField === 'string' ? chart.xField : '',
      yField: yFields[0] ?? '',
      yFields,
      series,
      aggregate: aggregates.includes(chart.aggregate as DbAggregate) ? chart.aggregate as DbAggregate : 'count',
    }
  }
  if (obj.style && typeof obj.style === 'object') {
    const style = obj.style as Partial<DbViewStyle>
    const schemes: DbTableColorScheme[] = ['neutral', 'blue', 'green', 'amber', 'lavender']
    view.style = {
      ...defaultViewStyle(),
      ...style,
      rowColorScheme: schemes.includes(style.rowColorScheme as DbTableColorScheme) ? style.rowColorScheme as DbTableColorScheme : 'neutral',
    }
  }
  return view
}

/**
 * Normalizes untrusted input (parsed JSON from node attrs / clipboard) into a valid
 * DatabaseBlockData. Always returns a usable object, falling back to defaults for
 * missing or malformed parts so a corrupt attr never crashes the node view.
 */
export function normalizeDatabaseData(raw: unknown): DatabaseBlockData {
  if (!raw || typeof raw !== 'object') return createDefaultDatabaseData()
  const obj = raw as Record<string, unknown>

  const fields = Array.isArray(obj.fields)
    ? obj.fields.map(coerceField).filter((f): f is DbField => f !== null)
    : []
  const records = Array.isArray(obj.records)
    ? obj.records.map(coerceRecord).filter((r): r is DbRecord => r !== null)
    : []
  let views = Array.isArray(obj.views)
    ? obj.views.map(coerceView).filter((v): v is DbView => v !== null)
    : []

  if (fields.length === 0) return createDefaultDatabaseData()
  if (views.length === 0) {
    views = [{ id: createDbId('v'), name: 'Table', type: 'table', filters: [], sorts: [], style: defaultViewStyle() }]
  }
  const activeView = typeof obj.activeView === 'string' && views.some(v => v.id === obj.activeView)
    ? obj.activeView
    : views[0].id

  const common = {
    title: typeof obj.title === 'string' ? obj.title : '',
    fields,
    activeView,
    views,
  }

  // Presence of records is the compatibility marker. Older documents did not
  // have a versioned external database id.
  if (obj.version === 1 || Array.isArray(obj.records)) return { version: 1, records, ...common }

  return {
    version: 2,
    databaseId: typeof obj.databaseId === 'string' && obj.databaseId ? obj.databaseId : createDbId('database'),
    rowCount: typeof obj.rowCount === 'number' && obj.rowCount >= 0 ? Math.floor(obj.rowCount) : 0,
    ...common,
  }
}

export function parseDatabaseData(rawJson: string): DatabaseBlockData {
  if (!rawJson) return createDefaultDatabaseData()
  try {
    return normalizeDatabaseData(JSON.parse(rawJson))
  } catch {
    return createDefaultDatabaseData()
  }
}

export function serializeDatabaseData(data: DatabaseBlockData): string {
  return JSON.stringify(data)
}
