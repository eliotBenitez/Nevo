import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import EditorTableMenu from './EditorTableMenu.vue'
import en from '../../../locales/en.json'
import type { NevoTableContext } from '../../../types/editor-plugin'

function createTestContext(overrides?: Partial<NevoTableContext>): NevoTableContext {
  return {
    inTable: true,
    tablePos: 0,
    rows: 4,
    cols: 3,
    selectedRows: 2,
    selectedCols: 3,
    canMerge: true,
    canSplit: false,
    isMergedCell: false,
    activeCell: {
      pos: 10,
      align: 'center',
      background: 'oklch(0.95 0.04 90)',
      borderColor: null,
      textColor: null,
      padding: null,
      formula: null,
      isHeader: false,
    },
    ...overrides,
  }
}

function mountTableMenu(context: NevoTableContext | null = createTestContext(), visible = true) {
  return mount(EditorTableMenu, {
    props: {
      visible,
      context,
      menuStyle: { top: '100px', left: '200px' },
    },
    global: {
      plugins: [createI18n({ legacy: false, locale: 'en', messages: { en } })],
    },
  })
}

function getButtonByTitle(wrapper: ReturnType<typeof mountTableMenu>, title: string) {
  const btn = wrapper.findAll('button').find(b => b.attributes('title') === title)
  if (!btn) throw new Error(`Button with title "${title}" not found`)
  return btn
}

describe('EditorTableMenu', () => {
  it('does not render when visible is false or context is null', () => {
    const hidden = mountTableMenu(createTestContext(), false)
    expect(hidden.find('.table-menu').exists()).toBe(false)

    const noContext = mountTableMenu(null, true)
    expect(noContext.find('.table-menu').exists()).toBe(false)
  })

  it('renders table title and selection count', () => {
    const wrapper = mountTableMenu(createTestContext({ selectedRows: 2, selectedCols: 3 }))
    expect(wrapper.find('.table-menu__title').text()).toBe(en.editor.table.title)
    expect(wrapper.find('.table-menu__meta').text()).toBe('2×3 selected')
  })

  it('emits commands when row, column, and merge buttons are clicked', async () => {
    const wrapper = mountTableMenu()

    const addRowAbove = getButtonByTitle(wrapper, en.editor.table.rowAddAbove)
    await addRowAbove.trigger('click')
    expect(wrapper.emitted('command')?.[0]).toEqual(['core.table.row.add.before'])

    const addColLeft = getButtonByTitle(wrapper, en.editor.table.colAddLeft)
    await addColLeft.trigger('click')
    expect(wrapper.emitted('command')?.[1]).toEqual(['core.table.column.add.before'])

    const merge = getButtonByTitle(wrapper, en.editor.table.mergeCells)
    await merge.trigger('click')
    expect(wrapper.emitted('command')?.[2]).toEqual(['core.table.merge'])

    const deleteTable = getButtonByTitle(wrapper, en.editor.table.deleteTable)
    await deleteTable.trigger('click')
    expect(wrapper.emitted('command')?.[3]).toEqual(['core.table.delete'])
  })


  it('respects canMerge and canSplit disabled states', () => {
    const wrapper = mountTableMenu(createTestContext({ canMerge: false, canSplit: true }))

    const merge = getButtonByTitle(wrapper, en.editor.table.mergeCells)
    const split = getButtonByTitle(wrapper, en.editor.table.splitCell)

    expect(merge.attributes('disabled')).toBeDefined()
    expect(split.attributes('disabled')).toBeUndefined()
  })

  it('emits alignment and reflects active alignment', async () => {
    const wrapper = mountTableMenu(
      createTestContext({
        activeCell: {
          pos: 1,
          align: 'center',
          background: null,
          borderColor: null,
          textColor: null,
          padding: null,
          formula: null,
          isHeader: false,
        },
      }),
    )

    const center = getButtonByTitle(wrapper, en.editor.table.alignCenter)
    expect(center.classes()).toContain('is-active')

    const left = getButtonByTitle(wrapper, en.editor.table.alignLeft)
    expect(left.classes()).not.toContain('is-active')
    await left.trigger('click')
    expect(wrapper.emitted('cellAlignment')?.[0]).toEqual(['left'])

    const clearAlign = getButtonByTitle(wrapper, en.editor.table.clearAlignment)
    await clearAlign.trigger('click')
    expect(wrapper.emitted('cellAlignment')?.[1]).toEqual([null])
  })

  it('emits formula event and toggles attributes', async () => {
    const wrapper = mountTableMenu(
      createTestContext({
        activeCell: {
          pos: 1,
          align: null,
          background: 'oklch(0.95 0.04 90)',
          borderColor: 'oklch(0.58 0.08 250)',
          textColor: null,
          padding: null,
          formula: '=SUM(A1:A2)',
          isHeader: true,
        },
      }),
    )

    const formula = getButtonByTitle(wrapper, en.editor.table.formula)
    expect(formula.classes()).toContain('is-active')
    await formula.trigger('click')
    expect(wrapper.emitted('cellFormula')).toHaveLength(1)

    // Border accent is currently set, clicking should toggle off (emit null)
    const border = getButtonByTitle(wrapper, en.editor.table.borderAccent)
    expect(border.classes()).toContain('is-active')
    await border.trigger('click')
    expect(wrapper.emitted('cellAttr')?.[0]).toEqual(['borderColor', null])

    // Text accent is null, clicking should toggle on
    const text = getButtonByTitle(wrapper, en.editor.table.textAccent)
    expect(text.classes()).not.toContain('is-active')
    await text.trigger('click')
    expect(wrapper.emitted('cellAttr')?.[1]).toEqual(['textColor', 'oklch(0.34 0.08 250)'])
  })
})

