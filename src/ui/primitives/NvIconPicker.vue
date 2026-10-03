<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'
import { useI18n } from 'vue-i18n'
import { emojiCategories, filterUnsupportedEmojisAsync } from './iconPickerEmoji'
import { getSearchableIcons, type SearchableIcon } from './iconPickerIcons'
import { useIconPickerProgressiveItems } from '../composables/useIconPickerProgressiveItems'

type PickerTab = 'emoji' | 'icons'

interface Props {
  value: string
  tabs?: PickerTab[]
  autofocus?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  tabs: () => ['emoji', 'icons'],
})
const emit = defineEmits<{
  select: [value: string]
  close: []
}>()

const { t } = useI18n()
const visibleTabs = computed<PickerTab[]>(() => props.tabs.length > 0 ? props.tabs : ['emoji', 'icons'])
const activeTab = ref<PickerTab>(visibleTabs.value[0] ?? 'emoji')
const query = ref('')
const searchInputRef = ref<HTMLInputElement | null>(null)

const activeEmojiCategories = shallowRef(emojiCategories)

// Idle vs. selected are mutually exclusive (both live in `@layer utilities`
// at equal specificity), but `:hover` must keep winning over either branch —
// the original CSS's `.nv-icon-picker__item:hover` (specificity 0,2,0) always
// beat `.is-selected` (0,1,0) regardless of source order, so both branches
// carry the same `hover:` utility rather than only the idle one.
function pickerItemClass(selected: boolean) {
  return selected
    ? 'is-selected tw:border-accent tw:bg-(--accent-soft) tw:text-content-primary tw:hover:bg-(--hover)'
    : 'tw:border-transparent tw:bg-transparent tw:text-content-secondary tw:hover:bg-(--hover)'
}

const normalizedQuery = computed(() => query.value.trim().toLowerCase())

const filteredEmojiCategories = computed(() => {
  const search = normalizedQuery.value
  const sourceCategories = activeEmojiCategories.value
  if (!search) return sourceCategories

  return sourceCategories
    .map((category) => ({
      ...category,
      items: category.items.filter((item) => {
        const haystack = `${item.name} ${item.keywords.join(' ')} ${item.value}`.toLowerCase()
        return haystack.includes(search)
      }),
    }))
    .filter((category) => category.items.length > 0)
})

const filteredIcons = computed(() => {
  const searchableIcons = getSearchableIcons()
  const search = normalizedQuery.value
  if (!search) return searchableIcons
  return searchableIcons.filter((icon) => {
    return icon.labelLower.includes(search) || icon.exportName.toLowerCase().includes(search)
  })
})

type PickerEmojiItem = (typeof emojiCategories)[number]['items'][number]
type ProgressivePickerItem =
  | { kind: 'emoji'; categoryId: string; item: PickerEmojiItem }
  | { kind: 'icon'; icon: SearchableIcon }

const allProgressiveItems = computed<ProgressivePickerItem[]>(() => {
  if (activeTab.value === 'emoji') {
    return filteredEmojiCategories.value.flatMap((category) => category.items.map((item) => ({
      kind: 'emoji' as const,
      categoryId: category.id,
      item,
    })))
  }

  return filteredIcons.value.map((icon) => ({ kind: 'icon' as const, icon }))
})

const progressive = useIconPickerProgressiveItems(
  allProgressiveItems,
  computed(() => `${activeTab.value}:${normalizedQuery.value}`),
)
const scrollContainer = progressive.scrollContainer

const visibleEmojiCategories = computed(() => {
  const categoryItems = new Map<string, PickerEmojiItem[]>()
  for (const entry of progressive.visibleItems.value) {
    if (entry.kind !== 'emoji') continue
    const items = categoryItems.get(entry.categoryId) ?? []
    items.push(entry.item)
    categoryItems.set(entry.categoryId, items)
  }

  return filteredEmojiCategories.value
    .filter((category) => categoryItems.has(category.id))
    .map((category) => ({ ...category, items: categoryItems.get(category.id)! }))
})

const visibleIcons = computed(() => progressive.visibleItems.value.flatMap((entry) => (
  entry.kind === 'icon' ? [entry.icon] : []
)))

const hasResults = computed(() => {
  if (activeTab.value === 'emoji') return filteredEmojiCategories.value.length > 0
  return filteredIcons.value.length > 0
})

const searchPlaceholder = computed(() => {
  if (activeTab.value === 'emoji') return t('workspace.iconPicker.searchEmoji')
  return t('workspace.iconPicker.searchIcons')
})

function setTab(tab: PickerTab) {
  if (!visibleTabs.value.includes(tab)) return
  activeTab.value = tab
  query.value = ''
  if (tab === 'emoji') void ensureEmojiLoaded()
}

let emojiLoadPromise: Promise<void> | null = null

function ensureEmojiLoaded(): Promise<void> {
  if (emojiLoadPromise) return emojiLoadPromise

  emojiLoadPromise = filterUnsupportedEmojisAsync(emojiCategories).then((categories) => {
    activeEmojiCategories.value = categories
  })
  return emojiLoadPromise
}

function onSelect(value: string) {
  emit('select', value)
}

function onDocumentKeyDown(event: KeyboardEvent) {
  if (event.key !== 'Escape') return
  event.stopPropagation()
  emit('close')
}

onMounted(async () => {
  document.addEventListener('keydown', onDocumentKeyDown)
  if (props.autofocus) {
    await nextTick()
    searchInputRef.value?.focus()
  }
  if (activeTab.value === 'emoji') await ensureEmojiLoaded()
})

onBeforeUnmount(() => {
  document.removeEventListener('keydown', onDocumentKeyDown)
})
</script>

<template>
  <div class="nv-icon-picker tw:flex tw:w-[min(420px,calc(100vw-24px))] tw:max-[900px]:w-[calc(100vw-24px)] tw:flex-col tw:gap-2.5 tw:rounded-[calc(12px*var(--radius-scale,1))] tw:border tw:border-solid tw:border-transparent tw:bg-(--menu-bg) tw:p-2.5 tw:shadow-(--menu-shadow)">
    <div v-if="visibleTabs.length > 1" class="nv-icon-picker__tabs tw:inline-flex tw:w-fit tw:overflow-hidden tw:rounded-[calc(9px*var(--radius-scale,1))] tw:border tw:border-solid tw:border-line-default">
      <button
        v-if="visibleTabs.includes('emoji')"
        type="button"
        class="nv-icon-picker__tab tw:h-[30px] tw:cursor-pointer tw:border-0 tw:px-3 tw:text-xs"
        :class="activeTab === 'emoji' ? 'is-active tw:bg-(--accent-soft) tw:text-content-primary' : 'tw:bg-transparent tw:text-content-muted'"
        @click="setTab('emoji')"
      >
        {{ t('workspace.iconPicker.tabs.emoji') }}
      </button>
      <button
        v-if="visibleTabs.includes('icons')"
        type="button"
        class="nv-icon-picker__tab tw:h-[30px] tw:cursor-pointer tw:border-0 tw:px-3 tw:text-xs"
        :class="activeTab === 'icons' ? 'is-active tw:bg-(--accent-soft) tw:text-content-primary' : 'tw:bg-transparent tw:text-content-muted'"
        @click="setTab('icons')"
      >
        {{ t('workspace.iconPicker.tabs.icons') }}
      </button>
    </div>

    <input
      ref="searchInputRef"
      v-model="query"
      class="nv-icon-picker__search tw:h-8 tw:w-full tw:rounded-[calc(8px*var(--radius-scale,1))] tw:border tw:border-solid tw:border-transparent tw:bg-(--input-bg) tw:px-2.5 tw:text-[12.5px] tw:text-content-primary tw:outline-none tw:transition-[background-color,box-shadow] tw:duration-[140ms] tw:focus:bg-(--surface-raised) tw:focus:shadow-[0_0_0_2px_var(--input-ring)]"
      type="text"
      :placeholder="searchPlaceholder"
    />

    <div
      ref="scrollContainer"
      class="nv-icon-picker__body tw:flex tw:max-h-[300px] tw:min-h-[180px] tw:flex-col tw:gap-2.5 tw:overflow-auto tw:pr-0.5"
      @scroll="progressive.onScroll"
      @focusin="progressive.onFocusIn"
    >
      <template v-if="activeTab === 'emoji'">
        <section
          v-for="category in visibleEmojiCategories"
          :key="category.id"
          class="nv-icon-picker__category tw:flex tw:flex-col tw:gap-1.5"
        >
          <h4 class="nv-icon-picker__category-title tw:m-0 tw:font-nv-mono tw:text-[10.5px] tw:tracking-[0.05em] tw:text-content-muted tw:uppercase">{{ t(category.labelKey) }}</h4>
          <div class="nv-icon-picker__grid tw:grid tw:grid-cols-9 tw:gap-1.5 tw:max-[900px]:grid-cols-7">
            <button
              v-for="item in category.items"
              :key="`${category.id}-${item.value}`"
              type="button"
              class="nv-icon-picker__item tw:inline-flex tw:h-[30px] tw:cursor-pointer tw:items-center tw:justify-center tw:rounded-[calc(8px*var(--radius-scale,1))] tw:border tw:border-solid tw:text-lg"
              :class="pickerItemClass(value === item.value)"
              :title="item.name"
              @click="onSelect(item.value)"
            >
              {{ item.value }}
            </button>
          </div>
        </section>
      </template>

      <div v-else class="nv-icon-picker__grid nv-icon-picker__grid--icons tw:grid tw:grid-cols-10 tw:gap-1.5 tw:max-[900px]:grid-cols-7">
        <button
          v-for="icon in visibleIcons"
          :key="icon.token"
          type="button"
          class="nv-icon-picker__item nv-icon-picker__item--icon tw:inline-flex tw:h-[30px] tw:cursor-pointer tw:items-center tw:justify-center tw:rounded-[calc(8px*var(--radius-scale,1))] tw:border tw:border-solid tw:text-[13px]"
          :class="pickerItemClass(value === icon.token)"
          :title="icon.label"
          @click="onSelect(icon.token)"
        >
          <component :is="icon.component" :size="16" />
        </button>
      </div>

      <p v-if="!hasResults" class="nv-icon-picker__empty tw:m-auto tw:text-xs tw:text-content-muted">
        {{ t('workspace.iconPicker.noResults') }}
      </p>
    </div>
  </div>
</template>
