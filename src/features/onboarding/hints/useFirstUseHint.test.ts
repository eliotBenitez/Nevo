import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { defineComponent, h } from 'vue'
import { useFirstUseHint } from './useFirstUseHint'
import { useOnboardingStore } from '../../../stores/onboarding'
import type { FirstUseHintId } from '../../../types/workspace'

const TestComponent = defineComponent({
  props: { id: { type: String, required: true } },
  setup(props) {
    useFirstUseHint(props.id as FirstUseHintId)
    return () => h('div')
  },
})

function addTarget(id: string): HTMLElement {
  const el = document.createElement('button')
  el.setAttribute('data-hint', id)
  el.getBoundingClientRect = () => ({
    x: 0, y: 0, width: 40, height: 20, top: 0, left: 0, right: 40, bottom: 20,
    toJSON() { return {} },
  }) as DOMRect
  document.body.appendChild(el)
  return el
}

let wrapper: VueWrapper | null = null

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  document.body.innerHTML = ''
  vi.useRealTimers()
})

describe('useFirstUseHint', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    setActivePinia(createPinia())
  })

  it('requests the hint after the settle delay when its target is visible', async () => {
    addTarget('editorCanvas')
    wrapper = mount(TestComponent, { props: { id: 'editorCanvas' } })
    const store = useOnboardingStore()
    expect(store.activeHint).toBeNull()

    await vi.advanceTimersByTimeAsync(600)

    expect(store.activeHint).toBe('editorCanvas')
  })

  it('does not request the hint when its target is absent', async () => {
    wrapper = mount(TestComponent, { props: { id: 'editorCanvas' } })
    const store = useOnboardingStore()

    await vi.advanceTimersByTimeAsync(600)

    expect(store.activeHint).toBeNull()
  })

  it('does not request the hint while `enabled` is false', async () => {
    addTarget('editorCanvas')
    const Wrapped = defineComponent({
      setup() {
        useFirstUseHint('editorCanvas', { enabled: { value: false } as never })
        return () => h('div')
      },
    })
    wrapper = mount(Wrapped)
    const store = useOnboardingStore()

    await vi.advanceTimersByTimeAsync(600)

    expect(store.activeHint).toBeNull()
  })

  it('releases (marks seen) the hint when the target is clicked', async () => {
    const target = addTarget('editorCanvas')
    wrapper = mount(TestComponent, { props: { id: 'editorCanvas' } })
    const store = useOnboardingStore()
    await vi.advanceTimersByTimeAsync(600)
    expect(store.activeHint).toBe('editorCanvas')

    target.dispatchEvent(new MouseEvent('click', { bubbles: true }))

    expect(store.activeHint).toBeNull()
    expect(store.requestHint('editorCanvas')).toBe(false) // now marked seen
  })

  it('releases the hint on unmount if it was shown', async () => {
    addTarget('editorCanvas')
    wrapper = mount(TestComponent, { props: { id: 'editorCanvas' } })
    const store = useOnboardingStore()
    await vi.advanceTimersByTimeAsync(600)
    expect(store.activeHint).toBe('editorCanvas')

    wrapper.unmount()
    wrapper = null

    expect(store.activeHint).toBeNull()
  })

  it('clears the settle timer on unmount before it fires, without activating the hint', async () => {
    addTarget('editorCanvas')
    wrapper = mount(TestComponent, { props: { id: 'editorCanvas' } })
    wrapper.unmount()
    wrapper = null
    const store = useOnboardingStore()

    await vi.advanceTimersByTimeAsync(600)

    expect(store.activeHint).toBeNull()
  })

  it('does not throw when there is no active Pinia', async () => {
    setActivePinia(undefined as unknown as ReturnType<typeof createPinia>)
    addTarget('editorCanvas')

    expect(() => {
      wrapper = mount(TestComponent, { props: { id: 'editorCanvas' } })
    }).not.toThrow()

    await expect(vi.advanceTimersByTimeAsync(600)).resolves.not.toThrow()

    expect(() => wrapper?.unmount()).not.toThrow()
    wrapper = null
  })
})
