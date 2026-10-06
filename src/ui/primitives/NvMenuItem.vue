<script setup lang="ts">
import { ref, computed, inject, provide, nextTick, onBeforeUnmount, getCurrentInstance, markRaw, type Component } from 'vue'
import { ChevronRight } from '@lucide/vue'
import { NvMenuContextKey, type NvMenuItemDef, type NvMenuContext } from './menu-types'
import NvMenuSeparator from './NvMenuSeparator.vue'
import NvMenuLabel from './NvMenuLabel.vue'

defineOptions({ name: 'NvMenuItem' })

// Self-reference resolved synchronously from the current instance — avoids the
// defineAsyncComponent race condition where prevVNode.component===null during
// shouldUpdateComponent, causing "null is not an object (evaluating 'component.emitsOptions')".
const NvMenuItemSelf: Component = markRaw(getCurrentInstance()!.type as Component)

interface Props {
  icon?: Component
  label?: string
  shortcut?: string
  danger?: boolean
  disabled?: boolean
  action?: () => void
  items?: NvMenuItemDef[]
}

const props = defineProps<Props>()
const emit = defineEmits<{ select: [] }>()

const menuCtx = inject<NvMenuContext | null>(NvMenuContextKey, null)

const itemRef = ref<HTMLButtonElement | null>(null)
const submenuPanelRef = ref<HTMLDivElement | null>(null)
const submenuOpen = ref(false)
const submenuPos = ref({ top: 0, left: 0 })
const openTimer = ref<ReturnType<typeof setTimeout> | null>(null)
const closeTimer = ref<ReturnType<typeof setTimeout> | null>(null)

const hasSubmenu = computed(() => !!props.items?.length)

function clearTimers() {
  if (openTimer.value !== null) { clearTimeout(openTimer.value); openTimer.value = null }
  if (closeTimer.value !== null) { clearTimeout(closeTimer.value); closeTimer.value = null }
}

function positionSubmenu() {
  const anchor = itemRef.value
  const panel = submenuPanelRef.value
  if (!anchor || !panel) return

  const r = anchor.getBoundingClientRect()
  const pw = panel.offsetWidth
  const ph = panel.offsetHeight
  const PAD = 12
  const SUBMENU_GAP = 8

  let left = r.right + SUBMENU_GAP
  if (left + pw > window.innerWidth - PAD) left = r.left - pw - SUBMENU_GAP
  let top = r.top
  if (top + ph > window.innerHeight - PAD) top = window.innerHeight - PAD - ph
  top = Math.max(PAD, top)
  submenuPos.value = { top, left }
}

async function openSubmenu() {
  submenuOpen.value = true
  await nextTick()
  positionSubmenu()
  await nextTick()
  const first = submenuPanelRef.value?.querySelector<HTMLButtonElement>('.nv-menu-item:not([disabled])')
  first?.focus()
}

function onMouseEnter() {
  if (props.disabled) return
  itemRef.value?.focus()
  clearTimers()
  if (!hasSubmenu.value) return
  openTimer.value = setTimeout(openSubmenu, 150)
}

function onMouseLeave() {
  clearTimers()
  if (!hasSubmenu.value) return
  closeTimer.value = setTimeout(() => { submenuOpen.value = false }, 200)
}

function onClick() {
  if (props.disabled) return
  if (hasSubmenu.value) { openSubmenu(); return }
  props.action?.()
  emit('select')
  menuCtx?.closeAll()
}

function navigateSubmenu(dir: 1 | -1) {
  const panel = submenuPanelRef.value
  if (!panel) return
  const items = Array.from(panel.querySelectorAll<HTMLButtonElement>('.nv-menu-item:not([disabled])'))
  const idx = items.indexOf(document.activeElement as HTMLButtonElement)
  const next = idx === -1
    ? (dir === 1 ? 0 : items.length - 1)
    : (idx + dir + items.length) % items.length
  items[next]?.focus()
}

function onItemKeydown(e: KeyboardEvent) {
  if (e.key === 'ArrowRight' && hasSubmenu.value) {
    e.preventDefault()
    e.stopPropagation()
    openSubmenu()
  } else if (e.key === 'ArrowLeft' && submenuOpen.value) {
    e.preventDefault()
    e.stopPropagation()
    submenuOpen.value = false
    itemRef.value?.focus()
  }
}

function onSubmenuKeydown(e: KeyboardEvent) {
  switch (e.key) {
    case 'ArrowDown':
      e.preventDefault(); e.stopPropagation(); navigateSubmenu(1); break
    case 'ArrowUp':
      e.preventDefault(); e.stopPropagation(); navigateSubmenu(-1); break
    case 'Home':
      e.preventDefault(); e.stopPropagation()
      submenuPanelRef.value?.querySelector<HTMLButtonElement>('.nv-menu-item:not([disabled])')?.focus()
      break
    case 'End': {
      e.preventDefault(); e.stopPropagation()
      const all = submenuPanelRef.value?.querySelectorAll<HTMLButtonElement>('.nv-menu-item:not([disabled])')
      all?.[all.length - 1]?.focus()
      break
    }
    case 'ArrowLeft':
    case 'Escape':
      e.preventDefault(); e.stopPropagation()
      submenuOpen.value = false
      itemRef.value?.focus()
      break
    case 'Tab':
      e.preventDefault()
      submenuOpen.value = false
      menuCtx?.closeAll()
      break
  }
}

onBeforeUnmount(clearTimers)

const depth = (menuCtx?.depth ?? 0) + 1
const submenuContext: NvMenuContext = {
  closeAll: () => { submenuOpen.value = false; menuCtx?.closeAll() },
  closeMenuPanel: () => { submenuOpen.value = false; itemRef.value?.focus() },
  depth,
}
provide(NvMenuContextKey, submenuContext)

function resolveComponent(item: NvMenuItemDef) {
  if (item.type === 'separator') return NvMenuSeparator
  if (item.type === 'label') return NvMenuLabel
  return NvMenuItemSelf
}

function resolveProps(item: NvMenuItemDef) {
  if (item.type === 'separator' || item.type === 'label') return { label: item.label }
  return {
    icon: item.icon,
    label: item.label,
    shortcut: item.shortcut,
    danger: item.danger,
    disabled: item.disabled,
    action: item.action,
    items: item.items,
  }
}
</script>

<template>
  <button
    ref="itemRef"
    role="menuitem"
    class="nv-menu-item tw:group tw:flex tw:h-8 tw:w-full tw:shrink-0 tw:cursor-pointer tw:items-center tw:gap-[7px] tw:whitespace-nowrap tw:rounded-[calc(8px*var(--radius-scale,1))] tw:border-0 tw:bg-transparent tw:px-2 tw:text-left tw:font-nv-ui tw:text-[12.5px] tw:font-medium tw:tracking-normal tw:transition-[background-color,color] tw:duration-[80ms] tw:focus:outline-none tw:disabled:cursor-not-allowed tw:disabled:pointer-events-none tw:disabled:opacity-45"
    :class="[
      danger
        ? 'is-danger tw:text-danger tw:hover:bg-(--surface-danger) tw:focus:bg-(--surface-danger)'
        : 'tw:text-content-primary tw:hover:bg-surface-subtle tw:focus:bg-surface-subtle',
      disabled && 'is-disabled',
    ]"
    :disabled="disabled || undefined"
    :aria-haspopup="hasSubmenu ? 'menu' : undefined"
    :aria-expanded="hasSubmenu ? submenuOpen : undefined"
    @click.stop="onClick"
    @mouseenter="onMouseEnter"
    @mouseleave="onMouseLeave"
    @keydown="onItemKeydown"
  >
    <component
      :is="icon"
      v-if="icon"
      :size="14"
      class="nv-menu-item__icon tw:shrink-0"
      :class="danger ? 'tw:text-danger' : 'tw:text-content-muted tw:group-hover:text-content-primary tw:group-focus:text-content-primary'"
    />
    <span class="nv-menu-item__label tw:min-w-0 tw:flex-1 tw:overflow-hidden tw:text-ellipsis">{{ label }}</span>
    <span v-if="shortcut" class="nv-menu-item__shortcut tw:ml-1 tw:shrink-0 tw:font-nv-mono tw:text-[10.5px] tw:text-content-muted">{{ shortcut }}</span>
    <ChevronRight v-if="hasSubmenu" :size="12" class="nv-menu-item__chevron tw:ml-0.5 tw:shrink-0 tw:text-content-muted" />
  </button>

  <Teleport v-if="hasSubmenu" to="body">
    <Transition name="nv-menu">
      <div
        v-if="submenuOpen"
        ref="submenuPanelRef"
        role="menu"
        tabindex="-1"
        class="nv-popup-menu__panel tw:fixed tw:min-w-[160px] tw:max-h-[min(420px,calc(100vh-24px))] tw:overflow-y-auto tw:rounded-[calc(12px*var(--radius-scale,1))] tw:border tw:border-solid tw:border-transparent tw:bg-(--menu-bg) tw:p-1 tw:shadow-(--menu-shadow) tw:outline-none"
        :style="{ top: `${submenuPos.top}px`, left: `${submenuPos.left}px`, zIndex: 500 + depth }"
        @pointerdown.stop
        @mouseenter="() => clearTimers()"
        @mouseleave="onMouseLeave"
        @keydown="onSubmenuKeydown"
      >
        <component
          :is="resolveComponent(item)"
          v-for="(item, i) in items"
          :key="i"
          v-bind="resolveProps(item)"
          @select="$emit('select')"
        />
      </div>
    </Transition>
  </Teleport>
</template>
