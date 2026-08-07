<script setup lang="ts">
import { Columns3, Home, Menu, Search, StickyNote } from 'lucide-vue-next'
import { computed, markRaw } from 'vue'
import { useI18n } from 'vue-i18n'

export type MobileWorkspaceTab = 'home' | 'notes' | 'search' | 'boards' | 'more'

defineProps<{
  active: Exclude<MobileWorkspaceTab, 'search'>
}>()

const emit = defineEmits<{
  navigate: [tab: MobileWorkspaceTab]
}>()

const { t } = useI18n()
const items = computed(() => [
  { id: 'home' as const, label: t('workspace.mobile.navigation.home'), icon: markRaw(Home) },
  { id: 'notes' as const, label: t('workspace.mobile.navigation.notes'), icon: markRaw(StickyNote) },
  { id: 'search' as const, label: t('workspace.mobile.navigation.search'), icon: markRaw(Search) },
  { id: 'boards' as const, label: t('workspace.mobile.navigation.boards'), icon: markRaw(Columns3) },
  { id: 'more' as const, label: t('workspace.mobile.navigation.more'), icon: markRaw(Menu) },
])

function navigate(tab: MobileWorkspaceTab) {
  emit('navigate', tab)
}
</script>

<template>
  <nav class="mobile-bottom-nav" :aria-label="t('workspace.mobile.navigation.label')">
    <button
      v-for="item in items"
      :key="item.id"
      type="button"
      class="mobile-bottom-nav__item"
      :class="{ 'mobile-bottom-nav__item--active': item.id === active }"
      :aria-current="item.id === active ? 'page' : undefined"
      @click="navigate(item.id)"
    >
      <component :is="item.icon" :size="20" aria-hidden="true" />
      <span>{{ item.label }}</span>
    </button>
  </nav>
</template>
