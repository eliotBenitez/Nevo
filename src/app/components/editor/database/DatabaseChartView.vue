<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Plus, Trash2, Upload } from '../../../../ui/icons'
import NvPopupMenu from '../../../../ui/primitives/NvPopupMenu.vue'
import NvSelect from '../../../../ui/primitives/NvSelect.vue'
import { createDbId, type DbAggregate, type DbChartConfig, type DbChartKind, type DbChartSeries, type DbField, type DbRecord } from '../../../../types/database-block'
import { buildDatabaseChartRows, chartSeriesForFields } from './databaseChartData'

const props = defineProps<{
  t: (key: string) => string
  fields: DbField[]
  records: DbRecord[]
  chart?: DbChartConfig
  onOpenCsvImport: () => void
}>()

const emit = defineEmits<{
  'update:chart': [config: DbChartConfig]
}>()

const CHART_KINDS: DbChartKind[] = ['bar', 'line', 'area', 'pie']
const AGGREGATES: DbAggregate[] = ['sum', 'count', 'avg', 'min', 'max']

const effectiveChart = computed<DbChartConfig>(() => props.chart ?? {
  kind: 'bar',
  xField: props.fields[0]?.id ?? '',
  yField: '',
  yFields: [],
  series: [],
  aggregate: 'count',
})

const kindOptions = computed(() => CHART_KINDS.map(kind => ({ value: kind, label: props.t(`database.chart.kinds.${kind}`) })))
const numericFields = computed(() => props.fields.filter(field => field.type === 'number'))
const numericFieldOptions = computed(() => numericFields.value.map(field => ({ value: field.id, label: field.name })))
const aggregateOptions = computed(() => AGGREGATES.map(agg => ({ value: agg, label: props.t(`database.chart.aggregates.${agg}`) })))
const chartSeries = computed(() => chartSeriesForFields(effectiveChart.value, props.fields))
const automaticXAxisField = computed(() => props.fields.find(field => field.type !== 'number') ?? props.fields[0])
const chartConfig = computed<DbChartConfig>(() => ({
  ...effectiveChart.value,
  xField: automaticXAxisField.value?.id ?? '',
}))
const seriesSummary = computed(() => chartSeries.value.length
  ? `${chartSeries.value.length} ${props.t('database.chart.selected')}`
  : props.t('database.chart.yFieldCount'))

function patchChart(next: Partial<DbChartConfig>) {
  emit('update:chart', { ...effectiveChart.value, ...next })
}

function updateSeries(series: DbChartSeries[]) {
  const yFields = series.map(item => item.fieldId)
  patchChart({ series, yFields, yField: yFields[0] ?? '' })
}

function addSeries() {
  const field = numericFields.value.find(item => !chartSeries.value.some(series => series.fieldId === item.id))
  if (!field) return
  updateSeries([...chartSeries.value, { id: createDbId('series'), fieldId: field.id }])
}

function changeSeries(seriesId: string, fieldId: string) {
  const next = chartSeries.value.map(series => series.id === seriesId ? { ...series, fieldId } : series)
  const seen = new Set<string>()
  updateSeries(next.filter(series => {
    if (seen.has(series.fieldId)) return false
    seen.add(series.fieldId)
    return true
  }))
}

function removeSeries(seriesId: string) {
  updateSeries(chartSeries.value.filter(series => series.id !== seriesId))
}

const chartRows = computed(() => buildDatabaseChartRows(props.records, props.fields, chartConfig.value, props.t))

let vegaEmbedModule: typeof import('vega-embed')['default'] | null = null
async function loadVegaEmbed() {
  if (vegaEmbedModule) return vegaEmbedModule
  const mod = await import('vega-embed')
  vegaEmbedModule = mod.default
  return vegaEmbedModule
}

const containerRef = ref<HTMLDivElement | null>(null)
const isDark = ref(document.documentElement.classList.contains('theme-dark'))
let currentView: { finalize: () => void } | null = null
let themeObserver: MutationObserver | null = null
let renderGeneration = 0

function buildSpec() {
  const config = chartConfig.value
  const rows = chartRows.value
  const multipleSeries = chartSeries.value.length > 1
  const mark = config.kind === 'pie'
    ? 'arc'
    : config.kind === 'line'
      ? { type: 'line', point: true }
      : config.kind

  const encoding = config.kind === 'pie'
    ? {
      theta: { field: 'y', type: 'quantitative' },
      color: { field: 'x', type: 'nominal', legend: { title: null } },
    }
    : {
      x: { field: 'x', type: 'nominal', sort: null, axis: { title: null } },
      y: { field: 'y', type: 'quantitative', axis: { title: null } },
      ...(multipleSeries
        ? {
          color: { field: 'series', type: 'nominal', legend: { title: null } },
          ...(config.kind === 'bar' ? { xOffset: { field: 'series' } } : { detail: { field: 'series' } }),
        }
        : {}),
    }

  if (config.kind === 'pie' && multipleSeries) {
    return {
      $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
      data: { values: rows },
      facet: { column: { field: 'series', type: 'nominal', header: { title: null } } },
      spec: {
        width: 180,
        height: 240,
        mark: 'arc',
        encoding: {
          theta: { field: 'y', type: 'quantitative' },
          color: { field: 'x', type: 'nominal', legend: { title: null } },
        },
      },
    }
  }

  return {
    $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
    width: 'container',
    height: 260,
    autosize: { type: 'fit', contains: 'padding' },
    data: { values: rows },
    mark,
    encoding,
  }
}

async function render() {
  const el = containerRef.value
  if (!el) return
  const generation = ++renderGeneration
  const spec = buildSpec()
  if (currentView) {
    currentView.finalize()
    currentView = null
  }
  if (!chartRows.value.length) {
    el.innerHTML = ''
    return
  }
  try {
    const embed = await loadVegaEmbed()
    if (generation !== renderGeneration) return
    const result = await embed(el, spec as Parameters<typeof embed>[1], {
      actions: false,
      renderer: 'svg',
      theme: isDark.value ? 'dark' : undefined,
    })
    if (generation !== renderGeneration) {
      result.view.finalize()
      return
    }
    currentView = result.view
  } catch {
    el.innerHTML = ''
  }
}

watch(
  [chartRows, () => effectiveChart.value.kind, isDark],
  () => { nextTick(() => void render()) },
)

onMounted(() => {
  themeObserver = new MutationObserver(() => {
    isDark.value = document.documentElement.classList.contains('theme-dark')
  })
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
  nextTick(() => void render())
})

onBeforeUnmount(() => {
  renderGeneration += 1
  themeObserver?.disconnect()
  if (currentView) {
    currentView.finalize()
    currentView = null
  }
})
</script>

<template>
  <div class="nv-db-chart tw:flex tw:flex-col tw:gap-2.5">
    <div class="nv-db-chart__controls tw:flex tw:flex-wrap tw:gap-[5px] tw:rounded-[7px] tw:border tw:border-solid tw:border-transparent tw:bg-surface-subtle tw:p-2">
      <NvSelect
        class="nv-db-chart__select"
        :model-value="effectiveChart.kind"
        :options="kindOptions"
        :min-width="110"
        @update:model-value="patchChart({ kind: $event as DbChartKind })"
      />
      <NvPopupMenu placement="bottom-start" width="290px">
        <template #trigger>
          <button type="button" class="nv-db-chart__series-trigger tw:flex tw:h-[30px] tw:min-w-[164px] tw:cursor-pointer tw:items-center tw:justify-between tw:gap-3 tw:rounded-[calc(6px*var(--radius-scale,1))] tw:border tw:border-solid tw:border-transparent tw:bg-(--input-bg) tw:px-[9px] tw:py-0 tw:font-nv-ui tw:text-[11px] tw:leading-[normal] tw:font-semibold tw:text-content-secondary tw:hover:border-accent tw:hover:text-content-primary" :aria-label="t('database.chart.yFields')">
            <span>{{ t('database.chart.yFields') }}</span>
            <span class="nv-db-chart__series-summary tw:font-medium tw:text-content-muted">{{ seriesSummary }}</span>
          </button>
        </template>
        <div class="nv-db-chart__series-menu tw:flex tw:flex-col tw:gap-1.5 tw:p-[7px]">
          <div class="nv-db-chart__series-header tw:flex tw:items-center tw:justify-between tw:gap-2 tw:pl-0.5 tw:font-nv-ui tw:text-[10px] tw:leading-[normal] tw:font-semibold tw:tracking-[0.03em] tw:text-content-muted tw:uppercase">
            <span>{{ t('database.chart.yFields') }}</span>
            <button type="button" class="nv-db-chart__add-series tw:inline-flex tw:h-6 tw:cursor-pointer tw:items-center tw:justify-center tw:gap-1 tw:rounded-[calc(5px*var(--radius-scale,1))] tw:border-0 tw:bg-[color-mix(in_oklab,var(--accent)_10%,transparent)] tw:px-1.5 tw:py-0 tw:font-nv-ui tw:text-[11px] tw:leading-[normal] tw:font-semibold tw:text-accent tw:hover:enabled:bg-[color-mix(in_oklab,var(--accent)_18%,transparent)] tw:disabled:cursor-default tw:disabled:text-content-muted tw:disabled:opacity-65" :disabled="chartSeries.length === numericFields.length" @click="addSeries">
              <Plus :size="13" />
              {{ t('database.chart.addSeries') }}
            </button>
          </div>
          <div v-if="chartSeries.length" class="nv-db-chart__series-list tw:flex tw:flex-col tw:gap-1">
            <div v-for="(series, index) in chartSeries" :key="series.id" class="nv-db-chart__series-row tw:flex tw:min-w-0 tw:items-center tw:gap-[5px]">
              <span class="nv-db-chart__series-index tw:grid tw:h-[18px] tw:w-[18px] tw:flex-[0_0_18px] tw:place-items-center tw:rounded-[50%] tw:bg-[color-mix(in_oklab,var(--accent)_12%,transparent)] tw:font-nv-ui tw:text-[10px] tw:leading-[normal] tw:font-bold tw:text-accent">{{ index + 1 }}</span>
              <NvSelect
                class="nv-db-chart__series-select tw:flex-1"
                :model-value="series.fieldId"
                :options="numericFieldOptions"
                :min-width="180"
                @update:model-value="changeSeries(series.id, $event)"
              />
              <button type="button" class="nv-db-chart__remove-series tw:inline-flex tw:h-[25px] tw:w-[25px] tw:flex-[0_0_25px] tw:cursor-pointer tw:items-center tw:justify-center tw:rounded-[calc(5px*var(--radius-scale,1))] tw:border-0 tw:bg-transparent tw:text-content-muted tw:hover:bg-[color-mix(in_oklab,var(--danger)_12%,transparent)] tw:hover:text-danger" :aria-label="t('database.chart.removeSeries')" @click="removeSeries(series.id)">
                <Trash2 :size="13" />
              </button>
            </div>
          </div>
          <p v-else class="nv-db-chart__series-hint tw:m-0 tw:text-[11px] tw:leading-[1.3] tw:text-content-muted">{{ t('database.chart.countHint') }}</p>
        </div>
      </NvPopupMenu>
      <NvSelect
        v-if="chartSeries.length"
        class="nv-db-chart__select"
        :model-value="effectiveChart.aggregate"
        :options="aggregateOptions"
        :min-width="110"
        @update:model-value="patchChart({ aggregate: $event as DbAggregate })"
      />
    </div>

    <div v-if="!fields.length" class="nv-db-chart__empty tw:flex tw:flex-col tw:items-center tw:gap-2 tw:px-2.5 tw:py-[30px] tw:text-center tw:text-[12.5px] tw:text-content-muted">{{ t('database.chart.noFields') }}</div>
    <div v-else-if="!records.length" class="nv-db-chart__empty tw:flex tw:flex-col tw:items-center tw:gap-2 tw:px-2.5 tw:py-[30px] tw:text-center tw:text-[12.5px] tw:text-content-muted">
      <span>{{ t('database.chart.empty') }}</span>
      <button type="button" class="nv-db-chart__import-btn tw:inline-flex tw:h-7 tw:cursor-pointer tw:items-center tw:gap-1.5 tw:rounded-[calc(7px*var(--radius-scale,1))] tw:border tw:border-solid tw:border-transparent tw:bg-surface-subtle tw:px-3 tw:py-0 tw:text-[12px] tw:text-content-secondary tw:hover:border-accent tw:hover:text-content-primary" @click="onOpenCsvImport">
        <Upload :size="13" />
        {{ t('database.chart.importPrompt') }}
      </button>
    </div>
    <div v-else ref="containerRef" class="nv-db-chart__render tw:min-h-[260px] tw:w-full tw:overflow-x-auto" />
  </div>
</template>
