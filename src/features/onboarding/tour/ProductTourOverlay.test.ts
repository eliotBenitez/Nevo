import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createI18n } from 'vue-i18n'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import { nextTick } from 'vue'
import ProductTourOverlay from './ProductTourOverlay.vue'
import { useOnboardingStore } from '../../../stores/onboarding'
import en from '../../../locales/en.json'

const TARGET_IDS = ['new-note', 'tree', 'search', 'starter', 'graph']

function mockRect(el: HTMLElement) {
  el.getBoundingClientRect = () => ({
    x: 100, y: 100, width: 40, height: 40, top: 100, left: 100, right: 140, bottom: 140,
    toJSON() { return {} },
  }) as DOMRect
}

function addTarget(id: string): HTMLElement {
  const el = document.createElement('div')
  el.setAttribute('data-tour', id)
  mockRect(el)
  document.body.appendChild(el)
  return el
}

let wrapper: VueWrapper | null = null
let router: Router

function mountOverlay() {
  const pinia = createPinia()
  setActivePinia(pinia)
  router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div />' } },
      { path: '/workspace', component: { template: '<div />' } },
      { path: '/workspace/note/:id', component: { template: '<div />' } },
    ],
  })
  wrapper = mount(ProductTourOverlay, {
    props: { isMobileLayout: false },
    global: {
      plugins: [
        pinia,
        router,
        createI18n({ legacy: false, locale: 'en', messages: { en } }),
      ],
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

describe('ProductTourOverlay', () => {
  beforeEach(() => {
    TARGET_IDS.forEach(addTarget)
  })

  it('renders the welcome card when the tour becomes active', async () => {
    mountOverlay()
    const onboardingStore = useOnboardingStore()
    onboardingStore.startTour()
    await settle()

    expect(document.body.textContent).toContain(en.onboarding.tour.welcome.titleLead)
    expect(document.body.querySelector('[role="dialog"]')).not.toBeNull()
  })

  it('centers the welcome card via CSS without animating its position', async () => {
    mountOverlay()
    const onboardingStore = useOnboardingStore()
    onboardingStore.startTour()
    await settle()

    // A measured left/top with a transition made the card fly in from (0, 0).
    const card = document.body.querySelector<HTMLElement>('.tour-coach')!
    expect(card.style.left).toBe('')
    expect(card.style.top).toBe('')
    expect(card.className).not.toContain('transition-[left,top]')
    expect(card.className).toContain('tw:-translate-x-1/2')

    const start = Array.from(document.body.querySelectorAll('button'))
      .find(b => b.textContent === en.onboarding.tour.welcome.start)
    start?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await settle()

    const spotlightCard = document.body.querySelector<HTMLElement>('.tour-coach')!
    expect(spotlightCard.style.left).toMatch(/px$/)
    expect(spotlightCard.className).toContain('transition-[left,top]')
  })

  it('walks through the spotlight steps via Next and reaches the done card', async () => {
    mountOverlay()
    const onboardingStore = useOnboardingStore()
    onboardingStore.startTour()
    await settle()

    async function clickNext() {
      const buttons = Array.from(document.body.querySelectorAll('button'))
      const next = buttons.find(b => b.textContent === en.onboarding.tour.welcome.start || b.textContent === en.onboarding.tour.next || b.textContent === en.onboarding.tour.finish)
      next?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await settle()
    }

    // welcome -> step 1 (new-note)
    await clickNext()
    expect(document.body.textContent).toContain(en.onboarding.tour.steps.newNote.title)

    // step 1 -> 2 -> 3 -> 4 -> 5 (tree, search, starter, graph)
    await clickNext()
    expect(document.body.textContent).toContain(en.onboarding.tour.steps.tree.title)
    await clickNext()
    expect(document.body.textContent).toContain(en.onboarding.tour.steps.search.title)
    await clickNext()
    expect(document.body.textContent).toContain(en.onboarding.tour.steps.starter.title)
    await clickNext()
    expect(document.body.textContent).toContain(en.onboarding.tour.steps.graph.title)

    // step 5 -> done
    await clickNext()
    expect(document.body.textContent).toContain(en.onboarding.tour.done.titleLead)
  })

  it('skips a step whose target is missing or has zero size', async () => {
    document.querySelector('[data-tour="tree"]')?.remove()
    mountOverlay()
    const onboardingStore = useOnboardingStore()
    onboardingStore.startTour()
    await settle()

    async function clickNext() {
      const buttons = Array.from(document.body.querySelectorAll('button'))
      const next = buttons.find(b => b.textContent === en.onboarding.tour.welcome.start || b.textContent === en.onboarding.tour.next || b.textContent === en.onboarding.tour.finish)
      next?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await settle()
    }

    await clickNext() // welcome -> new-note
    expect(document.body.textContent).toContain(en.onboarding.tour.steps.newNote.title)
    await clickNext() // new-note -> search (tree skipped, missing target)
    expect(document.body.textContent).toContain(en.onboarding.tour.steps.search.title)
    expect(document.body.textContent).not.toContain(en.onboarding.tour.steps.tree.title)
  })

  it('Esc dismisses the tour and persists a dismissed status', async () => {
    mountOverlay()
    const onboardingStore = useOnboardingStore()
    onboardingStore.startTour()
    await settle()

    const layer = document.body.querySelector('.tour-layer')
    layer?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
    await settle()

    expect(onboardingStore.tourActive).toBe(false)
    expect(onboardingStore.tourStatus).toBe('dismissed')
  })

  it('reaching and closing the done card persists a completed status', async () => {
    mountOverlay()
    const onboardingStore = useOnboardingStore()
    onboardingStore.startTour()
    await settle()

    async function clickByText(text: string) {
      const buttons = Array.from(document.body.querySelectorAll('button'))
      const target = buttons.find(b => b.textContent === text)
      target?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await settle()
    }

    await clickByText(en.onboarding.tour.welcome.start)
    for (let i = 0; i < TARGET_IDS.length - 1; i++) {
      await clickByText(en.onboarding.tour.next)
    }
    await clickByText(en.onboarding.tour.finish)
    expect(document.body.textContent).toContain(en.onboarding.tour.done.titleLead)

    await clickByText(en.onboarding.tour.done.close)

    expect(onboardingStore.tourActive).toBe(false)
    expect(onboardingStore.tourStatus).toBe('completed')
  })
})

describe('ProductTourOverlay target observer', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('keeps one observer per spotlight target across re-measures', async () => {
    // A new ResizeObserver always fires an initial notification; recreating it
    // on every measure() re-entered measure() each frame (RO loop errors).
    const observed: Element[] = []
    vi.stubGlobal('ResizeObserver', class {
      observe(el: Element) { observed.push(el) }
      unobserve() {}
      disconnect() {}
    })
    const target = addTarget('new-note')
    TARGET_IDS.filter(id => id !== 'new-note').forEach(addTarget)
    mountOverlay()
    useOnboardingStore().startTour()
    await settle()
    const start = Array.from(document.body.querySelectorAll('button'))
      .find(b => b.textContent === en.onboarding.tour.welcome.start)
    start?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await settle()

    window.dispatchEvent(new Event('resize'))
    window.dispatchEvent(new Event('resize'))
    await settle()

    expect(observed.filter(el => el === target)).toHaveLength(1)
  })
})
