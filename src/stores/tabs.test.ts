import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useTabsStore } from './tabs'

function openTabs() {
  const tabsStore = useTabsStore()
  tabsStore.openTab('a', 'Alpha', '📄')
  tabsStore.openTab('b', 'Beta', '📄')
  tabsStore.openTab('c', 'Gamma', '📄')
  tabsStore.activeTabId = 'b'
  return tabsStore
}

describe('useTabsStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('moves a tab while preserving the active tab by id', () => {
    const tabsStore = openTabs()

    tabsStore.moveTab(0, 2)

    expect(tabsStore.tabs.map(tab => tab.id)).toEqual(['b', 'c', 'a'])
    expect(tabsStore.activeTabId).toBe('b')
    expect(tabsStore.activeTab?.id).toBe('b')
  })

  it('ignores same, negative, and out-of-range indexes', () => {
    const tabsStore = openTabs()

    tabsStore.moveTab(1, 1)
    tabsStore.moveTab(-1, 1)
    tabsStore.moveTab(1, -1)
    tabsStore.moveTab(3, 1)
    tabsStore.moveTab(1, 3)

    expect(tabsStore.tabs.map(tab => tab.id)).toEqual(['a', 'b', 'c'])
  })
})
