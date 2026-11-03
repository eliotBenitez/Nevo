import { describe, expect, it } from 'vitest'
import { createExternalWriteGate } from './externalWriteGate'

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>(res => { resolve = res })
  return { promise, resolve }
}

describe('externalWriteGate', () => {
  it('runs writes to one note in order and keeps readers waiting until all settle', async () => {
    const gate = createExternalWriteGate()
    const order: string[] = []
    const first = deferred()

    const a = gate.run('n1', async () => { await first.promise; order.push('a') })
    const b = gate.run('n1', async () => { order.push('b') })
    const readerDone = gate.settled('n1').then(() => order.push('reader'))

    expect(gate.isPending('n1')).toBe(true)
    first.resolve()
    await Promise.all([a, b, readerDone])

    expect(order).toEqual(['a', 'b', 'reader'])
    expect(gate.isPending('n1')).toBe(false)
  })

  it('bumps the generation when a write starts and isolates notes', async () => {
    const gate = createExternalWriteGate()
    await gate.run('n1', async () => {})
    expect(gate.generation('n1')).toBe(1)
    expect(gate.generation('n2')).toBe(0)
    expect(gate.isPending('n2')).toBe(false)
  })

  it('lets later writes and readers proceed after a failed write', async () => {
    const gate = createExternalWriteGate()
    const failed = gate.run('n1', async () => { throw new Error('disk full') })
    const next = gate.run('n1', async () => 'ok')

    await expect(failed).rejects.toThrow('disk full')
    await expect(next).resolves.toBe('ok')
    await expect(gate.settled('n1')).resolves.toBeUndefined()
  })
})
