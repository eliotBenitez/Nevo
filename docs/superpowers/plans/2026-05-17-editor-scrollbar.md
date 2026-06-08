# Editor Scrollbar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a hover-only right-side overlay scrollbar to the workspace editor, keep smooth programmatic scrolling intact, and cover the new behavior with focused tests.

**Architecture:** Keep the overlay scrollbar owned by `src/app/components/WorkspaceEditorPane.vue`, where the editor scroll container already lives. Extract only the pure scrollbar math into a small helper module so thumb metrics, track clicks, and drag mapping can be tested without mounting the full editor shell; keep DOM event wiring, visibility lifecycle, and styling in the pane component.

**Tech Stack:** Vue 3 Composition API, TypeScript, Vitest, Vue Test Utils, Pinia, vue-i18n

---

## File Structure

### Create

| File | Responsibility |
|---|---|
| `src/app/components/editor/scrollbarMetrics.ts` | Pure math for thumb sizing, thumb offset, track click mapping, and drag-to-scroll conversion |
| `src/app/components/editor/scrollbarMetrics.test.ts` | Unit tests for scrollbar metric calculations and bounds behavior |
| `src/app/components/WorkspaceEditorPane.test.ts` | Component-level tests for overlay visibility, scroll sync, and thumb dragging |

### Modify

| File | Responsibility |
|---|---|
| `src/app/components/WorkspaceEditorPane.vue` | Add overlay scrollbar refs, reactive state, event wiring, lifecycle cleanup, and styles |

## Task 1: Add pure scrollbar metric helpers with tests

**Files:**
- Create: `src/app/components/editor/scrollbarMetrics.ts`
- Create: `src/app/components/editor/scrollbarMetrics.test.ts`

- [ ] **Step 1: Write the failing unit tests for scrollbar math**

```ts
import { describe, expect, it } from 'vitest'
import {
  MIN_SCROLLBAR_THUMB_HEIGHT,
  computeScrollbarMetrics,
  mapTrackClickToScrollTop,
  mapThumbDragToScrollTop,
} from './scrollbarMetrics'

describe('computeScrollbarMetrics', () => {
  it('returns hidden metrics when content does not overflow', () => {
    expect(computeScrollbarMetrics({
      scrollTop: 0,
      scrollHeight: 400,
      clientHeight: 400,
      trackHeight: 240,
    })).toEqual({
      isScrollable: false,
      thumbHeight: 0,
      thumbOffset: 0,
      maxThumbOffset: 0,
      maxScrollTop: 0,
    })
  })

  it('computes thumb height and offset for overflowing content', () => {
    expect(computeScrollbarMetrics({
      scrollTop: 300,
      scrollHeight: 1200,
      clientHeight: 400,
      trackHeight: 240,
    })).toEqual({
      isScrollable: true,
      thumbHeight: 80,
      thumbOffset: 60,
      maxThumbOffset: 160,
      maxScrollTop: 800,
    })
  })

  it('enforces the minimum thumb height for long documents', () => {
    const metrics = computeScrollbarMetrics({
      scrollTop: 0,
      scrollHeight: 10000,
      clientHeight: 400,
      trackHeight: 240,
    })

    expect(metrics.isScrollable).toBe(true)
    expect(metrics.thumbHeight).toBe(MIN_SCROLLBAR_THUMB_HEIGHT)
  })
})

describe('mapTrackClickToScrollTop', () => {
  it('centers the thumb around the clicked position within bounds', () => {
    expect(mapTrackClickToScrollTop({
      clickOffsetY: 150,
      trackHeight: 240,
      scrollHeight: 1200,
      clientHeight: 400,
    })).toBe(350)
  })
})

describe('mapThumbDragToScrollTop', () => {
  it('maps thumb drag distance to container scrollTop', () => {
    expect(mapThumbDragToScrollTop({
      pointerDeltaY: 40,
      startThumbOffset: 20,
      trackHeight: 240,
      thumbHeight: 80,
      scrollHeight: 1200,
      clientHeight: 400,
    })).toBe(300)
  })
})
```

- [ ] **Step 2: Run the new unit tests and verify they fail**

Run: `pnpm test:run -- src/app/components/editor/scrollbarMetrics.test.ts`

Expected: FAIL with module resolution errors for `./scrollbarMetrics` exports not existing yet.

- [ ] **Step 3: Implement the pure helper module**

```ts
const DEFAULT_MIN_THUMB_HEIGHT = 40

export const MIN_SCROLLBAR_THUMB_HEIGHT = DEFAULT_MIN_THUMB_HEIGHT

export interface ScrollbarMetricInput {
  scrollTop: number
  scrollHeight: number
  clientHeight: number
  trackHeight: number
}

export interface ScrollbarMetrics {
  isScrollable: boolean
  thumbHeight: number
  thumbOffset: number
  maxThumbOffset: number
  maxScrollTop: number
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

export function computeScrollbarMetrics({
  scrollTop,
  scrollHeight,
  clientHeight,
  trackHeight,
}: ScrollbarMetricInput): ScrollbarMetrics {
  const maxScrollTop = Math.max(scrollHeight - clientHeight, 0)

  if (trackHeight <= 0 || maxScrollTop <= 0) {
    return {
      isScrollable: false,
      thumbHeight: 0,
      thumbOffset: 0,
      maxThumbOffset: 0,
      maxScrollTop,
    }
  }

  const rawThumbHeight = trackHeight * (clientHeight / scrollHeight)
  const thumbHeight = clamp(rawThumbHeight, MIN_SCROLLBAR_THUMB_HEIGHT, trackHeight)
  const maxThumbOffset = Math.max(trackHeight - thumbHeight, 0)
  const thumbOffset = maxScrollTop === 0 ? 0 : (clamp(scrollTop, 0, maxScrollTop) / maxScrollTop) * maxThumbOffset

  return {
    isScrollable: true,
    thumbHeight,
    thumbOffset,
    maxThumbOffset,
    maxScrollTop,
  }
}

export interface TrackClickInput {
  clickOffsetY: number
  trackHeight: number
  scrollHeight: number
  clientHeight: number
}

export function mapTrackClickToScrollTop({
  clickOffsetY,
  trackHeight,
  scrollHeight,
  clientHeight,
}: TrackClickInput): number {
  const metrics = computeScrollbarMetrics({
    scrollTop: 0,
    scrollHeight,
    clientHeight,
    trackHeight,
  })

  if (!metrics.isScrollable) return 0

  const nextThumbOffset = clamp(clickOffsetY - metrics.thumbHeight / 2, 0, metrics.maxThumbOffset)
  return metrics.maxThumbOffset === 0 ? 0 : (nextThumbOffset / metrics.maxThumbOffset) * metrics.maxScrollTop
}

export interface ThumbDragInput {
  pointerDeltaY: number
  startThumbOffset: number
  trackHeight: number
  thumbHeight: number
  scrollHeight: number
  clientHeight: number
}

export function mapThumbDragToScrollTop({
  pointerDeltaY,
  startThumbOffset,
  trackHeight,
  thumbHeight,
  scrollHeight,
  clientHeight,
}: ThumbDragInput): number {
  const maxScrollTop = Math.max(scrollHeight - clientHeight, 0)
  const maxThumbOffset = Math.max(trackHeight - thumbHeight, 0)
  if (maxScrollTop === 0 || maxThumbOffset === 0) return 0

  const nextThumbOffset = clamp(startThumbOffset + pointerDeltaY, 0, maxThumbOffset)
  return (nextThumbOffset / maxThumbOffset) * maxScrollTop
}
```

- [ ] **Step 4: Run the unit tests and verify they pass**

Run: `pnpm test:run -- src/app/components/editor/scrollbarMetrics.test.ts`

Expected: PASS for all helper tests.

- [ ] **Step 5: Commit the helper task**

```bash
git add src/app/components/editor/scrollbarMetrics.ts src/app/components/editor/scrollbarMetrics.test.ts
git commit -m "Add editor scrollbar metric helpers"
```

## Task 2: Integrate the overlay scrollbar into WorkspaceEditorPane

**Files:**
- Modify: `src/app/components/WorkspaceEditorPane.vue`
- Create: `src/app/components/WorkspaceEditorPane.test.ts`
- Test: `src/app/components/editor/scrollbarMetrics.test.ts`

- [ ] **Step 1: Write the failing component tests for visibility and drag behavior**

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { createPinia, setActivePinia } from 'pinia'
import WorkspaceEditorPane from './WorkspaceEditorPane.vue'
import en from '../../locales/en.json'
import { createDefaultWorkspaceSettings } from '../../utils/workspace-settings'

vi.mock('../../tauri/commands', () => ({
  noteCommands: {
    importImageAsset: vi.fn(),
  },
}))

vi.mock('../../stores/graph', () => ({
  useGraphStore: () => ({
    loadNoteGraph: vi.fn(),
    updateNoteEdges: vi.fn(),
    clear: vi.fn(),
  }),
}))

vi.mock('../composables/editor/useEditorCore', () => ({
  createEditorCore: () => ({
    editorView: null,
    coreCommands: null,
    pluginHost: null,
    pendingImageTargetPos: null,
    lastLoadedNoteId: null,
    lastSerializedContent: null,
    toolbarPluginActions: [],
  }),
  useEditorCore: () => ({
    initPluginHost: vi.fn(),
    destroyEditorView: vi.fn(),
    setupEditorForNote: vi.fn(),
    executeStateCommand: vi.fn(),
    executeCommandById: vi.fn(),
    runPluginToolbarAction: vi.fn(),
    runSlashItemFromOverlay: vi.fn(),
  }),
}))

vi.mock('../composables/editor/useEditorOverlays', () => ({
  useEditorOverlays: () => ({
    slashOverlay: { open: false, query: '', activeIndex: 0, items: [], position: { top: 0, left: 0 } },
    toolbarOverlay: { visible: false, position: { top: 0, left: 0 } },
    tableMenuOverlay: { visible: false, context: null, position: { top: 0, left: 0 } },
    linkPopover: { open: false, href: '', editing: false, error: '', position: { top: 0, left: 0 } },
    highlightPicker: { open: false, position: { top: 0, left: 0 } },
    textColorPicker: { open: false, position: { top: 0, left: 0 } },
    mathPopover: { open: false, latex: '', isInline: true, position: { top: 0, left: 0 } },
    linkPickerOverlay: { open: false, query: '', activeIndex: 0, position: { top: 0, left: 0 } },
    activeMarkNames: [],
    updateOverlays: vi.fn(),
    closeOverlays: vi.fn(),
    clampOverlayPosition: vi.fn(),
  }),
}))

vi.mock('../composables/editor/useMathEditor', () => ({
  useMathEditor: () => ({
    openMathPopoverForNode: vi.fn(),
    insertInlineMathAndEdit: vi.fn(),
    insertBlockMathAndEdit: vi.fn(),
    openSelectedMathPopover: vi.fn(),
    closeMathPopover: vi.fn(),
    applyMathFromPopover: vi.fn(),
    removeMathFromPopover: vi.fn(),
    onMathInputKeyDown: vi.fn(),
    repositionMathPopover: vi.fn(),
  }),
}))

vi.mock('../composables/editor/useLinkEditor', () => ({
  useLinkEditor: () => ({
    openLinkPopover: vi.fn(),
    closeLinkPopover: vi.fn(),
    applyLinkFromPopover: vi.fn(),
    removeLinkFromPopover: vi.fn(),
    onLinkInputKeyDown: vi.fn(),
  }),
}))

vi.mock('../composables/editor/useImageUpload', () => ({
  useImageUpload: () => ({
    onEditorDragOver: vi.fn(),
    onEditorDrop: vi.fn(),
    onImageInputChange: vi.fn(),
    requestImagePicker: vi.fn(),
  }),
}))

const i18n = createI18n({
  legacy: false,
  locale: 'en',
  messages: { en },
})

function mountPane() {
  setActivePinia(createPinia())

  return mount(WorkspaceEditorPane, {
    attachTo: document.body,
    props: {
      note: {
        id: 'note-1',
        title: 'Scrollable note',
        icon: '📄',
        cover: null,
        folderId: null,
        createdAt: '2026-05-17T12:00:00.000Z',
        updatedAt: '2026-05-17T12:00:00.000Z',
        content: { type: 'doc', content: [] },
      },
      workspacePath: '/workspace',
      pluginManifests: [],
      settings: createDefaultWorkspaceSettings(),
      saveStatus: 'saved',
      folderName: null,
      pendingBlockTarget: null,
    },
    global: {
      plugins: [i18n],
      stubs: {
        LocalGraphPanel: true,
        DocAppearance: true,
        EditorSlashMenu: true,
        EditorFloatingToolbar: true,
        EditorColorPicker: true,
        EditorTableMenu: true,
        EditorLinkPopover: true,
        EditorMathPopover: true,
        EditorLinkPicker: true,
        NvNoteIcon: true,
      },
    },
  })
}

describe('WorkspaceEditorPane scrollbar overlay', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    document.body.innerHTML = ''
  })

  it('does not show the overlay when the document fits in the viewport', async () => {
    const wrapper = mountPane()
    const scrollBody = wrapper.get('.doc-body').element as HTMLElement

    Object.defineProperties(scrollBody, {
      clientHeight: { configurable: true, value: 400 },
      scrollHeight: { configurable: true, value: 400 },
    })

    scrollBody.dispatchEvent(new Event('scroll'))
    await wrapper.vm.$nextTick()

    expect(wrapper.find('.editor-scrollbar').exists()).toBe(false)
    wrapper.unmount()
  })

  it('reveals the overlay and updates thumb position on scroll', async () => {
    const wrapper = mountPane()
    const scrollBody = wrapper.get('.doc-body').element as HTMLElement

    Object.defineProperties(scrollBody, {
      clientHeight: { configurable: true, value: 400 },
      scrollHeight: { configurable: true, value: 1200 },
      scrollTop: { configurable: true, writable: true, value: 300 },
    })

    scrollBody.dispatchEvent(new Event('scroll'))
    await wrapper.vm.$nextTick()

    const thumb = wrapper.get('.editor-scrollbar__thumb')
    expect(wrapper.get('.editor-scrollbar').classes()).toContain('editor-scrollbar--visible')
    expect(thumb.attributes('style')).toContain('transform:')
    wrapper.unmount()
  })

  it('drags the thumb to update scrollTop', async () => {
    const wrapper = mountPane()
    const scrollBody = wrapper.get('.doc-body').element as HTMLElement

    Object.defineProperties(scrollBody, {
      clientHeight: { configurable: true, value: 400 },
      scrollHeight: { configurable: true, value: 1200 },
      scrollTop: { configurable: true, writable: true, value: 0 },
    })

    scrollBody.dispatchEvent(new Event('scroll'))
    await wrapper.vm.$nextTick()

    const trackRect = { top: 0, height: 240 } as DOMRect
    const track = wrapper.get('.editor-scrollbar__track').element as HTMLElement
    vi.spyOn(track, 'getBoundingClientRect').mockReturnValue(trackRect)

    await wrapper.get('.editor-scrollbar__thumb').trigger('mousedown', { clientY: 20 })
    document.dispatchEvent(new MouseEvent('mousemove', { clientY: 60 }))
    document.dispatchEvent(new MouseEvent('mouseup'))
    await wrapper.vm.$nextTick()

    expect(scrollBody.scrollTop).toBeGreaterThan(0)
    wrapper.unmount()
  })
})
```

- [ ] **Step 2: Run the component tests and verify they fail**

Run: `pnpm test:run -- src/app/components/WorkspaceEditorPane.test.ts`

Expected: FAIL because `.editor-scrollbar` markup and the related behavior do not exist yet.

- [ ] **Step 3: Add scrollbar state, DOM refs, and lifecycle wiring to `WorkspaceEditorPane.vue`**

```ts
import {
  MIN_SCROLLBAR_THUMB_HEIGHT,
  computeScrollbarMetrics,
  mapThumbDragToScrollTop,
  mapTrackClickToScrollTop,
} from './editor/scrollbarMetrics'

const editorScrollEl = ref<HTMLElement | null>(null)
const scrollbarTrackEl = ref<HTMLElement | null>(null)
const isScrollbarVisible = ref(false)
const isScrollbarScrollable = ref(false)
const isScrollbarDragging = ref(false)
const scrollbarThumbHeight = ref(MIN_SCROLLBAR_THUMB_HEIGHT)
const scrollbarThumbOffset = ref(0)

let hideScrollbarTimer: ReturnType<typeof window.setTimeout> | null = null
let dragStartClientY = 0
let dragStartThumbOffset = 0

function clearHideScrollbarTimer() {
  if (hideScrollbarTimer !== null) {
    window.clearTimeout(hideScrollbarTimer)
    hideScrollbarTimer = null
  }
}

function showScrollbar() {
  clearHideScrollbarTimer()
  if (isScrollbarScrollable.value) isScrollbarVisible.value = true
}

function scheduleScrollbarHide() {
  clearHideScrollbarTimer()
  if (isScrollbarDragging.value || !isScrollbarScrollable.value) return
  hideScrollbarTimer = window.setTimeout(() => {
    isScrollbarVisible.value = false
  }, 700)
}

function updateScrollbarMetrics() {
  const scrollEl = editorScrollEl.value
  const trackEl = scrollbarTrackEl.value
  if (!scrollEl) {
    isScrollbarScrollable.value = false
    isScrollbarVisible.value = false
    return
  }

  const fallbackTrackHeight = Math.max(scrollEl.clientHeight - 36, 0)

  const metrics = computeScrollbarMetrics({
    scrollTop: scrollEl.scrollTop,
    scrollHeight: scrollEl.scrollHeight,
    clientHeight: scrollEl.clientHeight,
    trackHeight: trackEl?.clientHeight ?? fallbackTrackHeight,
  })

  isScrollbarScrollable.value = metrics.isScrollable
  scrollbarThumbHeight.value = metrics.thumbHeight
  scrollbarThumbOffset.value = metrics.thumbOffset

  if (!metrics.isScrollable) {
    isScrollbarVisible.value = false
    isScrollbarDragging.value = false
    clearHideScrollbarTimer()
  }
}

function onEditorScroll() {
  updateScrollbarMetrics()
  showScrollbar()
  scheduleScrollbarHide()
}

function onScrollbarTrackMouseDown(event: MouseEvent) {
  if ((event.target as HTMLElement | null)?.closest('.editor-scrollbar__thumb')) return
  const scrollEl = editorScrollEl.value
  const trackEl = scrollbarTrackEl.value
  if (!scrollEl || !trackEl) return

  const rect = trackEl.getBoundingClientRect()
  scrollEl.scrollTop = mapTrackClickToScrollTop({
    clickOffsetY: event.clientY - rect.top,
    trackHeight: trackEl.clientHeight,
    scrollHeight: scrollEl.scrollHeight,
    clientHeight: scrollEl.clientHeight,
  })

  updateScrollbarMetrics()
  showScrollbar()
  scheduleScrollbarHide()
}

function onScrollbarThumbMouseDown(event: MouseEvent) {
  event.preventDefault()
  dragStartClientY = event.clientY
  dragStartThumbOffset = scrollbarThumbOffset.value
  isScrollbarDragging.value = true
  showScrollbar()
}

function onDocumentMouseMove(event: MouseEvent) {
  if (!isScrollbarDragging.value) return
  const scrollEl = editorScrollEl.value
  const trackEl = scrollbarTrackEl.value
  if (!scrollEl || !trackEl) return

  scrollEl.scrollTop = mapThumbDragToScrollTop({
    pointerDeltaY: event.clientY - dragStartClientY,
    startThumbOffset: dragStartThumbOffset,
    trackHeight: trackEl.clientHeight,
    thumbHeight: scrollbarThumbHeight.value,
    scrollHeight: scrollEl.scrollHeight,
    clientHeight: scrollEl.clientHeight,
  })

  updateScrollbarMetrics()
}

function onDocumentMouseUp() {
  if (!isScrollbarDragging.value) return
  isScrollbarDragging.value = false
  scheduleScrollbarHide()
}
```

- [ ] **Step 4: Add the overlay markup and bind the new handlers**

```vue
<section
  ref="editorScrollEl"
  class="doc-body"
  :class="editorBodyClasses"
  @scroll="onEditorScroll"
  @mouseenter="showScrollbar"
  @mouseleave="scheduleScrollbarHide"
>
  <DocAppearance
    ref="docAppearanceRef"
    :note-icon="noteIcon"
    :note-cover-style="noteCoverStyle"
    :cover="note?.cover"
    @select-icon="(icon) => emit('update:icon', icon)"
    @apply-gradient="(gradient) => emit('update:cover', `gradient:${gradient}`)"
    @apply-pastel="(color) => emit('update:cover', `color:${color}`)"
    @remove-cover="emit('update:cover', null)"
    @request-cover-image="coverImageInputRef?.click()"
  />
  <div class="doc-content" :style="editorContentStyle">
    <!-- existing title + editor markup unchanged -->
  </div>
  <div
    v-if="isScrollbarScrollable"
    class="editor-scrollbar"
    :class="{
      'editor-scrollbar--visible': isScrollbarVisible || isScrollbarDragging,
      'editor-scrollbar--dragging': isScrollbarDragging,
    }"
  >
    <div
      ref="scrollbarTrackEl"
      class="editor-scrollbar__track"
      @mousedown="onScrollbarTrackMouseDown"
    >
      <div
        class="editor-scrollbar__thumb"
        :style="{
          height: `${scrollbarThumbHeight}px`,
          transform: `translateY(${scrollbarThumbOffset}px)`,
        }"
        @mousedown="onScrollbarThumbMouseDown"
      />
    </div>
  </div>
</section>
```

- [ ] **Step 5: Add metric refresh triggers and cleanup**

```ts
function refreshScrollbarOnNextTick() {
  nextTick(() => updateScrollbarMetrics())
}

watch(
  () => props.note?.id,
  () => {
    refreshScrollbarOnNextTick()
  },
  { immediate: true },
)

watch(
  () => [
    props.settings.appearance.editorFontSize,
    props.settings.appearance.editorLineWidth,
    props.settings.editor.smoothScrolling,
    localGraphOpen.value,
  ],
  () => {
    refreshScrollbarOnNextTick()
  },
)

onMounted(() => {
  document.addEventListener('mousedown', onDocumentMouseDown)
  document.addEventListener('mousemove', onDocumentMouseMove)
  document.addEventListener('mouseup', onDocumentMouseUp)
  window.addEventListener('resize', updateScrollbarMetrics)
  refreshScrollbarOnNextTick()
})

onBeforeUnmount(async () => {
  document.removeEventListener('mousedown', onDocumentMouseDown)
  document.removeEventListener('mousemove', onDocumentMouseMove)
  document.removeEventListener('mouseup', onDocumentMouseUp)
  window.removeEventListener('resize', updateScrollbarMetrics)
  clearHideScrollbarTimer()
  editorSetup.destroyEditorView()
  if (core.pluginHost) {
    await core.pluginHost.deactivateAll()
    await core.pluginHost.dispose()
  }
})
```

- [ ] **Step 6: Add the overlay scrollbar styles**

```css
.editor-scrollbar {
  position: absolute;
  top: 18px;
  right: 10px;
  bottom: 18px;
  width: 14px;
  display: flex;
  align-items: stretch;
  justify-content: center;
  pointer-events: none;
  opacity: 0;
  transform: translateX(6px);
  transition: opacity 160ms ease, transform 160ms ease;
}

.editor-scrollbar--visible,
.editor-scrollbar--dragging {
  opacity: 1;
  transform: translateX(0);
}

.editor-scrollbar__track {
  width: 8px;
  border-radius: 999px;
  background: color-mix(in oklab, var(--hover-strong) 72%, transparent);
  pointer-events: auto;
  position: relative;
}

.editor-scrollbar__thumb {
  position: absolute;
  inset-inline: 0;
  top: 0;
  border-radius: 999px;
  background: color-mix(in oklab, var(--text-4) 72%, transparent);
  cursor: grab;
  transition: background 160ms ease;
}

.editor-scrollbar--dragging .editor-scrollbar__thumb,
.editor-scrollbar__track:hover .editor-scrollbar__thumb {
  background: color-mix(in oklab, var(--accent) 70%, var(--text-4));
}

:global(.workspace-root--reduced-motion) .editor-scrollbar,
:global(.workspace-root--reduced-motion) .editor-scrollbar__thumb {
  transition: none;
}
```

- [ ] **Step 7: Run the focused tests and verify they pass**

Run: `pnpm test:run -- src/app/components/editor/scrollbarMetrics.test.ts src/app/components/WorkspaceEditorPane.test.ts`

Expected: PASS for helper math, overlay visibility, and thumb sync tests.

- [ ] **Step 8: Commit the integration task**

```bash
git add src/app/components/WorkspaceEditorPane.vue src/app/components/WorkspaceEditorPane.test.ts src/app/components/editor/scrollbarMetrics.ts src/app/components/editor/scrollbarMetrics.test.ts
git commit -m "Add editor overlay scrollbar"
```

## Task 3: Verify editor behavior and run project-level checks

**Files:**
- Test: `src/app/components/editor/blockNavigation.test.ts`
- Test: `src/app/components/WorkspaceEditorPane.test.ts`
- Test: `src/app/components/editor/scrollbarMetrics.test.ts`

- [ ] **Step 1: Adjust the pane integration only if needed to keep block navigation stable**

```ts
async function applyPendingBlockTargetIfReady() {
  if (!props.pendingBlockTarget || !props.note) return
  if (props.pendingBlockTarget.noteId !== props.note.id) return

  await nextTick()
  updateScrollbarMetrics()
  const applied = focusBlockSearchTarget(editorRoot.value, props.pendingBlockTarget)
  if (applied) {
    updateScrollbarMetrics()
    emit('consumed-pending-target')
  }
}
```

- [ ] **Step 2: Run the full targeted verification set**

Run: `pnpm test:run -- src/app/components/editor/scrollbarMetrics.test.ts src/app/components/WorkspaceEditorPane.test.ts src/app/components/editor/blockNavigation.test.ts`

Expected: PASS for helper logic, overlay behavior, and block navigation regression coverage.

- [ ] **Step 3: Run typecheck and full test suite**

Run: `pnpm build`
Expected: PASS with `vue-tsc --noEmit` and Vite production build succeeding.

Run: `pnpm test:run`
Expected: PASS for the entire Vitest suite.

- [ ] **Step 4: Commit the verification task**

```bash
git add src/app/components/WorkspaceEditorPane.vue src/app/components/WorkspaceEditorPane.test.ts src/app/components/editor/scrollbarMetrics.ts src/app/components/editor/scrollbarMetrics.test.ts
git commit -m "Verify editor scrollbar behavior"
```
