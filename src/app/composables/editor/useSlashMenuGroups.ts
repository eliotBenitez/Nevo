import { computed, markRaw, type Component, type Ref } from 'vue'
import { useI18n } from 'vue-i18n'
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
  Palette,
  Database,
  ListFilter,
  Music,
  Video,
  Paperclip,
  BarChart3,
  GitBranch,
  Network,
  FileText,
  LayoutTemplate,
  Mic,
} from '@lucide/vue'
import type { NevoSlashItem } from '../../../types/editor-plugin'

export interface SlashMenuEntry {
  item: NevoSlashItem
  /** Position in the plugin's flat `itemIds` order (drives `activeIndex`). */
  index: number
  title: string
  meta: string
  icon: Component
}

export interface SlashMenuGroup {
  key: string
  label: string
  entries: SlashMenuEntry[]
}

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
  database: Database,
  query: ListFilter,
  image: ImageIcon,
  ul: List,
  ol: ListOrdered,
  callout: MessageSquareQuote,
  toggle: ChevronRightSquare,
  embed: Globe,
  divider: Minus,
  checklist: CheckSquare,
  draw: Palette,
  audio: Music,
  'voice-recording': Mic,
  video: Video,
  file: Paperclip,
  chart: BarChart3,
  mermaid: GitBranch,
  markmap: Network,
  'note-embed': FileText,
  'insert-template': LayoutTemplate,
}

// Must match the category order the slash plugin flattens items in
// (`groupAndFlatSlashItems` in src/editor-core/slash.ts), otherwise the
// highlighted entry and `activeIndex` drift apart.
const CATEGORY_ORDER = ['text', 'lists', 'code', 'media', 'layout']

/** Groups slash items by category for rendering, in the plugin's flat order. */
export function useSlashMenuGroups(items: Ref<NevoSlashItem[]>) {
  const { t } = useI18n()

  function title(item: NevoSlashItem): string {
    const key = `slashMenu.items.${item.id.replace(/-/g, '_')}`
    const translated = t(key)
    return translated === key ? item.title : translated
  }

  function meta(item: NevoSlashItem): string {
    const keyword = item.keywords?.[0]
    return keyword ? `/${item.id} · ${keyword}` : `/${item.id}`
  }

  const groups = computed<SlashMenuGroup[]>(() => {
    const map = new Map<string, NevoSlashItem[]>()
    const uncategorized: NevoSlashItem[] = []

    for (const item of items.value) {
      const category = item.category ?? ''
      if (!category) {
        uncategorized.push(item)
      } else {
        if (!map.has(category)) map.set(category, [])
        map.get(category)!.push(item)
      }
    }

    const ordered: Array<{ key: string, label: string, items: NevoSlashItem[] }> = []
    for (const key of CATEGORY_ORDER) {
      const groupItems = map.get(key)
      if (groupItems?.length) {
        ordered.push({ key, label: t(`slashMenu.categories.${key}`), items: groupItems })
        map.delete(key)
      }
    }
    for (const [key, groupItems] of map) {
      if (groupItems.length) ordered.push({ key, label: key, items: groupItems })
    }
    if (uncategorized.length) ordered.push({ key: '__other', label: '', items: uncategorized })

    let index = 0
    return ordered.map(group => ({
      key: group.key,
      label: group.label,
      entries: group.items.map(item => ({
        item,
        index: index++,
        title: title(item),
        meta: meta(item),
        icon: markRaw(slashIconById[item.id] ?? Pilcrow),
      })),
    }))
  })

  return { groups }
}
