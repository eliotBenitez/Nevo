import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export interface TabEntry {
  id: string
  noteId: string
  title: string
  icon: string
  isDirty: boolean
  isPinned: boolean
}

export const useTabsStore = defineStore('tabs', () => {
  const tabs = ref<TabEntry[]>([])
  const activeTabId = ref<string | null>(null)

  const activeTab = computed(() => tabs.value.find(t => t.id === activeTabId.value) ?? null)

  function tabByNoteId(noteId: string): TabEntry | undefined {
    return tabs.value.find(t => t.noteId === noteId)
  }

  function openTab(noteId: string, title: string, icon: string) {
    const existing = tabByNoteId(noteId)
    if (existing) {
      activeTabId.value = existing.id
      return
    }
    const entry: TabEntry = { id: noteId, noteId, title, icon, isDirty: false, isPinned: false }
    tabs.value.push(entry)
    activeTabId.value = entry.id
  }

  function closeTab(tabId: string): string | null {
    const idx = tabs.value.findIndex(t => t.id === tabId)
    if (idx === -1) return null
    tabs.value.splice(idx, 1)
    if (activeTabId.value === tabId) {
      const next = tabs.value[idx] ?? tabs.value[idx - 1] ?? null
      activeTabId.value = next?.id ?? null
      return next?.noteId ?? null
    }
    return null
  }

  function syncActiveTab(updates: Partial<Pick<TabEntry, 'title' | 'icon' | 'isDirty'>>) {
    const tab = activeTab.value
    if (!tab) return
    if (typeof updates.title === 'string') tab.title = updates.title
    if (typeof updates.icon === 'string') tab.icon = updates.icon
    if (typeof updates.isDirty === 'boolean') tab.isDirty = updates.isDirty
  }

  function moveTab(fromIndex: number, toIndex: number) {
    if (fromIndex === toIndex) return
    if (fromIndex < 0 || toIndex < 0) return
    if (fromIndex >= tabs.value.length || toIndex >= tabs.value.length) return

    const tab = tabs.value[fromIndex]
    tabs.value.splice(fromIndex, 1)
    tabs.value.splice(toIndex, 0, tab)
  }

  function clear() {
    tabs.value = []
    activeTabId.value = null
  }

  return { tabs, activeTabId, activeTab, tabByNoteId, openTab, closeTab, moveTab, syncActiveTab, clear }
})
