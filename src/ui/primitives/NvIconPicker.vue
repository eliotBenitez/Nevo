<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, type Component } from 'vue'
import { useI18n } from 'vue-i18n'
import * as LucideIcons from 'lucide-vue-next'
import { humanizeLucideName, lucideTokenFromExportName } from '../../utils/noteIcon'
import { emojiCategories, filterUnsupportedEmojisAsync } from './iconPickerEmoji'

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

const activeEmojiCategories = ref(emojiCategories)

const searchableIcons = Object.entries(LucideIcons)
  .filter(([name, icon]) => {
    if (!/^[A-Z]/.test(name)) return false
    if (name.endsWith('Icon')) return false
    return typeof icon === 'object' || typeof icon === 'function'
  })
  .map(([name, icon]) => ({
    exportName: name,
    token: lucideTokenFromExportName(name),
    label: humanizeLucideName(name),
    labelLower: humanizeLucideName(name).toLowerCase(),
    component: icon as Component,
  }))
  .sort((a, b) => a.label.localeCompare(b.label))

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
  const search = normalizedQuery.value
  if (!search) return searchableIcons
  return searchableIcons.filter((icon) => {
    return icon.labelLower.includes(search) || icon.exportName.toLowerCase().includes(search)
  })
})

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
  activeEmojiCategories.value = await filterUnsupportedEmojisAsync(emojiCategories)
})

onBeforeUnmount(() => {
  document.removeEventListener('keydown', onDocumentKeyDown)
})
</script>

<template>
  <div class="nv-icon-picker">
    <div v-if="visibleTabs.length > 1" class="nv-icon-picker__tabs">
      <button
        v-if="visibleTabs.includes('emoji')"
        type="button"
        class="nv-icon-picker__tab"
        :class="{ 'is-active': activeTab === 'emoji' }"
        @click="setTab('emoji')"
      >
        {{ t('workspace.iconPicker.tabs.emoji') }}
      </button>
      <button
        v-if="visibleTabs.includes('icons')"
        type="button"
        class="nv-icon-picker__tab"
        :class="{ 'is-active': activeTab === 'icons' }"
        @click="setTab('icons')"
      >
        {{ t('workspace.iconPicker.tabs.icons') }}
      </button>
    </div>

    <input
      ref="searchInputRef"
      v-model="query"
      class="nv-icon-picker__search"
      type="text"
      :placeholder="searchPlaceholder"
    />

    <div class="nv-icon-picker__body">
      <template v-if="activeTab === 'emoji'">
        <section
          v-for="category in filteredEmojiCategories"
          :key="category.id"
          class="nv-icon-picker__category"
        >
          <h4 class="nv-icon-picker__category-title">{{ t(category.labelKey) }}</h4>
          <div class="nv-icon-picker__grid">
            <button
              v-for="item in category.items"
              :key="`${category.id}-${item.value}`"
              type="button"
              class="nv-icon-picker__item"
              :class="{ 'is-selected': value === item.value }"
              :title="item.name"
              @click="onSelect(item.value)"
            >
              {{ item.value }}
            </button>
          </div>
        </section>
      </template>

      <div v-else class="nv-icon-picker__grid nv-icon-picker__grid--icons">
        <button
          v-for="icon in filteredIcons"
          :key="icon.token"
          type="button"
          class="nv-icon-picker__item nv-icon-picker__item--icon"
          :class="{ 'is-selected': value === icon.token }"
          :title="icon.label"
          @click="onSelect(icon.token)"
        >
          <component :is="icon.component" :size="16" />
        </button>
      </div>

      <p v-if="!hasResults" class="nv-icon-picker__empty">
        {{ t('workspace.iconPicker.noResults') }}
      </p>
    </div>
  </div>
</template>
