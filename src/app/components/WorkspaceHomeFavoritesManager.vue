<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch, type CSSProperties } from 'vue'
import { useI18n } from 'vue-i18n'
import { ArrowDown, ArrowUp, GripVertical, Search, Trash2 } from '@lucide/vue'
import NvModal from '../../ui/primitives/NvModal.vue'
import FavoritesManagerRow from './home/FavoritesManagerRow.vue'
import FavoritesManagerCandidate from './home/FavoritesManagerCandidate.vue'
import NvNoteIcon from '../../ui/primitives/NvNoteIcon.vue'
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
      || item.typeLabel.toLocaleLowerCase().includes(normalizedQuery)
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

function dragStateFor(index: number) {
  const sourceIndex = pointerSourceIndex.value
  const targetIndex = pointerTargetIndex.value
  return {
    dragging: pointerDragStarted.value && sourceIndex === index,
    dropBefore: pointerDragStarted.value
      && sourceIndex !== null
      && targetIndex === index
      && index < sourceIndex,
    dropAfter: pointerDragStarted.value
      && sourceIndex !== null
      && targetIndex === index
      && index > sourceIndex,
  }
}

// NvModal owns the focus trap and Escape now, and runs its own activate()
// (which focuses the first focusable element, i.e. the header's close
// button) in a nextTick queued off this same prop change. Waiting a second
// tick here guarantees this input-focus runs after that, so the search
// input — not the close button — ends up focused, matching this dialog's
// pre-NvModal behaviour.
watch(() => props.open, async (open) => {
  if (open) {
    await nextTick()
    await nextTick()
    searchInputRef.value?.focus()
  } else {
    cancelPointerDrag()
    query.value = ''
    filter.value = 'all'
  }
}, { immediate: true })

onBeforeUnmount(() => {
  resetPointerDrag()
})
</script>

<template>
  <NvModal
    :open="open"
    size="lg"
    labelled-by="home-manager-title"
    panel-class="home-manager-panel"
    @close="emit('close')"
  >
    <template #header>
      <div class="home-manager__header tw:min-w-0 tw:flex-1">
        <span class="tw:text-accent tw:text-[10px] tw:font-[750] tw:tracking-[0.1em] tw:uppercase">{{ t('workspace.home.favorites.kicker') }}</span>
        <h2 id="home-manager-title" class="tw:my-1 tw:text-[22px] tw:tracking-[-0.025em]">{{ t('workspace.home.manager.title') }}</h2>
        <p class="tw:m-0 tw:text-content-muted tw:text-xs">{{ t('workspace.home.manager.subtitle') }}</p>
      </div>
    </template>

    <div class="home-manager__body tw:grid tw:min-h-0 tw:flex-1 tw:[grid-template-columns:minmax(280px,1fr)_minmax(340px,1fr)]">
      <section
        class="home-manager__current tw:min-w-0 tw:min-h-0 tw:overflow-auto tw:p-4 tw:border-r-0 tw:bg-transparent"
        :aria-label="t('workspace.home.manager.current')"
      >
        <div class="home-manager__section-head tw:flex tw:items-center tw:justify-between tw:mb-2.5">
          <h3 class="tw:m-0 tw:text-[13px]">{{ t('workspace.home.manager.current') }}</h3>
          <span class="tw:text-content-muted tw:text-[11px]">{{ items.length }} / 8</span>
        </div>
        <TransitionGroup
          v-if="items.length"
          name="home-manager-favorite"
          tag="div"
          class="home-manager__favorite-list tw:flex tw:flex-col tw:gap-0"
          :class="{ 'home-manager__favorite-list--dragging tw:cursor-grabbing tw:select-none': isPointerDragging }"
        >
          <FavoritesManagerRow
            v-for="(item, index) in items"
            :key="item.key"
            :item="item"
            :index="index"
            :total="items.length"
            v-bind="dragStateFor(index)"
            @move-up="move(index, index - 1)"
            @move-down="move(index, index + 1)"
            @remove="remove(item)"
            @pointer-down="onPointerDown(index, $event)"
          />
        </TransitionGroup>
        <p v-else class="home-manager__empty tw:m-0 tw:text-content-muted tw:text-xs">{{ t('workspace.home.manager.noFavorites') }}</p>
        <p class="home-manager__hint tw:m-0 tw:mt-2.5 tw:leading-[1.45] tw:text-content-muted tw:text-xs">{{ t('workspace.home.manager.keyboardHint') }}</p>
      </section>

      <section class="home-manager__library tw:min-w-0 tw:min-h-0 tw:overflow-auto tw:p-4" :aria-label="t('workspace.home.manager.library')">
        <label class="home-manager__search tw:flex tw:min-h-11 tw:items-center tw:gap-[9px] tw:px-[11px] tw:border tw:border-solid tw:border-transparent tw:rounded-[11px] tw:text-content-muted tw:bg-(--input-bg) tw:focus-within:border-accent">
          <Search :size="16" aria-hidden="true" />
          <input
            ref="searchInputRef"
            v-model="query"
            type="search"
            class="tw:w-full tw:border-0 tw:outline-0 tw:text-content-primary tw:bg-transparent tw:focus-visible:outline-0"
            :placeholder="t('workspace.home.manager.search')"
          />
        </label>
        <div class="home-manager__filters tw:flex tw:gap-1.5 tw:mt-2.5 tw:mb-3 tw:overflow-x-auto" :aria-label="t('workspace.home.manager.filters')">
          <button
            v-for="kind in filters"
            :key="kind"
            type="button"
            class="home-manager__filter tw:min-h-8 tw:px-[10px] tw:border tw:border-solid tw:border-transparent tw:rounded-full tw:text-[11px] tw:whitespace-nowrap tw:focus-visible:outline-2 tw:focus-visible:outline-accent tw:focus-visible:outline-offset-2"
            :class="filter === kind
              ? 'home-manager__filter--active tw:border-transparent tw:text-accent tw:bg-(--accent-soft)'
              : 'tw:text-content-muted tw:bg-transparent'"
            :aria-pressed="filter === kind"
            @click="filter = kind"
          >
            {{ t(`workspace.home.manager.filter.${kind}`) }}
          </button>
        </div>
        <div class="home-manager__candidate-list tw:flex tw:flex-col tw:gap-0">
          <FavoritesManagerCandidate
            v-for="item in filteredCandidates"
            :key="item.key"
            :item="item"
            :is-favorite="favoriteKeys.has(item.key)"
            @add="add(item)"
          />
          <p v-if="!filteredCandidates.length" class="home-manager__empty tw:m-0 tw:text-content-muted tw:text-xs">{{ t('workspace.home.manager.noResults') }}</p>
        </div>
      </section>
    </div>
    <div class="home-manager__announcement tw:absolute tw:w-px tw:h-px tw:p-0 tw:overflow-hidden tw:[clip-path:inset(50%)] tw:border-0 tw:-m-px tw:whitespace-nowrap" aria-live="polite">{{ announcement }}</div>

    <template #footer>
      <div class="home-manager__footer tw:flex tw:items-center tw:justify-between tw:gap-4 tw:w-full">
        <span class="tw:m-0 tw:text-content-muted tw:text-xs">{{ t('workspace.home.manager.footer') }}</span>
        <button
          type="button"
          class="nv-btn nv-btn--primary tw:focus-visible:outline-2 tw:focus-visible:outline-accent tw:focus-visible:outline-offset-2"
          @click="emit('close')"
        >
          {{ t('workspace.home.manager.done') }}
        </button>
      </div>
    </template>
  </NvModal>

  <Teleport to="body">
    <div
      v-if="floatingFavorite"
      ref="floatingFavoriteRef"
      class="home-manager__favorite home-manager__favorite--floating tw:flex tw:min-h-[56px] tw:items-center tw:gap-1 tw:py-1 tw:px-1 tw:rounded-none"
      :class="{
        'home-manager__favorite--floating-ready': pointerPreviewReady,
        'home-manager__favorite--unavailable': !floatingFavorite.available && !floatingFavorite.loading,
      }"
      :style="pointerFloatingStyle"
      aria-hidden="true"
    >
      <span class="home-manager__drag tw:grid tw:w-8 tw:h-8 tw:flex-none tw:place-items-center tw:border-0 tw:rounded-lg tw:text-content-muted tw:bg-transparent tw:cursor-grab"><GripVertical :size="16" /></span>
      <span class="home-manager__item-icon tw:grid tw:w-[34px] tw:h-[34px] tw:flex-none tw:place-items-center tw:rounded-[9px] tw:bg-(--hover)"><NvNoteIcon :value="floatingFavorite.icon" :size="17" /></span>
      <span class="home-manager__item-copy tw:flex tw:min-w-0 tw:flex-1 tw:flex-col tw:gap-0.5">
        <strong class="tw:overflow-hidden tw:text-ellipsis tw:whitespace-nowrap tw:text-xs tw:font-[620]">{{ floatingFavorite.title }}</strong>
        <span class="tw:overflow-hidden tw:text-ellipsis tw:whitespace-nowrap tw:text-content-muted tw:text-[10px]">
          {{ floatingFavorite.loading ? t('workspace.home.favorites.loadingPlugin') : !floatingFavorite.available ? t('workspace.home.manager.unavailable') : floatingFavorite.typeLabel }}
        </span>
      </span>
      <span class="home-manager__floating-actions tw:grid tw:w-24 tw:h-8 tw:flex-none tw:grid-cols-[repeat(3,32px)] tw:items-center tw:justify-end tw:text-content-muted">
        <span class="tw:grid tw:w-8 tw:h-8 tw:place-items-center"><ArrowUp :size="14" /></span>
        <span class="tw:grid tw:w-8 tw:h-8 tw:place-items-center"><ArrowDown :size="14" /></span>
        <span class="tw:grid tw:w-8 tw:h-8 tw:place-items-center"><Trash2 :size="15" /></span>
      </span>
    </div>
  </Teleport>
</template>

<style scoped src="../../styles/app/workspace-home-favorites-manager.css"></style>

<!-- The scoped stylesheet above must stay the FIRST style block: vite:vue resolves a
     `src`-imported style by the CSS file's own path, and at a non-zero index the dev
     server misses the descriptor entry and 500s on that module.
     The panel element lives inside NvModal's template and is teleported to
     <body>, so a scoped rule (including that scoped external stylesheet)
     would not reach it. This block fills NvModal's body
     edge-to-edge instead of the primitive's own 18px inset, matching
     WorkspaceSettingsModal's `settings-modal-panel` treatment, so the
     current/library columns keep their pre-migration independent scroll. -->
<style>
.home-manager-panel {
  color: var(--text-primary);
  max-width: min(960px, calc(100vw - 32px));
  min-width: 0;
}

.home-manager-panel .nv-modal__body {
  display: flex;
  flex-direction: column;
  min-height: 0;
  padding: 0;
  overflow: hidden;
}

@media (max-width: 560px) {
  .home-manager-panel {
    max-width: 100%;
  }
}
</style>
