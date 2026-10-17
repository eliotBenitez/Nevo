import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import CanvasToolbar from '../components/CanvasToolbar.vue'

describe('CanvasToolbar', () => {
  it('keeps toolbar pointerdown from reaching the viewport so drawing tools do not capture the click', async () => {
    const viewportPointerDown = vi.fn()
    const host = document.createElement('div')
    host.addEventListener('pointerdown', viewportPointerDown)
    document.body.appendChild(host)
    const wrapper = mount(CanvasToolbar, {
      attachTo: host,
      props: { zoom: 1, activeTool: 'pen', labels: { highlighter: 'Highlighter' }, canPresent: false },
    })

    const button = wrapper.get('[aria-label="Highlighter"]')
    button.element.dispatchEvent(new MouseEvent('pointerdown', { button: 0, bubbles: true }))
    await button.trigger('click')

    expect(viewportPointerDown).not.toHaveBeenCalled()
    expect(wrapper.emitted('tool')).toEqual([['highlighter']])
    wrapper.unmount()
    host.remove()
  })
})
