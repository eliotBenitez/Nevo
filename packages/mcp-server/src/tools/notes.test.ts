import { describe, expect, it } from 'vitest'

import { ALL_TOOLS, findTool, READ_TOOLS, runTool, WRITE_TOOLS } from './notes.js'

describe('read tool definitions', () => {
  it('exposes a unique, prefixed name per tool', () => {
    const names = ALL_TOOLS.map(tool => tool.name)
    expect(new Set(names).size).toBe(names.length)
    for (const name of names) expect(name.startsWith('nevo_')).toBe(true)
  })

  it('declares a closed object schema for every tool', () => {
    for (const tool of ALL_TOOLS) {
      expect(tool.inputSchema.type).toBe('object')
      // Open schemas would let an agent smuggle unexpected keys through to the
      // bridge, which validates params but should not have to.
      expect(tool.inputSchema.additionalProperties).toBe(false)
      expect(tool.description.length).toBeGreaterThan(0)
    }
  })

  it('marks the arguments that the bridge requires', () => {
    expect(findTool('nevo_read_note')?.inputSchema.required).toEqual(['noteId'])
    expect(findTool('nevo_search_notes')?.inputSchema.required).toEqual(['query'])
    expect(findTool('nevo_list_notes')?.inputSchema.required).toBeUndefined()
  })

  it('maps each tool onto a read-only bridge method', () => {
    const methods = READ_TOOLS.map(tool => tool.method)
    expect(methods).toEqual(['workspace.info', 'notes.list', 'notes.search', 'notes.read'])
  })

  it('drops arguments for the zero-argument tool', () => {
    const info = findTool('nevo_workspace_info')
    expect(info?.toParams({ unexpected: 1 })).toEqual({})
  })
})

describe('write tool definitions', () => {
  it('maps each write tool onto a mutating bridge method', () => {
    expect(WRITE_TOOLS.map(tool => tool.method)).toEqual([
      'notes.create',
      'notes.editorSnapshot',
      'notes.applyEdit',
      'notes.move',
      'notes.delete',
    ])
  })

  it('requires the revision and operations that make edits safe to retry', () => {
    const applyEdit = findTool('nevo_apply_edit')
    expect(applyEdit?.inputSchema.required).toEqual(['noteId', 'revision', 'operations'])
    const properties = applyEdit?.inputSchema.properties as Record<string, Record<string, unknown>>
    expect(properties.operations?.maxItems).toBe(64)
    // The agent has to learn the revision contract from the description alone.
    expect(applyEdit?.description).toMatch(/revision/i)
    expect(properties.operations?.description).toMatch(/appends a new text block/i)
  })

  it('exposes no tool that destroys data irreversibly', () => {
    for (const tool of ALL_TOOLS) {
      expect(tool.method).not.toContain('permanent')
      expect(tool.method).not.toContain('emptyTrash')
    }
    expect(findTool('nevo_delete_note')?.description).toMatch(/trash/i)
  })
})

describe('runTool', () => {
  it('rejects an unknown tool name', async () => {
    await expect(runTool('nevo_not_a_tool', {})).rejects.toThrow(/Unknown tool/)
  })
})
