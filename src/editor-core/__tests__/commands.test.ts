import { describe, expect, it } from 'vitest'
import { EditorState, NodeSelection, TextSelection } from 'prosemirror-state'
import type { Command } from 'prosemirror-state'
import { CellSelection } from 'prosemirror-tables'
import { nevoBaseSchema } from '../schema'
import { createCoreCommands } from '../commands'

function runCommand(state: EditorState, command: Command): { applied: boolean; state: EditorState } {
  let nextState = state
  const applied = command(state, (transaction) => {
    nextState = state.apply(transaction)
  })

  return { applied, state: nextState }
}

describe('core commands', () => {
  it('creates heading levels 4 through 6', () => {
    const schema = nevoBaseSchema
    const core = createCoreCommands(schema)

    for (const level of [4, 5, 6]) {
      let state = EditorState.create({
        schema,
        doc: schema.node('doc', null, [schema.node('paragraph', null, [schema.text(`heading ${level}`)])]),
      })
      state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 2)))

      const result = runCommand(state, core.commands.get(`core.heading.${level}`) as Command)

      expect(result.applied).toBe(true)
      expect(result.state.doc.firstChild?.type.name).toBe('heading')
      expect(result.state.doc.firstChild?.attrs.level).toBe(level)
    }
  })

  it('applies, updates and removes link mark', () => {
    const schema = nevoBaseSchema
    const core = createCoreCommands(schema)

    let state = EditorState.create({
      schema,
      doc: schema.node('doc', null, [schema.node('paragraph', null, [schema.text('hello world')])]),
    })

    state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 2, 7)))

    const setResult = runCommand(state, core.setLink('https://example.com'))
    expect(setResult.applied).toBe(true)
    state = setResult.state

    const linkMark = state.schema.marks.link
    expect(linkMark ? state.doc.rangeHasMark(2, 7, linkMark) : false).toBe(true)

    state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 2, 7)))
    const updateResult = runCommand(state, core.updateLink('https://nevo.app'))
    expect(updateResult.applied).toBe(true)
    state = updateResult.state

    const updatedRange = core.getLinkRange(state)
    expect(updatedRange?.href).toBe('https://nevo.app')

    const unsetResult = runCommand(state, core.unsetLink)
    expect(unsetResult.applied).toBe(true)
    state = unsetResult.state

    expect(linkMark ? state.doc.rangeHasMark(2, 7, linkMark) : false).toBe(false)
  })

  it('creates rich block nodes through commands', () => {
    const schema = nevoBaseSchema
    const core = createCoreCommands(schema)

    let state = EditorState.create({
      schema,
      doc: schema.node('doc', null, [schema.node('paragraph')]),
    })
    state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 1)))

    const calloutResult = runCommand(state, core.commands.get('core.callout') as Command)
    expect(calloutResult.applied).toBe(true)
    expect(calloutResult.state.doc.firstChild?.type.name).toBe('callout')
    expect(calloutResult.state.doc.firstChild?.firstChild?.type.name).toBe('paragraph')

    state = EditorState.create({
      schema,
      doc: schema.node('doc', null, [schema.node('paragraph', null, [schema.text('task')])]),
    })
    state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 2)))

    const checklistResult = runCommand(state, core.commands.get('core.checklistItem') as Command)
    expect(checklistResult.applied).toBe(true)
    expect(checklistResult.state.doc.firstChild?.type.name).toBe('checklist_item')

    state = EditorState.create({
      schema,
      doc: schema.node('doc', null, [schema.node('paragraph')]),
    })
    state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 1)))

    const dividerResult = runCommand(state, core.commands.get('core.divider') as Command)
    expect(dividerResult.applied).toBe(true)
    expect(dividerResult.state.doc.firstChild?.type.name).toBe('divider')
  })

  it('toggles kbd mark', () => {
    const schema = nevoBaseSchema
    const core = createCoreCommands(schema)

    let state = EditorState.create({
      schema,
      doc: schema.node('doc', null, [schema.node('paragraph', null, [schema.text('ctrl+c')])]),
    })

    state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 1, 7)))

    const kbdCommand = core.commands.get('core.kbd')
    expect(kbdCommand).toBeDefined()

    const result = runCommand(state, kbdCommand!)
    expect(result.applied).toBe(true)
    state = result.state

    const kbdMark = state.schema.marks.kbd
    expect(kbdMark).toBeDefined()
    expect(state.doc.rangeHasMark(1, 7, kbdMark!)).toBe(true)

    // Toggle off
    const resultOff = runCommand(state, kbdCommand!)
    expect(resultOff.applied).toBe(true)
    state = resultOff.state
    expect(state.doc.rangeHasMark(1, 7, kbdMark!)).toBe(false)
  })

  it('turns a paragraph into a bullet list without creating an extra item', () => {
    const schema = nevoBaseSchema
    const core = createCoreCommands(schema)

    let state = EditorState.create({
      schema,
      doc: schema.node('doc', null, [schema.node('paragraph', null, [schema.text('item')])]),
    })
    state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 2)))

    const result = runCommand(state, core.commands.get('core.bulletList') as Command)

    expect(result.applied).toBe(true)
    const list = result.state.doc.firstChild
    expect(list?.type.name).toBe('bullet_list')
    expect(list?.childCount).toBe(1)
    expect(list?.firstChild?.type.name).toBe('list_item')
    expect(list?.firstChild?.firstChild?.type.name).toBe('paragraph')
    expect(list?.firstChild?.firstChild?.textContent).toBe('item')
  })

  it('turns an empty paragraph into a bullet list item with an empty paragraph', () => {
    const schema = nevoBaseSchema
    const core = createCoreCommands(schema)

    let state = EditorState.create({
      schema,
      doc: schema.node('doc', null, [schema.node('paragraph')]),
    })
    state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 1)))

    const result = runCommand(state, core.commands.get('core.bulletList') as Command)

    expect(result.applied).toBe(true)
    expect(result.state.doc.toJSON()).toEqual({
      type: 'doc',
      content: [
        {
          type: 'bullet_list',
          content: [
            { type: 'list_item', content: [{ type: 'paragraph' }] },
          ],
        },
      ],
    })
  })

  it('turns a paragraph into an ordered list starting at one', () => {
    const schema = nevoBaseSchema
    const core = createCoreCommands(schema)

    let state = EditorState.create({
      schema,
      doc: schema.node('doc', null, [schema.node('paragraph', null, [schema.text('first')])]),
    })
    state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 2)))

    const result = runCommand(state, core.commands.get('core.orderedList') as Command)

    expect(result.applied).toBe(true)
    const list = result.state.doc.firstChild
    expect(list?.type.name).toBe('ordered_list')
    expect(list?.attrs.order).toBe(1)
    expect(list?.childCount).toBe(1)
    expect(list?.firstChild?.type.name).toBe('list_item')
    expect(list?.firstChild?.firstChild?.type.name).toBe('paragraph')
    expect(list?.firstChild?.firstChild?.textContent).toBe('first')
  })

  it('turns an empty paragraph into an ordered list item with an empty paragraph', () => {
    const schema = nevoBaseSchema
    const core = createCoreCommands(schema)

    let state = EditorState.create({
      schema,
      doc: schema.node('doc', null, [schema.node('paragraph')]),
    })
    state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 1)))

    const result = runCommand(state, core.commands.get('core.orderedList') as Command)

    expect(result.applied).toBe(true)
    expect(result.state.doc.toJSON()).toEqual({
      type: 'doc',
      content: [
        {
          type: 'ordered_list',
          attrs: { order: 1 },
          content: [
            { type: 'list_item', content: [{ type: 'paragraph' }] },
          ],
        },
      ],
    })
  })

  it('preserves inline content and updates callout attrs', () => {
    const schema = nevoBaseSchema
    const core = createCoreCommands(schema)
    const strong = schema.marks.strong

    let state = EditorState.create({
      schema,
      doc: schema.node('doc', null, [
        schema.node('paragraph', null, [
          strong ? schema.text('Important', [strong.create()]) : schema.text('Important'),
        ]),
      ]),
    })

    state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 3)))

    let result = runCommand(state, core.commands.get('core.callout') as Command)
    expect(result.applied).toBe(true)
    state = result.state

    const callout = state.doc.firstChild
    const paragraph = callout?.firstChild
    expect(callout?.type.name).toBe('callout')
    expect(paragraph?.type.name).toBe('paragraph')
    expect(paragraph?.textContent).toBe('Important')
    expect(paragraph?.firstChild?.marks.some((mark) => mark.type.name === 'strong')).toBe(true)

    state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 3)))
    result = runCommand(state, core.setCalloutIcon('🚀'))
    expect(result.applied).toBe(true)
    state = result.state
    expect(state.doc.firstChild?.attrs.icon).toBe('🚀')

    result = runCommand(state, core.setCalloutVariant('warning'))
    expect(result.applied).toBe(true)
    expect(result.state.doc.firstChild?.attrs.variant).toBe('warning')
  })

  it('supports math insert/update/remove and code language lifecycle', () => {
    const schema = nevoBaseSchema
    const core = createCoreCommands(schema)

    let state = EditorState.create({
      schema,
      doc: schema.node('doc', null, [schema.node('paragraph', null, [schema.text('math')]), schema.node('paragraph', null, [schema.text('code')])]),
    })

    state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 3)))
    let result = runCommand(state, core.insertMathInline('x^2'))
    expect(result.applied).toBe(true)
    state = result.state

    let mathPos = -1
    state.doc.descendants((node, pos) => {
      if (mathPos >= 0) return false
      if (node.type.name === 'math_inline') {
        mathPos = pos
        return false
      }
      return true
    })
    expect(mathPos).toBeGreaterThan(0)

    state = state.apply(state.tr.setSelection(NodeSelection.create(state.doc, mathPos)))
    result = runCommand(state, core.updateMathAtSelection('\\\\frac{1}{2}'))
    expect(result.applied).toBe(true)
    state = result.state
    expect(state.doc.nodeAt(mathPos)?.attrs.latex).toBe('\\\\frac{1}{2}')

    state = state.apply(state.tr.setSelection(NodeSelection.create(state.doc, mathPos)))
    result = runCommand(state, core.removeMathAtSelection)
    expect(result.applied).toBe(true)
    state = result.state
    let hasMathInline = false
    state.doc.descendants((node) => {
      if (node.type.name === 'math_inline') {
        hasMathInline = true
        return false
      }
      return true
    })
    expect(hasMathInline).toBe(false)

    const secondParagraph = state.doc.child(1)
    const paragraphPos = state.doc.child(0).nodeSize + 1
    const codeFrom = paragraphPos + 1
    state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, codeFrom, codeFrom + secondParagraph.textContent.length)))
    result = runCommand(state, core.commands.get('core.codeBlock') as Command)
    expect(result.applied).toBe(true)
    state = result.state

    result = runCommand(state, core.setCodeLanguage('typescript'))
    expect(result.applied).toBe(true)
    state = result.state
    expect(state.doc.child(1).attrs.language).toBe('typescript')

    result = runCommand(state, core.clearCodeLanguage)
    expect(result.applied).toBe(true)
    state = result.state
    expect(state.doc.child(1).attrs.language).toBeNull()
  })

  it('selects inserted math nodes for immediate editing', () => {
    const schema = nevoBaseSchema
    const core = createCoreCommands(schema)

    let state = EditorState.create({
      schema,
      doc: schema.node('doc', null, [schema.node('paragraph')]),
    })
    state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 1)))

    let result = runCommand(state, core.insertMathBlock('E = mc^2'))
    expect(result.applied).toBe(true)
    expect(result.state.selection).toBeInstanceOf(NodeSelection)
    expect((result.state.selection as NodeSelection).node.type.name).toBe('math_block')

    state = EditorState.create({
      schema,
      doc: schema.node('doc', null, [schema.node('paragraph', null, [schema.text('a')])]),
    })
    state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 2)))

    result = runCommand(state, core.insertMathInline('x'))
    expect(result.applied).toBe(true)
    expect(result.state.selection).toBeInstanceOf(NodeSelection)
    expect((result.state.selection as NodeSelection).node.type.name).toBe('math_inline')
  })

  it('selects inserted embed blocks for immediate URL editing', () => {
    const schema = nevoBaseSchema
    const core = createCoreCommands(schema)

    let state = EditorState.create({
      schema,
      doc: schema.node('doc', null, [schema.node('paragraph')]),
    })
    state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 1)))

    let result = runCommand(state, core.commands.get('core.embed.insert') as Command)
    expect(result.applied).toBe(true)
    expect(result.state.doc.firstChild?.type.name).toBe('embed_block')
    expect(result.state.selection).toBeInstanceOf(NodeSelection)
    expect((result.state.selection as NodeSelection).from).toBe(0)
    expect((result.state.selection as NodeSelection).node.type.name).toBe('embed_block')

    state = result.state
    result = runCommand(state, core.setEmbedAttrsAtSelection({
      url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      embedType: 'youtube',
      embedHtml: '<iframe></iframe>',
      title: 'Video',
      thumbnailUrl: '',
    }))

    expect(result.applied).toBe(true)
    expect(result.state.doc.firstChild?.attrs.url).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ')
    expect(result.state.doc.firstChild?.attrs.embedType).toBe('youtube')
  })

  it('supports table insertion, merge/split, and cell attrs', () => {
    const schema = nevoBaseSchema
    const core = createCoreCommands(schema)

    let state = EditorState.create({
      schema,
      doc: schema.node('doc', null, [schema.node('paragraph')]),
    })
    state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 1)))

    let result = runCommand(state, core.insertTable({ rows: 2, cols: 2 }))
    expect(result.applied).toBe(true)
    state = result.state
    expect(state.doc.firstChild?.type.name).toBe('table')

    const cellPositions: number[] = []
    state.doc.descendants((node, pos) => {
      if (node.type.name === 'table_cell' || node.type.name === 'table_header') {
        cellPositions.push(pos)
      }
      return true
    })
    expect(cellPositions.length).toBeGreaterThanOrEqual(2)

    state = state.apply(state.tr.setSelection(CellSelection.create(state.doc, cellPositions[0], cellPositions[1])))
    result = runCommand(state, core.commands.get('core.table.merge') as Command)
    expect(result.applied).toBe(true)
    state = result.state

    let mergedCellPos = -1
    state.doc.descendants((node, pos) => {
      if (node.type.name !== 'table_cell' && node.type.name !== 'table_header') return true
      if (node.attrs.colspan > 1 || node.attrs.rowspan > 1) {
        mergedCellPos = pos
        return false
      }
      return true
    })
    expect(mergedCellPos).toBeGreaterThan(0)

    state = state.apply(state.tr.setSelection(CellSelection.create(state.doc, mergedCellPos)))
    result = runCommand(state, core.commands.get('core.table.split') as Command)
    expect(result.applied).toBe(true)
    state = result.state

    state = state.apply(state.tr.setSelection(CellSelection.create(state.doc, cellPositions[0])))
    result = runCommand(state, core.setTableCellAlignment('center'))
    expect(result.applied).toBe(true)
    state = result.state

    let alignedCell: string | null = null
    state.doc.descendants((node) => {
      if (node.type.name !== 'table_cell' && node.type.name !== 'table_header') return true
      if (node.attrs.align === 'center') {
        alignedCell = node.attrs.align
        return false
      }
      return true
    })
    expect(alignedCell).toBe('center')
  })
})
