import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { verifyFile } from './prepare-whisper-model.mjs'

test('rejects a truncated or tampered local model before bundling', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'nevo-model-'))
  const file = join(dir, 'model.bin')
  try {
    await writeFile(file, 'valid')
    const sha = createHash('sha256').update('valid').digest('hex')
    assert.equal(await verifyFile(file, 5, sha), true)
    assert.equal(await verifyFile(file, 4, sha), false)
    await writeFile(file, 'other')
    assert.equal(await verifyFile(file, 5, sha), false)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
