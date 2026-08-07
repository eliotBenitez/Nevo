import { afterEach, describe, expect, it } from 'vitest'
import { defineComponent, nextTick } from 'vue'
import { mount, type VueWrapper } from '@vue/test-utils'
import {
  calculateMobileKeyboardInset,
  useMobileKeyboardInset,
} from './useMobileKeyboardInset'

class TestVisualViewport extends EventTarget {
  height = 800
  offsetTop = 0
  scale = 1
}

const wrappers: VueWrapper[] = []
const originalInnerHeight = window.innerHeight
const originalVisualViewport = window.visualViewport

afterEach(() => {
  while (wrappers.length > 0) {
    wrappers.pop()?.unmount()
  }
  Object.defineProperty(window, 'innerHeight', {
    configurable: true,
    value: originalInnerHeight,
  })
  Object.defineProperty(window, 'visualViewport', {
    configurable: true,
    value: originalVisualViewport,
  })
  document.documentElement.style.removeProperty('--mobile-keyboard-inset')
})

describe('useMobileKeyboardInset', () => {
  it('ignores small browser chrome changes and viewport zoom', () => {
    expect(calculateMobileKeyboardInset(800, 760, 0, 1)).toBe(0)
    expect(calculateMobileKeyboardInset(800, 500, 0, 2)).toBe(0)
  })

  it('publishes the keyboard overlap from VisualViewport and clears it on unmount', async () => {
    const visualViewport = new TestVisualViewport()
    Object.defineProperty(window, 'innerHeight', {
      configurable: true,
      value: 800,
    })
    Object.defineProperty(window, 'visualViewport', {
      configurable: true,
      value: visualViewport as unknown as VisualViewport,
    })

    const Harness = defineComponent({
      setup() {
        return useMobileKeyboardInset()
      },
      template: '<div />',
    })
    const wrapper = mount(Harness)
    wrappers.push(wrapper)

    expect(document.documentElement.style.getPropertyValue('--mobile-keyboard-inset')).toBe('0px')

    visualViewport.height = 500
    visualViewport.dispatchEvent(new Event('resize'))
    await nextTick()

    expect(document.documentElement.style.getPropertyValue('--mobile-keyboard-inset')).toBe('300px')

    wrapper.unmount()
    wrappers.pop()
    expect(document.documentElement.style.getPropertyValue('--mobile-keyboard-inset')).toBe('')
  })
})
