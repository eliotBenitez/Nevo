<script setup lang="ts">
import { ref, computed, nextTick, watch, provide, onBeforeUnmount } from 'vue'
import { usePopupPosition } from '../composables/usePopupPosition'
import { NvMenuContextKey, type NvMenuItemDef, type Placement, type NvMenuContext } from './menu-types'
import NvMenuItem from './NvMenuItem.vue'
import NvMenuSeparator from './NvMenuSeparator.vue'
import NvMenuLabel from './NvMenuLabel.vue'

interface Props {
  open?: boolean
  items?: NvMenuItemDef[]
  placement?: Placement
  offset?: [number, number]
  width?: string
  position?: { top: number; left: number }
}

const props = withDefaults(defineProps<Props>(), {
  placement: 'bottom-start',
  offset: () => [0, 6],
})

const emit = defineEmits<{ 'update:open': [value: boolean] }>()

const isOpen = ref(false)
const triggerWrapRef = ref<HTMLDivElement | null>(null)
const menuRef = ref<HTMLDivElement | null>(null)

const anchorEl = computed<HTMLElement | null>(() => {
  const w = triggerWrapRef.value
  return w ? (w.firstElementChild as HTMLElement | null) ?? w : null
})

const { position, reposition } = usePopupPosition({
  anchorRef: anchorEl,
  popupRef: menuRef,
  placement: computed(() => props.placement),
  offset: computed(() => props.offset),
})

watch(() => props.open, (val) => {
  if (val !== undefined) val ? openMenu() : closeMenu(false)
})

watch(() => props.position, (pos) => {
  if (pos && isOpen.value) nextTick(() => applyCursorPosition(pos))
})

function applyCursorPosition(pos: { top: number; left: number }) {
  const panel = menuRef.value
  if (!panel) return
  const PAD = 12
  const W = window.innerWidth
  const H = window.innerHeight
  let { top, left } = pos
  if (left + panel.offsetWidth > W - PAD) left = W - PAD - panel.offsetWidth
  if (top + panel.offsetHeight > H - PAD) top = H - PAD - panel.offsetHeight
  position.value = { top: Math.max(PAD, top), left: Math.max(PAD, left), transformOrigin: 'top left' }
}

function applyPosition() {
  if (props.position) applyCursorPosition(props.position)
  else reposition()
}

function getNavigableItems() {
  return Array.from(
    menuRef.value?.querySelectorAll<HTMLButtonElement>('.nv-menu-item:not([disabled])') ?? []
  )
}

function navigate(dir: 1 | -1) {
  const items = getNavigableItems()
  if (!items.length) return
  const idx = items.indexOf(document.activeElement as HTMLButtonElement)
  const next = idx === -1
    ? (dir === 1 ? 0 : items.length - 1)
    : (idx + dir + items.length) % items.length
  items[next]?.focus()
}

function openMenu() {
  if (isOpen.value) return
  isOpen.value = true
  emit('update:open', true)
  if (!props.position) {
    window.addEventListener('resize', reposition)
    window.addEventListener('scroll', reposition, { passive: true, capture: true })
  }
  nextTick(() => {
    applyPosition()
    nextTick(() => {
      applyPosition()
      getNavigableItems()[0]?.focus()
    })
  })
}

function closeMenu(restoreFocus = true) {
  if (!isOpen.value) return
  isOpen.value = false
  emit('update:open', false)
  if (!props.position) {
    window.removeEventListener('resize', reposition)
    window.removeEventListener('scroll', reposition, { capture: true })
  }
  if (restoreFocus && !props.position) {
    const trigger = anchorEl.value
    nextTick(() => trigger?.focus())
  }
}

function toggleMenu() {
  if (props.position !== undefined) return
  isOpen.value ? closeMenu() : openMenu()
}

function onDocPointerDown(e: PointerEvent) {
  const target = e.target as Node
  if (!menuRef.value?.contains(target) && !triggerWrapRef.value?.contains(target)) {
    closeMenu(false)
  }
}

watch(isOpen, (val) => {
  if (val) document.addEventListener('pointerdown', onDocPointerDown)
  else document.removeEventListener('pointerdown', onDocPointerDown)
})

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onDocPointerDown)
  window.removeEventListener('resize', reposition)
  window.removeEventListener('scroll', reposition, { capture: true })
})

function onMenuKeydown(e: KeyboardEvent) {
  switch (e.key) {
    case 'ArrowDown': e.preventDefault(); navigate(1); break
    case 'ArrowUp':   e.preventDefault(); navigate(-1); break
    case 'Home':      e.preventDefault(); getNavigableItems()[0]?.focus(); break
    case 'End': {
      e.preventDefault()
      const items = getNavigableItems()
      items[items.length - 1]?.focus()
      break
    }
    case 'Escape': e.preventDefault(); closeMenu(true); break
    case 'Tab':    e.preventDefault(); closeMenu(false); break
  }
}

const menuContext: NvMenuContext = {
  closeAll: () => closeMenu(false),
  closeMenuPanel: () => closeMenu(true),
  depth: 0,
}
provide(NvMenuContextKey, menuContext)

function resolveComponent(item: NvMenuItemDef) {
  if (item.type === 'separator') return NvMenuSeparator
  if (item.type === 'label') return NvMenuLabel
  return NvMenuItem
}

function resolveProps(item: NvMenuItemDef) {
  if (item.type === 'separator') return {}
  if (item.type === 'label') return { label: item.label }
  return { icon: item.icon, label: item.label, shortcut: item.shortcut, danger: item.danger, disabled: item.disabled, items: item.items }
}
</script>

<template>
  <div class="nv-popup-menu">
    <div ref="triggerWrapRef" class="nv-popup-menu__trigger-wrap" @click.stop="toggleMenu">
      <slot name="trigger" />
    </div>

    <Teleport to="body">
      <Transition name="nv-menu">
        <div
          v-if="isOpen"
          ref="menuRef"
          role="menu"
          tabindex="-1"
          class="nv-popup-menu__panel"
          :style="{
            top: `${position.top}px`,
            left: `${position.left}px`,
            width: width,
            transformOrigin: position.transformOrigin,
            zIndex: 500,
          }"
          @pointerdown.stop
          @keydown="onMenuKeydown"
        >
          <template v-if="items?.length">
            <component
              :is="resolveComponent(item)"
              v-for="(item, i) in items"
              :key="i"
              v-bind="resolveProps(item)"
              @select="item.action?.()"
            />
          </template>
          <slot v-else />
        </div>
      </Transition>
    </Teleport>
  </div>
</template>
