<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { Component } from 'vue'
import {
  CheckSquare,
  ChevronRightSquare,
  Globe,
  Heading1,
  Heading2,
  Heading3,
  Heading4,
  Heading5,
  Heading6,
  Image as ImageIcon,
  List,
  ListOrdered,
  MessageSquareQuote,
  Minus,
  Pilcrow,
  Quote,
  Sigma,
  SmilePlus,
  SquareCode,
  Table,
} from 'lucide-vue-next'
import type { NevoSlashItem } from '../../../types/editor-plugin'
import NvIconPicker from '../../../ui/primitives/NvIconPicker.vue'

const props = defineProps<{
  open: boolean
  query: string
  activeIndex: number
  items: NevoSlashItem[]
  menuStyle: Record<string, string>
  emojiPickerOpen: boolean
}>()

const emit = defineEmits<{
  select: [item: NevoSlashItem]
  selectEmoji: [emoji: string]
  openEmojiPicker: []
  closeEmojiPicker: []
  itemMousedown: [event: MouseEvent]
}>()

const { t } = useI18n()

const menuRef = ref<HTMLDivElement | null>(null)
const emojiPickerTabs: 'emoji'[] = ['emoji']

defineExpose({ menuRef })

const slashIconById: Record<string, Component> = {
  paragraph: Pilcrow,
  h1: Heading1,
  h2: Heading2,
  h3: Heading3,
  h4: Heading4,
  h5: Heading5,
  h6: Heading6,
  emoji: SmilePlus,
  quote: Quote,
  code: SquareCode,
  math: Sigma,
  'math-inline': Sigma,
  table: Table,
  image: ImageIcon,
  ul: List,
  ol: ListOrdered,
  callout: MessageSquareQuote,
  toggle: ChevronRightSquare,
  embed: Globe,
  divider: Minus,
  checklist: CheckSquare,
}

const CATEGORY_ORDER = ['text', 'lists', 'code', 'media', 'layout']

interface CategoryGroup {
  key: string
  label: string
  items: NevoSlashItem[]
}

const grouped = computed<CategoryGroup[]>(() => {
  const map = new Map<string, NevoSlashItem[]>()
  const uncategorized: NevoSlashItem[] = []

  for (const item of props.items) {
    const cat = item.category ?? ''
    if (!cat) {
      uncategorized.push(item)
    } else {
      if (!map.has(cat)) map.set(cat, [])
      map.get(cat)!.push(item)
    }
  }

  const result: CategoryGroup[] = []

  for (const key of CATEGORY_ORDER) {
    const items = map.get(key)
    if (items?.length) {
      result.push({ key, label: t(`slashMenu.categories.${key}`), items })
      map.delete(key)
    }
  }

  for (const [key, items] of map) {
    if (items.length) result.push({ key, label: key, items })
  }

  if (uncategorized.length) {
    result.push({ key: '__other', label: '', items: uncategorized })
  }

  return result
})

function getIcon(id: string): Component {
  return slashIconById[id] ?? Pilcrow
}

function getTitle(item: NevoSlashItem): string {
  const key = `slashMenu.items.${item.id.replace(/-/g, '_')}`
  const translated = t(key)
  return translated === key ? item.title : translated
}

function getMeta(item: NevoSlashItem): string {
  const keyword = item.keywords?.[0]
  return keyword ? `/${item.id} · ${keyword}` : `/${item.id}`
}

function flatIndex(groupIndex: number, itemIndex: number): number {
  let offset = 0
  for (let g = 0; g < groupIndex; g++) {
    offset += grouped.value[g].items.length
  }
  return offset + itemIndex
}

function selectItem(item: NevoSlashItem) {
  if (item.id === 'emoji') {
    emit('openEmojiPicker')
    return
  }

  emit('select', item)
}

function selectEmoji(emoji: string) {
  emit('selectEmoji', emoji)
}
</script>

<template>
  <div
    v-if="open"
    ref="menuRef"
    class="editor-overlay slash-menu"
    :class="{ 'slash-menu--picker': emojiPickerOpen }"
    :style="menuStyle"
  >
    <div class="slash-menu__header">
      <span class="slash-menu__header-label">/</span>
      <span class="slash-menu__header-query">{{ query }}</span>
      <span class="nv-kbd slash-menu__header-esc">{{ t('common.keyboard.esc') }}</span>
    </div>

    <div v-if="emojiPickerOpen" class="slash-menu__picker" @mousedown.stop @click.stop>
      <NvIconPicker
        value=""
        :tabs="emojiPickerTabs"
        @close="emit('closeEmojiPicker')"
        @select="selectEmoji"
      />
    </div>

    <template v-else>
      <div v-for="(group, gi) in grouped" :key="group.key" class="slash-menu__group">
        <div v-if="group.label" class="slash-menu__category">{{ group.label }}</div>
        <button
          v-for="(item, ii) in group.items"
          :key="item.id"
          class="slash-menu__item"
          :class="{ 'is-active': flatIndex(gi, ii) === activeIndex }"
          @mousedown="emit('itemMousedown', $event)"
          @click="selectItem(item)"
        >
          <span class="slash-menu__content">
            <span class="slash-menu__icon">
              <component :is="getIcon(item.id)" :size="13" />
            </span>
            <span class="slash-menu__title">{{ getTitle(item) }}</span>
          </span>
          <span class="slash-menu__id">{{ getMeta(item) }}</span>
        </button>
      </div>
    </template>
  </div>
</template>
