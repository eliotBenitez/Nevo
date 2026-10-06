import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { copyAndroidIconResources, replaceHighDensityFallbacks } from './prepare-android-icons.mjs'

test('copies generated launcher resources without copying desktop or iOS icons', async () => {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), 'nevo-android-icons-test-'))
  const generated = path.join(temporaryRoot, 'generated', 'android')
  const destination = path.join(temporaryRoot, 'app', 'res')

  try {
    for (const directory of [
      'mipmap-anydpi-v26',
      'mipmap-hdpi',
      'mipmap-mdpi',
      'mipmap-xhdpi',
      'mipmap-xxhdpi',
      'mipmap-xxxhdpi',
      'values',
    ]) {
      await mkdir(path.join(generated, directory), { recursive: true })
    }
    await mkdir(path.join(destination, 'mipmap-mdpi'), { recursive: true })

    await writeFile(path.join(generated, 'mipmap-anydpi-v26', 'ic_launcher.xml'), '<adaptive-icon/>')
    await writeFile(path.join(generated, 'mipmap-mdpi', 'ic_launcher.png'), 'legacy')
    await writeFile(path.join(generated, 'mipmap-mdpi', 'ic_launcher_foreground.png'), 'foreground')
    await writeFile(path.join(generated, 'mipmap-mdpi', 'other-icon.png'), 'unrelated')
    await writeFile(path.join(destination, 'mipmap-mdpi', 'user-resource.png'), 'preserve')
    await writeFile(path.join(generated, 'values', 'ic_launcher_background.xml'), '<resources/>')
    await writeFile(path.join(temporaryRoot, 'generated', 'icon.png'), 'desktop')

    await copyAndroidIconResources(generated, destination)

    assert.equal(await readFile(path.join(destination, 'mipmap-anydpi-v26', 'ic_launcher.xml'), 'utf8'), '<adaptive-icon/>')
    assert.equal(await readFile(path.join(destination, 'mipmap-mdpi', 'ic_launcher_foreground.png'), 'utf8'), 'foreground')
    assert.equal(await readFile(path.join(destination, 'values', 'ic_launcher_background.xml'), 'utf8'), '<resources/>')
    assert.equal(await readFile(path.join(destination, 'mipmap-mdpi', 'user-resource.png'), 'utf8'), 'preserve')
    await assert.rejects(readFile(path.join(destination, 'mipmap-mdpi', 'other-icon.png')))
    await assert.rejects(readFile(path.join(destination, 'icon.png')))
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true })
  }
})

test('replaces both hdpi fallbacks with the custom-size icons', async () => {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), 'nevo-hdpi-icons-test-'))
  const androidOutput = path.join(temporaryRoot, 'android')
  const densityOutput = path.join(androidOutput, 'mipmap-hdpi')

  try {
    await mkdir(densityOutput, { recursive: true })
    const legacySized = path.join(temporaryRoot, 'legacy-72.png')
    const roundSized = path.join(temporaryRoot, 'round-72.png')
    await writeFile(path.join(densityOutput, 'ic_launcher.png'), 'undersized legacy')
    await writeFile(path.join(densityOutput, 'ic_launcher_round.png'), 'undersized round')
    await writeFile(legacySized, '72px legacy')
    await writeFile(roundSized, '72px round')

    await replaceHighDensityFallbacks(androidOutput, legacySized, roundSized)

    assert.equal(await readFile(path.join(densityOutput, 'ic_launcher.png'), 'utf8'), '72px legacy')
    assert.equal(await readFile(path.join(densityOutput, 'ic_launcher_round.png'), 'utf8'), '72px round')
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true })
  }
})
