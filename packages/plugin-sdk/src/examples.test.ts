import { describe, expect, it } from 'vitest'
import quickDate from '../examples/nevo.quick-date/index'
import callout from '../examples/nevo.callout/index'
import { createTestPluginHost } from './test-host'
import type { PluginEditorSnapshot } from './protocol'

function editor(now: string, locale: string, timeZone: string): PluginEditorSnapshot {
  return {
    revision: 7,
    selection: { from: 1, to: 1, empty: true, anchor: 1, head: 1 },
    schema: { nodes: ['doc', 'paragraph', 'callout_block'], marks: [] },
    now,
    locale,
    timeZone,
  }
}

describe('marketplace SDK V2 examples', () => {
  it('Quick Date registers all eight invocation commands and uses current host locale/timezone', async () => {
    const host = await createTestPluginHost('nevo.quick-date', quickDate, ['editor.write'])
    const commands = host.contributions.filter(item => item.kind === 'command')
    expect(commands).toHaveLength(8)

    const dateCommand = commands.find(item => item.id.endsWith('.date-long'))
    const berlin = await host.invoke(
      dateCommand?.handlerId ?? '',
      null,
      editor('2026-07-17T23:30:00.000Z', 'de-DE', 'Europe/Berlin'),
    )
    const newYork = await host.invoke(
      dateCommand?.handlerId ?? '',
      null,
      editor('2026-07-17T23:30:00.000Z', 'en-US', 'America/New_York'),
    )
    expect(berlin).not.toEqual(newYork)
    expect(berlin).toMatchObject({ type: 'transaction', revision: 7 })
  })

  it('Callout preserves callout_block rich content schema and all five variants', async () => {
    const host = await createTestPluginHost('nevo.callout', callout, [
      'editor.read',
      'editor.write',
      'editor.schema',
      'ui.contributions',
    ])
    const block = host.contributions.find(item => item.kind === 'blockType')
    expect(block?.descriptor).toMatchObject({
      name: 'callout_block',
      schema: {
        content: 'block+',
        attrs: {
          variant: { default: 'info' },
          icon: { default: '💡' },
        },
      },
    })
    const popover = host.contributions.find(item => item.kind === 'popover')
    const fields = popover?.descriptor.fields as Array<Record<string, unknown>>
    const options = fields[0]?.options as Array<Record<string, unknown>>
    expect(options.map(option => option.value)).toEqual([
      'info',
      'note',
      'warning',
      'danger',
      'success',
    ])

    const markdown = host.contributions.find(item =>
      item.kind === 'serializer' && item.descriptor.format === 'markdown')
    const serialized = await host.invoke(markdown?.handlerId ?? '', {
      node: {
        type: 'callout_block',
        attrs: { variant: 'warning', icon: '⚠️' },
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Nested' }] }],
      },
      children: 'Nested **rich** content',
    })
    expect(serialized).toContain('> ⚠️ **warning**: Nested **rich** content')
  })
})
