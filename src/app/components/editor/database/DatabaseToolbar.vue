<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { Table, List, BarChart3, LayoutGrid, Plus, Filter, ArrowUpDown, Settings, Trash2 } from '@lucide/vue'
import NvPopupMenu from '../../../../ui/primitives/NvPopupMenu.vue'
import DatabaseFilterPanel from './DatabaseFilterPanel.vue'
import DatabaseSortPanel from './DatabaseSortPanel.vue'
import DatabaseSettingsPanel from './DatabaseSettingsPanel.vue'
import { defaultViewStyle } from '../../../../types/database-block'
import type { DbField, DbFilterRule, DbSortRule, DbView, DbViewStyle, DbViewType } from '../../../../types/database-block'

const props = defineProps<{
  t: (key: string) => string
  views: DbView[]
  activeViewId: string
  activeView: DbView
  fields: DbField[]
  onRequestDelete: () => void
  onOpenCsvImport: () => void
}>()

const emit = defineEmits<{
  'update:activeViewId': [id: string]
  'add-view': [type: DbViewType]
  'update:filters': [rules: DbFilterRule[]]
  'update:sorts': [rules: DbSortRule[]]
  'update:style': [style: DbViewStyle]
  'update:viewName': [name: string]
  'delete-view': [id: string]
}>()

const VIEW_TYPES: DbViewType[] = ['table', 'list', 'chart', 'cards']

const filterMenuOpen = ref(false)
const sortMenuOpen = ref(false)
const settingsMenuOpen = ref(false)
const addViewMenuOpen = ref(false)
const viewContextMenu = ref<{ id: string; top: number; left: number } | null>(null)
const toolbarRef = ref<HTMLElement | null>(null)

function isRuleActive(rule: DbFilterRule): boolean {
  if (rule.operator === 'is_empty' || rule.operator === 'is_not_empty') return true
  return Array.isArray(rule.value) ? rule.value.length > 0 : rule.value.trim() !== ''
}

const filterCount = computed(() => props.activeView.filters.filter(isRuleActive).length)
const sortCount = computed(() => props.activeView.sorts.length)
const activeStyle = computed<DbViewStyle>(() => props.activeView.style ?? defaultViewStyle())

function iconFor(type: DbViewType) {
  return type === 'table' ? Table : type === 'list' ? List : type === 'chart' ? BarChart3 : LayoutGrid
}

function addView(type: DbViewType) {
  emit('add-view', type)
  addViewMenuOpen.value = false
}

function openViewContextMenu(event: MouseEvent, view: DbView) {
  viewContextMenu.value = { id: view.id, top: event.clientY, left: event.clientX }
}

const ACTIVE_BTN = 'nv-db-toolbar__btn--active tw:bg-[color-mix(in_oklab,var(--accent)_11%,transparent)] tw:text-accent tw:border-[color-mix(in_oklab,var(--accent)_17%,transparent)]'
const IDLE_BTN = 'tw:bg-transparent tw:text-content-muted tw:border-transparent'

function closeViewContextMenu() { viewContextMenu.value = null }

function deleteView() {
  if (!viewContextMenu.value || props.views.length <= 1) return
  emit('delete-view', viewContextMenu.value.id)
  closeViewContextMenu()
}

function onDocumentPointerDown() { closeViewContextMenu() }
function onDocumentKeydown(event: KeyboardEvent) { if (event.key === 'Escape') closeViewContextMenu() }
onMounted(() => {
  document.addEventListener('pointerdown', onDocumentPointerDown)
  document.addEventListener('keydown', onDocumentKeydown)
})
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onDocumentPointerDown)
  document.removeEventListener('keydown', onDocumentKeydown)
})
</script>

<template>
  <div ref="toolbarRef" class="nv-db-toolbar tw:flex tw:items-center tw:gap-1 tw:flex-wrap tw:min-h-10 tw:px-3 tw:bg-[color-mix(in_oklab,var(--db-surface)_76%,transparent)]">
    <div class="nv-db-toolbar__views tw:flex tw:items-center tw:gap-px tw:flex-wrap">
      <button
        v-for="view in views"
        :key="view.id"
        type="button"
        class="nv-db-toolbar__view-btn tw:inline-flex tw:items-center tw:gap-[5px] tw:relative tw:h-[39px] tw:px-2 tw:py-0 tw:rounded-none tw:border-0 tw:bg-transparent tw:text-[11.5px] tw:font-[550] tw:cursor-pointer tw:whitespace-nowrap tw:hover:bg-[color-mix(in_oklab,var(--hover,var(--surface-overlay))_68%,transparent)] tw:hover:text-content-primary"
        :class="view.id === activeViewId ? 'nv-db-toolbar__view-btn--active tw:text-accent' : 'tw:text-content-muted'"
        @click="emit('update:activeViewId', view.id)"
        @contextmenu.prevent="openViewContextMenu($event, view)"
      >
        <component :is="iconFor(view.type)" :size="12" />
        <span>{{ view.name || t(`database.view.${view.type}`) }}</span>
      </button>

      <NvPopupMenu v-model:open="addViewMenuOpen" placement="bottom-start" width="180px">
        <template #trigger>
          <button type="button" class="nv-db-toolbar__add-view tw:inline-flex tw:items-center tw:justify-center tw:size-7 tw:ml-0.5 tw:rounded-[6px] tw:border-0 tw:bg-transparent tw:text-content-muted tw:cursor-pointer tw:hover:bg-[var(--hover,var(--surface-overlay))] tw:hover:text-content-primary" :aria-label="t('database.toolbar.addView')">
            <Plus :size="13" />
          </button>
        </template>
        <div class="nv-db-toolbar__add-view-menu tw:flex tw:flex-col tw:gap-0.5 tw:p-0.5">
          <button
            v-for="type in VIEW_TYPES"
            :key="type"
            type="button"
            class="nv-db-toolbar__add-view-item tw:flex tw:items-center tw:gap-2 tw:h-[30px] tw:px-2 tw:py-0 tw:rounded-[calc(6px*var(--radius-scale,1))] tw:border-0 tw:bg-transparent tw:text-content-secondary tw:text-[12.5px] tw:cursor-pointer tw:text-left tw:hover:bg-[var(--hover,var(--surface-overlay))] tw:hover:text-content-primary"
            @click="addView(type)"
          >
            <component :is="iconFor(type)" :size="13" />
            {{ t(`database.view.${type}`) }}
          </button>
        </div>
      </NvPopupMenu>
    </div>

    <div class="nv-db-toolbar__spacer tw:flex-1" />

    <NvPopupMenu v-model:open="filterMenuOpen" :boundary="toolbarRef" placement="bottom-end" width="min(460px, calc(100vw - 24px))">
      <template #trigger>
        <button type="button" class="nv-db-toolbar__btn tw:inline-flex tw:items-center tw:gap-[5px] tw:h-7 tw:px-2 tw:py-0 tw:rounded-[6px] tw:border tw:border-solid tw:text-[11.5px] tw:font-medium tw:cursor-pointer tw:whitespace-nowrap tw:hover:bg-(--db-subtle) tw:hover:text-content-primary" :class="filterCount > 0 || filterMenuOpen ? ACTIVE_BTN : IDLE_BTN">
          <Filter :size="12" />
          {{ t('database.toolbar.filter') }}
          <span v-if="filterCount > 0" class="nv-db-toolbar__badge tw:inline-flex tw:items-center tw:justify-center tw:min-w-[15px] tw:h-[15px] tw:px-1 tw:rounded-[999px] tw:bg-accent tw:text-[color:var(--surface-canvas,white)] tw:text-[10px] tw:font-semibold">{{ filterCount }}</span>
        </button>
      </template>
      <DatabaseFilterPanel
        :t="t"
        :fields="fields"
        :model-value="activeView.filters"
        @update:model-value="emit('update:filters', $event)"
      />
    </NvPopupMenu>

    <NvPopupMenu v-model:open="sortMenuOpen" :boundary="toolbarRef" placement="bottom-end" width="min(360px, calc(100vw - 24px))">
      <template #trigger>
        <button type="button" class="nv-db-toolbar__btn tw:inline-flex tw:items-center tw:gap-[5px] tw:h-7 tw:px-2 tw:py-0 tw:rounded-[6px] tw:border tw:border-solid tw:text-[11.5px] tw:font-medium tw:cursor-pointer tw:whitespace-nowrap tw:hover:bg-(--db-subtle) tw:hover:text-content-primary" :class="sortCount > 0 || sortMenuOpen ? ACTIVE_BTN : IDLE_BTN">
          <ArrowUpDown :size="12" />
          {{ t('database.toolbar.sort') }}
          <span v-if="sortCount > 0" class="nv-db-toolbar__badge tw:inline-flex tw:items-center tw:justify-center tw:min-w-[15px] tw:h-[15px] tw:px-1 tw:rounded-[999px] tw:bg-accent tw:text-[color:var(--surface-canvas,white)] tw:text-[10px] tw:font-semibold">{{ sortCount }}</span>
        </button>
      </template>
      <DatabaseSortPanel
        :t="t"
        :fields="fields"
        :model-value="activeView.sorts"
        @update:model-value="emit('update:sorts', $event)"
      />
    </NvPopupMenu>

    <NvPopupMenu v-model:open="settingsMenuOpen" :boundary="toolbarRef" placement="bottom-end" width="240px">
      <template #trigger>
        <button type="button" class="nv-db-toolbar__btn tw:inline-flex tw:items-center tw:gap-[5px] tw:h-7 tw:px-2 tw:py-0 tw:rounded-[6px] tw:border tw:border-solid tw:text-[11.5px] tw:font-medium tw:cursor-pointer tw:whitespace-nowrap tw:hover:bg-(--db-subtle) tw:hover:text-content-primary" :class="settingsMenuOpen ? ACTIVE_BTN : IDLE_BTN">
          <Settings :size="12" />
          {{ t('database.toolbar.settings') }}
        </button>
      </template>
      <DatabaseSettingsPanel
        :t="t"
        :style="activeStyle"
        :view-name="activeView.name"
        :on-request-delete="onRequestDelete"
        :on-open-csv-import="onOpenCsvImport"
        :view-type="activeView.type"
        @update:style="emit('update:style', $event)"
        @update:view-name="emit('update:viewName', $event)"
      />
    </NvPopupMenu>

    <Teleport to="body">
      <div
        v-if="viewContextMenu"
        class="nv-db-view-context-menu tw:fixed tw:z-[10000] tw:min-w-[156px] tw:p-1 tw:border tw:border-solid tw:border-transparent tw:rounded-[8px] tw:bg-[var(--surface-raised,white)] tw:shadow-[0_12px_30px_rgb(15_23_42/16%),0_2px_6px_rgb(15_23_42/8%)]"
        role="menu"
        :style="{ top: `${viewContextMenu.top}px`, left: `${viewContextMenu.left}px` }"
        @pointerdown.stop
      >
        <button type="button" class="nv-db-view-context-menu__item nv-db-view-context-menu__item--danger tw:flex tw:items-center tw:w-full tw:gap-2 tw:h-[30px] tw:px-2 tw:py-0 tw:border-0 tw:rounded-[5px] tw:bg-transparent tw:text-content-secondary tw:font-nv-ui tw:text-[12px] tw:font-medium tw:text-left tw:cursor-pointer tw:enabled:hover:bg-[var(--danger-soft,color-mix(in_oklab,#ef4444_10%,transparent))] tw:enabled:hover:text-[color:var(--danger,#dc2626)] tw:disabled:opacity-[.45] tw:disabled:cursor-not-allowed" :disabled="views.length <= 1" @click="deleteView">
          <Trash2 :size="13" />
          {{ t('database.toolbar.deleteView') }}
        </button>
      </div>
    </Teleport>
  </div>
</template>
