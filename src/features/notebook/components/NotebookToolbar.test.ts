import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { describe, expect, it } from 'vitest'
import en from '../../../locales/en.json'
import NotebookToolbar from './NotebookToolbar.vue'
import type { NotebookInputTool } from '../composables/useNotebookInput'

function mountToolbar(tool: NotebookInputTool = 'pen') {
  return mount(NotebookToolbar, {
    props: {
      tool, pagesOpen: false, color: '#000000', strokeWidth: 1.5, markerWidth: 12,
      eraserDiameter: 12, paper: 'ruled', zoom: 1, canUndo: false, canRedo: false,
      exporting: false, saveStatus: 'saved', error: null, lineDash: 'solid',
    },
    global: { plugins: [createI18n({ legacy: false, locale: 'en', messages: { en } })] },
  })
}

describe('NotebookToolbar', () => {
  it('emits insertImage from the image button and disables it while importing', async () => {
    const wrapper = mountToolbar()
    const button = wrapper.get('button[aria-label="Insert image"]')
    await button.trigger('click')
    expect(wrapper.emitted('insertImage')).toHaveLength(1)
    await wrapper.setProps({ importing: true })
    expect(button.attributes('disabled')).toBeDefined()
    wrapper.unmount()
  })

  it('renders the palette trigger and forwards quick swatch picks and preset events', async () => {
    const wrapper = mountToolbar()
    expect(wrapper.find('input[type="color"]').exists()).toBe(false)
    await wrapper.setProps({ quickColors: ['#dc2626'], recents: ['#dc2626'], presets: ['#abcdef'] })
    await wrapper.get('.notebook-color-control__quick-swatch').trigger('click')
    expect(wrapper.emitted('update:color')).toEqual([['#dc2626']])
    wrapper.unmount()
  })

  it('selects the laser pointer with an accessible toolbar button', async () => {
    const wrapper = mountToolbar()
    const button = wrapper.get('button[aria-label="Laser pointer"]')
    await button.trigger('click')
    expect(wrapper.emitted('update:tool')?.at(-1)).toEqual(['laser'])
    await wrapper.setProps({ tool: 'laser' })
    expect(button.attributes('aria-pressed')).toBe('true')
    wrapper.unmount()
  })
  it('toggles the ruler independently of the drawing tool', async () => {
    const wrapper = mountToolbar('marker')
    const button = wrapper.get('button[aria-label="Ruler"]')
    expect(button.attributes('aria-pressed')).toBe('false')
    await button.trigger('click')
    expect(wrapper.emitted('toggleRuler')).toHaveLength(1)
    expect(wrapper.emitted('update:tool')).toBeUndefined()
    await wrapper.setProps({ rulerOpen: true })
    expect(button.attributes('aria-pressed')).toBe('true')
    wrapper.unmount()
  })
  it('exports without a paper checkbox', async () => {
    const wrapper = mountToolbar()
    expect(wrapper.find('input[type="checkbox"]').exists()).toBe(false)
    await wrapper.get('button[aria-label="Export PDF"]').trigger('click')
    expect(wrapper.emitted('export')).toHaveLength(1)
  })

  it.each([
    ['pen', 'update:strokeWidth', '2.75', 2.75, '0.25', '8'],
    ['laser', 'update:strokeWidth', '2.75', 2.75, '0.25', '8'],
    ['marker', 'update:markerWidth', '18', 18, '2', '24'],
    ['eraser', 'update:eraserDiameter', '30', 30, '2', '40'],
  ] as const)('edits %s width using a named numeric field', async (tool, event, value, expected, min, max) => {
    const wrapper = mountToolbar(tool)
    expect(wrapper.find('input[type="range"]').exists()).toBe(false)
    const input = wrapper.get('input[type="number"]')
    expect(input.attributes('aria-label')).toBe(en.notebook.tools.width)
    expect(input.attributes('min')).toBe(min)
    expect(input.attributes('max')).toBe(max)
    await input.setValue(value)
    expect(wrapper.emitted(event)?.at(-1)).toEqual([expected])
    wrapper.unmount()
  })

  it('shows the line dash control only for the line tool and reports the chosen style', async () => {
    const pen = mountToolbar('pen')
    expect(pen.find('[aria-label="Line style"]').exists()).toBe(false)
    pen.unmount()

    const line = mountToolbar('line')
    expect(line.find('[aria-label="Line style"]').exists()).toBe(true)
    await line.get('button[aria-label="Dashed"]').trigger('click')
    expect(line.emitted('update:lineDash')?.at(-1)).toEqual(['dashed'])
    line.unmount()
  })

  it('offers shapes in one popup, chooses a shape, and closes the popup', async () => {
    const wrapper = mountToolbar()
    expect(wrapper.findAll('.notebook-toolbar__tools > .nv-btn')).toHaveLength(11)
    for (const label of ['Rectangle', 'Ellipse', 'Circle', 'Triangle']) {
      expect(wrapper.find(`button[aria-label="${label}"]`).exists()).toBe(false)
    }
    const trigger = wrapper.get('button[aria-label="Shapes"]')
    expect(trigger.attributes('aria-expanded')).toBe('false')
    await trigger.trigger('click')
    expect(trigger.attributes('aria-expanded')).toBe('true')
    const triangle = document.querySelector<HTMLButtonElement>('[role="menuitemradio"][aria-label="Triangle"]')!
    expect(triangle).not.toBeNull()
    expect(wrapper.find('[aria-label="Line style"]').exists()).toBe(false)
    triangle.click()
    await wrapper.vm.$nextTick()
    expect(wrapper.emitted('update:tool')?.at(-1)).toEqual(['triangle'])
    expect(document.querySelector('[role="menuitemradio"]')).toBeNull()
    expect(trigger.attributes('aria-expanded')).toBe('false')
    await wrapper.setProps({ tool: 'triangle' })
    expect(trigger.attributes('aria-pressed')).toBe('true')
    await trigger.trigger('click')
    expect(document.querySelector('[role="menuitemradio"][aria-label="Triangle"]')?.getAttribute('aria-checked')).toBe('true')
    document.querySelector('[role="menu"]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await wrapper.vm.$nextTick()
    expect(trigger.attributes('aria-expanded')).toBe('false')
    wrapper.unmount()
  })


})
