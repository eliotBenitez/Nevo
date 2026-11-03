import { beforeEach, describe, expect, it } from 'vitest'
import { nextTick, ref } from 'vue'
import { clearPluginReadmeCache, usePluginReadme } from './usePluginReadme'
import type { ReadmeTarget } from './usePluginReadme'

const flush = async () => { await Promise.resolve(); await nextTick(); await Promise.resolve() }

describe('usePluginReadme', () => {
  beforeEach(() => clearPluginReadmeCache())

  it('goes loading to ready and parses markdown', async () => {
    const target = ref<ReadmeTarget | null>({ key: 'a', load: async () => '# Hi' })
    const r = usePluginReadme(() => target.value)
    expect(r.status.value).toBe('loading')
    await flush()
    expect(r.status.value).toBe('ready')
    expect(r.blocks.value[0]?.kind).toBe('heading')
  })

  it('treats null and blank text as empty', async () => {
    const target = ref<ReadmeTarget | null>({ key: 'n', load: async () => null })
    const r = usePluginReadme(() => target.value)
    await flush()
    expect(r.status.value).toBe('empty')
    target.value = { key: 'w', load: async () => '  \n ' }
    await flush()
    expect(r.status.value).toBe('empty')
  })

  it('errors on rejection and recovers on retry', async () => {
    let fail = true
    const target = ref<ReadmeTarget | null>({ key: 'e', load: async () => { if (fail) throw new Error('x'); return 'ok' } })
    const r = usePluginReadme(() => target.value)
    await flush()
    expect(r.status.value).toBe('error')
    fail = false
    await r.retry()
    expect(r.status.value).toBe('ready')
  })

  it('ignores a stale response after the target changes', async () => {
    let resolveFirst!: (v: string) => void
    const target = ref<ReadmeTarget | null>({ key: 'one', load: () => new Promise<string>(res => { resolveFirst = res }) })
    const r = usePluginReadme(() => target.value)
    target.value = { key: 'two', load: async () => 'second' }
    await flush()
    resolveFirst('first')
    await flush()
    expect(r.status.value).toBe('ready')
    expect(JSON.stringify(r.blocks.value)).toContain('second')
    expect(JSON.stringify(r.blocks.value)).not.toContain('first')
  })
})
