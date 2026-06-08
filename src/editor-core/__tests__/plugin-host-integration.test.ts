import { describe, expect, it, vi } from 'vitest'
import { TextSelection } from 'prosemirror-state'
import { EditorPluginHost } from '../plugin-host'
import { createNevoEditorState } from '../state'
import { nevoBaseSchema } from '../schema'
import type { BlockNode } from '../../types/note'

const emptyContent: BlockNode = {
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text: 'plugin test' }] }],
}

describe('plugin host integration', () => {
  it('keeps core command priority over plugin command id collisions', () => {
    const host = new EditorPluginHost({
      workspacePath: null,
      manifests: [],
      nevoVersion: '1.0.0',
    })

    const pluginBold = vi.fn(() => false)
    host.registries.commands.set('core.bold', pluginBold)

    const setup = createNevoEditorState({
      schema: nevoBaseSchema,
      content: emptyContent,
      pluginHost: host,
    })

    let state = setup.state.apply(setup.state.tr.setSelection(TextSelection.create(setup.state.doc, 2, 8)))
    const boldCommand = setup.commands.get('core.bold')

    const applied = boldCommand?.(state, (transaction) => {
      state = state.apply(transaction)
    })

    expect(applied).toBe(true)
    expect(pluginBold).not.toHaveBeenCalled()
    const strong = state.schema.marks.strong
    expect(strong ? state.doc.rangeHasMark(2, 8, strong) : false).toBe(true)
  })

  it('orders keymaps by priority desc and plugin id asc', () => {
    const host = new EditorPluginHost({
      workspacePath: null,
      manifests: [],
      nevoVersion: '1.0.0',
    })

    host.registries.keymaps.push({ priority: 10, bindings: {}, pluginId: 'zeta' })
    host.registries.keymaps.push({ priority: 20, bindings: {}, pluginId: 'beta' })
    host.registries.keymaps.push({ priority: 20, bindings: {}, pluginId: 'alpha' })

    const ordered = host.getOrderedKeymaps()
    expect(ordered.map((entry) => entry.pluginId)).toEqual(['alpha', 'beta', 'zeta'])
  })

  it('merges core and plugin slash items', () => {
    const host = new EditorPluginHost({
      workspacePath: null,
      manifests: [],
      nevoVersion: '1.0.0',
    })

    host.registries.slashItems.set('plugin.custom', {
      id: 'plugin.custom',
      title: 'Plugin Action',
      run: () => {},
    })

    const setup = createNevoEditorState({
      schema: nevoBaseSchema,
      content: emptyContent,
      pluginHost: host,
    })

    const ids = setup.slashItems.map((item) => item.id)
    expect(ids).toContain('h1')
    expect(ids).toContain('plugin.custom')
  })
})
