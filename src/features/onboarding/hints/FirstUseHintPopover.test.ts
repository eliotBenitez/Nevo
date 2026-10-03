import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createI18n } from 'vue-i18n'
import { nextTick } from 'vue'
import FirstUseHintPopover from './FirstUseHintPopover.vue'
import { useOnboardingStore } from '../../../stores/onboarding'
import en from '../../../locales/en.json'

function mockRect(el: HTMLElement) {
  el.getBoundingClientRect = () => ({
    x: 100, y: 100, width: 40, height: 40, top: 100, left: 100, right: 140, bottom: 140,
    toJSON() { return {} },
  }) as DOMRect
}

function addTarget(id: string): HTMLElement {
  const el = document.createElement('button')
  el.setAttribute('data-hint', id)
  mockRect(el)
  document.body.appendChild(el)
  return el
}

let wrapper: VueWrapper | null = null

function mountPopover(isMobileLayout = false) {
  const pinia = createPinia()
  setActivePinia(pinia)
  wrapper = mount(FirstUseHintPopover, {
    props: { isMobileLayout },
    global: {
      plugins: [pinia, createI18n({ legacy: false, locale: 'en', messages: { en } })],
    },
    attachTo: document.body,
  })
  return wrapper
}

async function settle() {
  await nextTick()
  await nextTick()
  await nextTick()
}

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  document.body.innerHTML = ''
})

describe('FirstUseHintPopover', () => {
  beforeEach(() => {
    addTarget('editorCanvas')
  })

  it('renders nothing when no hint is active', () => {
    mountPopover()
    expect(document.body.querySelector('[role="dialog"]')).toBeNull()
  })

  it('renders the title and text for the active hint', async () => {
    mountPopover()
    useOnboardingStore().requestHint('editorCanvas')
    await settle()

    const dialog = document.body.querySelector('[role="dialog"]')
    expect(dialog).not.toBeNull()
    expect(dialog?.getAttribute('aria-modal')).toBe('false')
    expect(document.body.textContent).toContain(en.onboarding.hints.editorCanvas.title)
    expect(document.body.textContent).toContain(en.onboarding.hints.editorCanvas.text)
  })

  it('"Got it" marks the hint seen and closes the popover', async () => {
    mountPopover()
    const store = useOnboardingStore()
    store.requestHint('editorCanvas')
    await settle()

    const buttons = Array.from(document.body.querySelectorAll('button'))
    const gotIt = buttons.find(b => b.textContent === en.onboarding.hints.gotIt)
    gotIt?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await settle()

    expect(store.activeHint).toBeNull()
    expect(store.requestHint('editorCanvas')).toBe(false)
    expect(document.body.querySelector('[role="dialog"]')).toBeNull()
  })

  it('"Don\'t show hints" disables hints for good', async () => {
    mountPopover()
    const store = useOnboardingStore()
    store.requestHint('editorCanvas')
    await settle()

    const buttons = Array.from(document.body.querySelectorAll('button'))
    const disable = buttons.find(b => b.textContent === en.onboarding.hints.disable)
    disable?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await settle()

    expect(store.hintsEnabled).toBe(false)
    expect(store.activeHint).toBeNull()
    expect(store.requestHint('graphFilters')).toBe(false)
  })

  it('Escape dismisses the hint when focus is inside the popover', async () => {
    mountPopover()
    const store = useOnboardingStore()
    store.requestHint('editorCanvas')
    await settle()

    const dialog = document.body.querySelector('[role="dialog"]') as HTMLElement
    const gotIt = Array.from(dialog.querySelectorAll('button')).find(b => b.textContent === en.onboarding.hints.gotIt)!
    gotIt.focus()
    dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await settle()

    expect(store.activeHint).toBeNull()
  })

  it('Escape outside the popover does not dismiss it', async () => {
    mountPopover()
    const store = useOnboardingStore()
    store.requestHint('editorCanvas')
    await settle()

    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await settle()

    expect(store.activeHint).toBe('editorCanvas')
  })

  it('does not move focus to the popover on open', async () => {
    const outside = document.createElement('button')
    document.body.appendChild(outside)
    outside.focus()

    mountPopover()
    useOnboardingStore().requestHint('editorCanvas')
    await settle()

    expect(document.activeElement).toBe(outside)
  })
})

describe('FirstUseHintPopover target observer', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('keeps one observer per hint target across re-measures', async () => {
    // A new ResizeObserver always fires an initial notification; recreating it
    // on every measure() re-entered measure() each frame (RO loop errors).
    const observed: Element[] = []
    vi.stubGlobal('ResizeObserver', class {
      observe(el: Element) { observed.push(el) }
      unobserve() {}
      disconnect() {}
    })
    const target = addTarget('editorCanvas')
    mountPopover()
    useOnboardingStore().requestHint('editorCanvas')
    await settle()

    window.dispatchEvent(new Event('resize'))
    window.dispatchEvent(new Event('resize'))
    await settle()

    expect(observed.filter(el => el === target)).toHaveLength(1)
  })
})
