<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { Table, List, BarChart3, LayoutGrid, Plus, Filter, ArrowUpDown, Settings, Trash2 } from 'lucide-vue-next'
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
  <div ref="toolbarRef" class="nv-db-toolbar">
    <div class="nv-db-toolbar__views">
      <button
        v-for="view in views"
        :key="view.id"
        type="button"
        class="nv-db-toolbar__view-btn"
        :class="{ 'nv-db-toolbar__view-btn--active': view.id === activeViewId }"
        @click="emit('update:activeViewId', view.id)"
        @contextmenu.prevent="openViewContextMenu($event, view)"
      >
        <component :is="iconFor(view.type)" :size="12" />
        <span>{{ view.name || t(`database.view.${view.type}`) }}</span>
      </button>

      <NvPopupMenu v-model:open="addViewMenuOpen" placement="bottom-start" width="180px">
        <template #trigger>
          <button type="button" class="nv-db-toolbar__add-view" :aria-label="t('database.toolbar.addView')">
            <Plus :size="13" />
          </button>
        </template>
        <div class="nv-db-toolbar__add-view-menu">
          <button
            v-for="type in VIEW_TYPES"
            :key="type"
            type="button"
            class="nv-db-toolbar__add-view-item"
            @click="addView(type)"
          >
            <component :is="iconFor(type)" :size="13" />
            {{ t(`database.view.${type}`) }}
          </button>
        </div>
      </NvPopupMenu>
    </div>

    <div class="nv-db-toolbar__spacer" />

    <NvPopupMenu v-model:open="filterMenuOpen" :boundary="toolbarRef" placement="bottom-end" width="min(460px, calc(100vw - 24px))">
      <template #trigger>
        <button type="button" class="nv-db-toolbar__btn" :class="{ 'nv-db-toolbar__btn--active': filterCount > 0 || filterMenuOpen }">
          <Filter :size="12" />
          {{ t('database.toolbar.filter') }}
          <span v-if="filterCount > 0" class="nv-db-toolbar__badge">{{ filterCount }}</span>
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
        <button type="button" class="nv-db-toolbar__btn" :class="{ 'nv-db-toolbar__btn--active': sortCount > 0 || sortMenuOpen }">
          <ArrowUpDown :size="12" />
          {{ t('database.toolbar.sort') }}
          <span v-if="sortCount > 0" class="nv-db-toolbar__badge">{{ sortCount }}</span>
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
        <button type="button" class="nv-db-toolbar__btn" :class="{ 'nv-db-toolbar__btn--active': settingsMenuOpen }">
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
        class="nv-db-view-context-menu"
        role="menu"
        :style="{ top: `${viewContextMenu.top}px`, left: `${viewContextMenu.left}px` }"
        @pointerdown.stop
      >
        <button type="button" class="nv-db-view-context-menu__item nv-db-view-context-menu__item--danger" :disabled="views.length <= 1" @click="deleteView">
          <Trash2 :size="13" />
          {{ t('database.toolbar.deleteView') }}
        </button>
      </div>
    </Teleport>
  </div>
</template>
