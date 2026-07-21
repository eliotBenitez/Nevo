<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch, type CSSProperties } from 'vue'
import { useI18n } from 'vue-i18n'
import { ArrowDown, ArrowUp, GripVertical, Plus, Search, Trash2, X } from 'lucide-vue-next'
import NvNoteIcon from '../../ui/primitives/NvNoteIcon.vue'
import { useFocusTrap } from '../../ui/composables/useFocusTrap'
import type { WorkspaceHomeItem, WorkspaceHomeItemKind } from '../composables/useWorkspaceHome'

interface Props {
  open: boolean
  items: WorkspaceHomeItem[]
  candidates: WorkspaceHomeItem[]
}

const props = defineProps<Props>()
const emit = defineEmits<{
  close: []
  add: [item: WorkspaceHomeItem]
  remove: [item: WorkspaceHomeItem]
  move: [fromIndex: number, toIndex: number]
}>()

const { t } = useI18n()
const dialogRef = ref<HTMLElement | null>(null)
const searchInputRef = ref<HTMLInputElement | null>(null)
const query = ref('')
const filter = ref<'all' | WorkspaceHomeItemKind>('all')
const announcement = ref('')
const pointerSourceIndex = ref<number | null>(null)
const pointerTargetIndex = ref<number | null>(null)
const pointerDragStarted = ref(false)
const pointerPreviewReady = ref(false)
const pointerFloatingStyle = ref<CSSProperties>({})
const floatingFavoriteRef = ref<HTMLElement | null>(null)
const isPointerDragging = computed(() => pointerDragStarted.value)
const floatingFavorite = computed(() => (
  pointerSourceIndex.value === null ? null : props.items[pointerSourceIndex.value] ?? null
))
const { activate, deactivate } = useFocusTrap(dialogRef, computed(() => props.open))

interface PointerDragRuntime {
  pointerId: number
  startX: number
  startY: number
  pointerX: number
  pointerY: number
  renderX: number
  renderY: number
  grabOffsetX: number
  grabOffsetY: number
  rafId: number | null
}

const pointerDragThreshold = 4
const pointerDragFollowFactor = 0.82
const pointerDragSettleEpsilon = 0.35
let pointerDragRuntime: PointerDragRuntime | null = null

const filters: Array<'all' | WorkspaceHomeItemKind> = [
  'all',
  'note',
  'folder',
  'board',
  'graph',
  'pluginView',
]

const favoriteKeys = computed(() => new Set(props.items.map(item => item.key)))
const filteredCandidates = computed(() => {
  const normalizedQuery = query.value.trim().toLocaleLowerCase()
  return props.candidates.filter((item) => {
    if (filter.value !== 'all' && item.kind !== filter.value) return false
    if (!normalizedQuery) return true
    return item.title.toLocaleLowerCase().includes(normalizedQuery)
      || t(`workspace.home.types.${item.kind}`).toLocaleLowerCase().includes(normalizedQuery)
  })
})

function announce(key: string, params: Record<string, unknown> = {}) {
  announcement.value = ''
  nextTick(() => {
    announcement.value = t(key, params)
  })
}

function add(item: WorkspaceHomeItem) {
  if (favoriteKeys.value.has(item.key)) return
  if (props.items.length >= 8) {
    announce('workspace.home.manager.limit')
    return
  }
  emit('add', item)
  announce('workspace.home.manager.added', { title: item.title })
}

function remove(item: WorkspaceHomeItem) {
  emit('remove', item)
  announce('workspace.home.manager.removed', { title: item.title })
}

function move(fromIndex: number, toIndex: number) {
  if (fromIndex === toIndex || toIndex < 0 || toIndex >= props.items.length) return
  emit('move', fromIndex, toIndex)
}

function removePointerListeners() {
  window.removeEventListener('pointermove', onWindowPointerMove)
  window.removeEventListener('pointerup', onWindowPointerUp)
  window.removeEventListener('pointercancel', onWindowPointerCancel)
}

function prefersReducedMotion() {
  return typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function resolvePointerDropTarget(clientX: number, clientY: number) {
  const target = document.elementFromPoint(clientX, clientY)
    ?.closest<HTMLElement>('[data-favorite-index]')
  if (!target) return
  const index = Number(target.dataset.favoriteIndex)
  if (Number.isInteger(index) && pointerTargetIndex.value !== index) {
    pointerTargetIndex.value = index
  }
}

function applyPointerPreviewPosition(runtime: PointerDragRuntime) {
  const preview = floatingFavoriteRef.value
  if (!preview) return false
  preview.style.transform = `translate3d(${Math.round(runtime.renderX)}px, ${Math.round(runtime.renderY)}px, 0) scale(1.012)`
  return true
}

function renderPointerDragFrame() {
  const runtime = pointerDragRuntime
  if (!runtime || !pointerDragStarted.value) return
  runtime.rafId = null

  const targetX = runtime.pointerX - runtime.grabOffsetX
  const targetY = runtime.pointerY - runtime.grabOffsetY
  const reducedMotion = prefersReducedMotion()
  if (reducedMotion) {
    runtime.renderX = targetX
    runtime.renderY = targetY
  } else {
    runtime.renderX += (targetX - runtime.renderX) * pointerDragFollowFactor
    runtime.renderY += (targetY - runtime.renderY) * pointerDragFollowFactor
    if (Math.abs(targetX - runtime.renderX) <= pointerDragSettleEpsilon) runtime.renderX = targetX
    if (Math.abs(targetY - runtime.renderY) <= pointerDragSettleEpsilon) runtime.renderY = targetY
  }

  if (applyPointerPreviewPosition(runtime)) pointerPreviewReady.value = true
  resolvePointerDropTarget(runtime.pointerX, runtime.pointerY)

  if (
    !reducedMotion
    && (Math.abs(targetX - runtime.renderX) > pointerDragSettleEpsilon
      || Math.abs(targetY - runtime.renderY) > pointerDragSettleEpsilon)
  ) {
    schedulePointerDragFrame()
  }
}

function schedulePointerDragFrame() {
  if (!pointerDragRuntime || pointerDragRuntime.rafId !== null || !pointerDragStarted.value) return
  pointerDragRuntime.rafId = window.requestAnimationFrame(renderPointerDragFrame)
}

function resetPointerDrag() {
  if (pointerDragRuntime?.rafId !== null && pointerDragRuntime?.rafId !== undefined) {
    window.cancelAnimationFrame(pointerDragRuntime.rafId)
  }
  floatingFavoriteRef.value?.style.removeProperty('transform')
  pointerDragRuntime = null
  pointerDragStarted.value = false
  pointerPreviewReady.value = false
  pointerFloatingStyle.value = {}
  pointerSourceIndex.value = null
  pointerTargetIndex.value = null
  removePointerListeners()
  document.body.classList.remove('home-manager-favorites-dragging')
}

function finishPointerDrag(commit: boolean) {
  const sourceIndex = pointerSourceIndex.value
  const targetIndex = pointerTargetIndex.value
  resetPointerDrag()
  if (commit && sourceIndex !== null && targetIndex !== null) {
    move(sourceIndex, targetIndex)
  }
}

function onPointerDown(index: number, event: PointerEvent) {
  if (event.pointerType === 'mouse' && event.button !== 0) return
  event.preventDefault()
  resetPointerDrag()
  const row = (event.currentTarget as HTMLElement | null)
    ?.closest<HTMLElement>('[data-favorite-index]')
  const rect = row?.getBoundingClientRect()
  pointerSourceIndex.value = index
  pointerDragRuntime = {
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    pointerX: event.clientX,
    pointerY: event.clientY,
    renderX: rect?.left ?? event.clientX,
    renderY: rect?.top ?? event.clientY,
    grabOffsetX: rect ? event.clientX - rect.left : 18,
    grabOffsetY: rect ? event.clientY - rect.top : 18,
    rafId: null,
  }
  pointerFloatingStyle.value = {
    width: rect ? `${Math.round(rect.width)}px` : undefined,
    height: rect ? `${Math.round(rect.height)}px` : undefined,
  }
  window.addEventListener('pointermove', onWindowPointerMove)
  window.addEventListener('pointerup', onWindowPointerUp)
  window.addEventListener('pointercancel', onWindowPointerCancel)
}

function onWindowPointerMove(event: PointerEvent) {
  const runtime = pointerDragRuntime
  if (!runtime || runtime.pointerId !== event.pointerId) return

  runtime.pointerX = event.clientX
  runtime.pointerY = event.clientY
  if (!pointerDragStarted.value) {
    const distance = Math.hypot(event.clientX - runtime.startX, event.clientY - runtime.startY)
    if (distance < pointerDragThreshold) return
    pointerDragStarted.value = true
    pointerTargetIndex.value = pointerSourceIndex.value
    document.body.classList.add('home-manager-favorites-dragging')
    nextTick(() => {
      if (pointerDragRuntime !== runtime || !pointerDragStarted.value) return
      applyPointerPreviewPosition(runtime)
      pointerPreviewReady.value = true
    })
  }

  event.preventDefault()
  schedulePointerDragFrame()
}

function onWindowPointerCancel(event: PointerEvent) {
  if (pointerDragRuntime?.pointerId === event.pointerId) finishPointerDrag(false)
}

function onWindowPointerUp(event: PointerEvent) {
  const runtime = pointerDragRuntime
  if (!runtime || runtime.pointerId !== event.pointerId) return
  if (pointerDragStarted.value) {
    runtime.pointerX = event.clientX
    runtime.pointerY = event.clientY
    resolvePointerDropTarget(event.clientX, event.clientY)
  }
  finishPointerDrag(true)
}

function cancelPointerDrag() {
  finishPointerDrag(false)
}

function favoriteStateClasses(item: WorkspaceHomeItem, index: number) {
  const sourceIndex = pointerSourceIndex.value
  const targetIndex = pointerTargetIndex.value
  return {
    'home-manager__favorite--unavailable': !item.available && !item.loading,
    'home-manager__favorite--dragging': pointerDragStarted.value && sourceIndex === index,
    'home-manager__favorite--drop-before': pointerDragStarted.value
      && sourceIndex !== null
      && targetIndex === index
      && index < sourceIndex,
    'home-manager__favorite--drop-after': pointerDragStarted.value
      && sourceIndex !== null
      && targetIndex === index
      && index > sourceIndex,
  }
}

function onWindowKeydown(event: KeyboardEvent) {
  if (!props.open || event.key !== 'Escape') return
  event.preventDefault()
  event.stopPropagation()
  emit('close')
}

watch(() => props.open, (open) => {
  window.removeEventListener('keydown', onWindowKeydown, true)
  if (open) {
    window.addEventListener('keydown', onWindowKeydown, true)
    nextTick(() => {
      activate()
      searchInputRef.value?.focus()
    })
  } else {
    deactivate()
    cancelPointerDrag()
    query.value = ''
    filter.value = 'all'
  }
}, { immediate: true })

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onWindowKeydown, true)
  resetPointerDrag()
})
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="home-manager-backdrop" @click.self="emit('close')">
      <section
        ref="dialogRef"
        class="home-manager"
        role="dialog"
        aria-modal="true"
        :aria-label="t('workspace.home.manager.title')"
      >
        <header class="home-manager__header">
          <div>
            <span>{{ t('workspace.home.favorites.kicker') }}</span>
            <h2>{{ t('workspace.home.manager.title') }}</h2>
            <p>{{ t('workspace.home.manager.subtitle') }}</p>
          </div>
          <button type="button" class="nv-btn home-manager__close" :aria-label="t('workspace.context.cancel')" @click="emit('close')">
            <X :size="16" />
          </button>
        </header>

        <div class="home-manager__body">
          <section class="home-manager__current" :aria-label="t('workspace.home.manager.current')">
            <div class="home-manager__section-head">
              <h3>{{ t('workspace.home.manager.current') }}</h3>
              <span>{{ items.length }} / 8</span>
            </div>
            <TransitionGroup
              v-if="items.length"
              name="home-manager-favorite"
              tag="div"
              class="home-manager__favorite-list"
              :class="{ 'home-manager__favorite-list--dragging': isPointerDragging }"
            >
              <div
                v-for="(item, index) in items"
                :key="item.key"
                class="home-manager__favorite"
                :class="favoriteStateClasses(item, index)"
                :data-favorite-index="index"
                tabindex="0"
                @keydown.alt.up.prevent="move(index, index - 1)"
                @keydown.alt.down.prevent="move(index, index + 1)"
              >
                <button
                  type="button"
                  class="home-manager__drag"
                  :aria-label="t('workspace.home.manager.reorder', { title: item.title })"
                  @pointerdown.stop="onPointerDown(index, $event)"
                  @keydown.alt.up.prevent="move(index, index - 1)"
                  @keydown.alt.down.prevent="move(index, index + 1)"
                >
                  <GripVertical :size="16" />
                </button>
                <span class="home-manager__item-icon"><NvNoteIcon :value="item.icon" :size="17" /></span>
                <span class="home-manager__item-copy">
                  <strong>{{ item.title }}</strong>
                  <span>
                    {{ item.loading ? t('workspace.home.favorites.loadingPlugin') : !item.available ? t('workspace.home.manager.unavailable') : t(`workspace.home.types.${item.kind}`) }}
                  </span>
                </span>
                <div class="home-manager__move-buttons">
                  <button type="button" :disabled="index === 0" :aria-label="t('workspace.home.manager.moveUp')" @click="move(index, index - 1)">
                    <ArrowUp :size="14" />
                  </button>
                  <button type="button" :disabled="index === items.length - 1" :aria-label="t('workspace.home.manager.moveDown')" @click="move(index, index + 1)">
                    <ArrowDown :size="14" />
                  </button>
                </div>
                <button type="button" class="home-manager__remove" :aria-label="t('workspace.home.manager.remove', { title: item.title })" @click="remove(item)">
                  <Trash2 :size="15" />
                </button>
              </div>
            </TransitionGroup>
            <p v-else class="home-manager__empty">{{ t('workspace.home.manager.noFavorites') }}</p>
            <p class="home-manager__hint">{{ t('workspace.home.manager.keyboardHint') }}</p>
          </section>

          <section class="home-manager__library" :aria-label="t('workspace.home.manager.library')">
            <label class="home-manager__search">
              <Search :size="16" aria-hidden="true" />
              <input ref="searchInputRef" v-model="query" type="search" :placeholder="t('workspace.home.manager.search')" />
            </label>
            <div class="home-manager__filters" :aria-label="t('workspace.home.manager.filters')">
              <button
                v-for="kind in filters"
                :key="kind"
                type="button"
                :class="{ 'home-manager__filter--active': filter === kind }"
                :aria-pressed="filter === kind"
                @click="filter = kind"
              >
                {{ t(`workspace.home.manager.filter.${kind}`) }}
              </button>
            </div>
            <div class="home-manager__candidate-list">
              <div v-for="item in filteredCandidates" :key="item.key" class="home-manager__candidate">
                <span class="home-manager__item-icon"><NvNoteIcon :value="item.icon" :size="17" /></span>
                <span class="home-manager__item-copy">
                  <strong>{{ item.title }}</strong>
                  <span>{{ t(`workspace.home.types.${item.kind}`) }}</span>
                </span>
                <button
                  type="button"
                  class="nv-btn"
                  :disabled="favoriteKeys.has(item.key)"
                  :aria-label="t('workspace.home.manager.add', { title: item.title })"
                  @click="add(item)"
                >
                  <Plus :size="14" />
                  <span>{{ favoriteKeys.has(item.key) ? t('workspace.home.manager.onHome') : t('workspace.home.manager.addShort') }}</span>
                </button>
              </div>
              <p v-if="!filteredCandidates.length" class="home-manager__empty">{{ t('workspace.home.manager.noResults') }}</p>
            </div>
          </section>
        </div>

        <footer class="home-manager__footer">
          <span>{{ t('workspace.home.manager.footer') }}</span>
          <button type="button" class="nv-btn nv-btn--primary" @click="emit('close')">{{ t('workspace.home.manager.done') }}</button>
        </footer>
        <div class="home-manager__announcement" aria-live="polite">{{ announcement }}</div>
      </section>
    </div>
  </Teleport>

  <Teleport to="body">
    <div
      v-if="floatingFavorite"
      ref="floatingFavoriteRef"
      class="home-manager__favorite home-manager__favorite--floating"
      :class="{
        'home-manager__favorite--floating-ready': pointerPreviewReady,
        'home-manager__favorite--unavailable': !floatingFavorite.available && !floatingFavorite.loading,
      }"
      :style="pointerFloatingStyle"
      aria-hidden="true"
    >
      <span class="home-manager__drag"><GripVertical :size="16" /></span>
      <span class="home-manager__item-icon"><NvNoteIcon :value="floatingFavorite.icon" :size="17" /></span>
      <span class="home-manager__item-copy">
        <strong>{{ floatingFavorite.title }}</strong>
        <span>
          {{ floatingFavorite.loading ? t('workspace.home.favorites.loadingPlugin') : !floatingFavorite.available ? t('workspace.home.manager.unavailable') : t(`workspace.home.types.${floatingFavorite.kind}`) }}
        </span>
      </span>
      <span class="home-manager__floating-actions">
        <ArrowUp :size="14" />
        <ArrowDown :size="14" />
        <Trash2 :size="15" />
      </span>
    </div>
  </Teleport>
</template>

<style scoped src="../../styles/app/workspace-home-favorites-manager.css"></style>
