import { defineComponent, h, ref, shallowRef, watch, type Component } from 'vue'

export type IconSet = 'lucide' | 'tabler'

// Module-level so plain-DOM renders (ProseMirror node views) react too.
export const iconSet = ref<IconSet>('lucide')

const tablerIcons = shallowRef<Record<string, Component> | null>(null)

// Tabler is code-split; Lucide renders until its chunk has loaded.
watch(iconSet, (value) => {
  if (value === 'tabler' && !tablerIcons.value) {
    void import('./tablerIcons').then((m) => { tablerIcons.value = m.tablerIcons })
  }
}, { immediate: true })

export function defineIcon(lucide: Component, name: string): Component {
  return defineComponent({
    name: `NvIcon${name}`,
    inheritAttrs: false,
    setup(_, { attrs }) {
      return () => {
        const tabler = iconSet.value === 'tabler' ? tablerIcons.value?.[name] : undefined
        if (!tabler) return h(lucide, attrs)
        const rest = { ...attrs }
        const width = rest.strokeWidth ?? rest['stroke-width']
        for (const key of ['strokeWidth', 'stroke-width', 'absoluteStrokeWidth', 'absolute-stroke-width']) delete rest[key]
        return h(tabler, width === undefined ? rest : { ...rest, stroke: width })
      }
    },
  })
}
