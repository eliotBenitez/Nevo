<script setup lang="ts">
import { ref, toRef } from 'vue'
import { useI18n } from 'vue-i18n'
import type { NevoSlashItem } from '../../../types/editor-plugin'
import type { SlashMenuLayout } from '../../../types/workspace'
import NvIconPicker from '../../../ui/primitives/NvIconPicker.vue'
import { useSlashMenuGroups } from '../../composables/editor/useSlashMenuGroups'
import SlashMenuList from './SlashMenuList.vue'
import SlashMenuPreviews from './SlashMenuPreviews.vue'
import SlashMenuTiles from './SlashMenuTiles.vue'

const props = withDefaults(defineProps<{
  open: boolean
  query: string
  activeIndex: number
  items: NevoSlashItem[]
  menuStyle: Record<string, string>
  emojiPickerOpen: boolean
  layout?: SlashMenuLayout
}>(), {
  layout: 'list',
})

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
const { groups } = useSlashMenuGroups(toRef(props, 'items'))

defineExpose({ menuRef })

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
    class="editor-overlay slash-menu tw:fixed tw:z-60 tw:max-h-[min(420px,calc(100vh-24px))] tw:overflow-x-hidden tw:overflow-y-auto tw:rounded-[calc(12px*var(--radius-scale,1))] tw:border tw:border-solid tw:border-transparent tw:bg-(--menu-bg) tw:shadow-(--shadow-overlay)"
    :class="[
      { 'slash-menu--picker': emojiPickerOpen, 'slash-menu--tiles': layout === 'grid' && !emojiPickerOpen, 'slash-menu--previews': layout === 'preview' && !emojiPickerOpen },
      layout !== 'list' && !emojiPickerOpen ? 'tw:w-[420px] tw:max-w-[min(420px,calc(100vw-24px))]' : 'tw:w-[320px] tw:max-w-[min(320px,calc(100vw-24px))]',
    ]"
    :style="menuStyle"
  >
    <div class="slash-menu__header tw:flex tw:items-center tw:justify-between tw:gap-2 tw:border-b-0 tw:px-3 tw:py-2 tw:max-[719px]:min-h-12 tw:max-[719px]:px-3.5">
      <span class="slash-menu__header-label tw:font-nv-mono tw:text-[13px] tw:leading-none tw:text-accent">/</span>
      <span class="slash-menu__header-query tw:flex-1 tw:font-nv-ui tw:text-[12.5px] tw:leading-none tw:text-content-secondary">{{ query }}</span>
      <span class="nv-kbd slash-menu__header-esc tw:text-[10px]">{{ t('common.keyboard.esc') }}</span>
    </div>

    <div v-if="emojiPickerOpen" class="slash-menu__picker tw:p-2.5 tw:[&_.nv-icon-picker]:w-full tw:[&_.nv-icon-picker]:rounded-none tw:[&_.nv-icon-picker]:border-0 tw:[&_.nv-icon-picker]:bg-transparent tw:[&_.nv-icon-picker]:p-0 tw:[&_.nv-icon-picker]:shadow-none" @mousedown.stop @click.stop>
      <NvIconPicker
        autofocus
        value=""
        :tabs="emojiPickerTabs"
        @close="emit('closeEmojiPicker')"
        @select="selectEmoji"
      />
    </div>

    <SlashMenuTiles
      v-else-if="layout === 'grid'"
      :groups="groups"
      :active-index="activeIndex"
      @select="selectItem"
      @item-mousedown="emit('itemMousedown', $event)"
    />
    <SlashMenuPreviews
      v-else-if="layout === 'preview'"
      :groups="groups"
      :active-index="activeIndex"
      @select="selectItem"
      @item-mousedown="emit('itemMousedown', $event)"
    />
    <SlashMenuList
      v-else
      :groups="groups"
      :active-index="activeIndex"
      @select="selectItem"
      @item-mousedown="emit('itemMousedown', $event)"
    />
  </div>
</template>
