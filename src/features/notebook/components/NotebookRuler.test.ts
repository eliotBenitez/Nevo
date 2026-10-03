import { mount } from '@vue/test-utils'
import { defineComponent, nextTick, ref } from 'vue'
import { createI18n } from 'vue-i18n'
import { describe, expect, it, vi } from 'vitest'
import en from '../../../locales/en.json'
import NotebookRuler from './NotebookRuler.vue'

function open(zoom = 1) {
  const wrapper = mount(defineComponent({
    components: { NotebookRuler },
    setup: () => ({ pose: ref({ x: 300, y: 240, angle: 0 }), active: ref(false), disabled: ref(false), zoom }),
    template: '<svg><NotebookRuler :pose="pose" :zoom="zoom" :width="595.28" :height="841.89" :disabled="disabled" @update="pose = $event" @active="active = $event" /></svg>',
  }), { attachTo: document.body, global: { plugins: [createI18n({ legacy: false, locale: 'en', messages: { en } })] } })
  vi.spyOn(wrapper.element, 'getBoundingClientRect').mockReturnValue({ left: 10, top: 20 } as DOMRect)
  return wrapper
}

async function pointer(element: Element, type: string, props: Record<string, unknown>) {
  const event = new Event(type, { bubbles: true, cancelable: true })
  for (const [key, value] of Object.entries(props)) Object.defineProperty(event, key, { value })
  element.dispatchEvent(event)
  await nextTick()
}

describe('NotebookRuler', () => {
  it('uses the SVG screen transform when borders change the effective page scale', async () => {
    const wrapper = open(2)
    Object.assign(wrapper.element, { getScreenCTM: () => ({ inverse: () => ({ a: 1 / 1.95, b: 0, c: 0, d: 1 / 1.95, e: -11 / 1.95, f: -21 / 1.95 }) }) })
    const handle = wrapper.get('.notebook-ruler__rotate')
    Object.assign(handle.element, { focus: vi.fn(), setPointerCapture: vi.fn(), releasePointerCapture: vi.fn() })
    await pointer(handle.element, 'pointerdown', { pointerId: 2, button: 0, clientX: 11 + 312 * 1.95, clientY: 21 + 248 * 1.95 })
    await pointer(handle.element, 'pointerup', { pointerId: 2, clientX: 11 + 292 * 1.95, clientY: 21 + 252 * 1.95 })
    expect(wrapper.vm.pose.angle).toBeCloseTo(90, 10)
    wrapper.unmount()
  })
  it('supports keyboard translation, rotation, angle reset, and disabled ink contact', async () => {
    const wrapper = open()
    await wrapper.get('.notebook-ruler__move').trigger('keydown', { key: 'ArrowLeft', shiftKey: true })
    expect(wrapper.vm.pose.x).toBe(290)
    await wrapper.get('.notebook-ruler__rotate').trigger('keydown', { key: 'ArrowUp', shiftKey: true })
    expect(wrapper.vm.pose.angle).toBe(15)
    await wrapper.get('.notebook-ruler__rotate').trigger('keydown', { key: 'Home' })
    expect(wrapper.vm.pose.angle).toBe(0)
    wrapper.vm.disabled = true
    await wrapper.vm.$nextTick()
    await wrapper.get('.notebook-ruler__move').trigger('keydown', { key: 'ArrowRight' })
    expect(wrapper.vm.pose.x).toBe(290)
    wrapper.unmount()
  })

  it.each([.35, 1, 3.5])('moves in page coordinates at zoom %s and releases touch capture on cancellation', async zoom => {
    const wrapper = open(zoom)
    const handle = wrapper.get('.notebook-ruler__move')
    const element = handle.element as SVGElement
    Object.assign(element, { focus: vi.fn(), setPointerCapture: vi.fn(), releasePointerCapture: vi.fn() })
    await pointer(handle.element, 'pointerdown', { pointerId: 5, pointerType: 'touch', button: 0, clientX: 10 + 300 * zoom, clientY: 20 + 240 * zoom })
    expect(wrapper.vm.active).toBe(true)
    await pointer(handle.element, 'pointermove', { pointerId: 5, clientX: 10 + 330 * zoom, clientY: 20 + 270 * zoom })
    expect(wrapper.vm.pose.x).toBeCloseTo(330)
    expect(wrapper.vm.pose.y).toBeCloseTo(270)
    await pointer(handle.element, 'pointercancel', { pointerId: 5 })
    expect(wrapper.vm.active).toBe(false)
    expect(element.releasePointerCapture).toHaveBeenCalledWith(5)
    expect(wrapper.get('.notebook-ruler__move').attributes('transform')).toContain(`scale(${1 / zoom})`)
    wrapper.unmount()
  })

  it('rotates from the pointer angle and keeps the handles inside the page', async () => {
    const wrapper = open()
    const handle = wrapper.get('.notebook-ruler__rotate')
    Object.assign(handle.element, { focus: vi.fn(), setPointerCapture: vi.fn(), releasePointerCapture: vi.fn() })
    await pointer(handle.element, 'pointerdown', { pointerId: 2, pointerType: 'pen', button: 0, clientX: 334, clientY: 260 })
    await pointer(handle.element, 'pointerup', { pointerId: 2, clientX: 310, clientY: 284, shiftKey: true })
    expect(wrapper.vm.pose.angle).toBe(90)
    expect(wrapper.vm.active).toBe(false)
    for (let i = 0; i < 100; i++) await wrapper.get('.notebook-ruler__move').trigger('keydown', { key: 'ArrowUp', shiftKey: true })
    expect(wrapper.vm.pose.y).toBe(54)
    wrapper.unmount()
  })
})
