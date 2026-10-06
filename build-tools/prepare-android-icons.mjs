import { run } from '@tauri-apps/cli'
import { access, copyFile, cp, mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const manifestPath = path.join(projectRoot, 'src-tauri', 'icons', 'android-icon.json')
const androidResourcesPath = path.join(
  projectRoot,
  'src-tauri',
  'gen',
  'android',
  'app',
  'src',
  'main',
  'res',
)

export async function copyAndroidIconResources(generatedAndroidPath, destinationPath) {
  const resourceDirectories = [
    'mipmap-anydpi-v26',
    'mipmap-hdpi',
    'mipmap-mdpi',
    'mipmap-xhdpi',
    'mipmap-xxhdpi',
    'mipmap-xxxhdpi',
    'values',
  ]

  for (const directory of resourceDirectories) {
    await cp(path.join(generatedAndroidPath, directory), path.join(destinationPath, directory), {
      recursive: true,
      force: true,
      filter: (source) => {
        const name = path.basename(source)
        return source.endsWith(`${path.sep}${directory}`)
          || name === 'ic_launcher.xml'
          || name === 'ic_launcher_background.xml'
          || name.startsWith('ic_launcher') && name.endsWith('.png')
      },
    })
  }
}

export async function replaceHighDensityFallbacks(androidOutputPath, legacyPngPath, roundPngPath) {
  const highDensityPath = path.join(androidOutputPath, 'mipmap-hdpi')
  await Promise.all([
    copyFile(legacyPngPath, path.join(highDensityPath, 'ic_launcher.png')),
    copyFile(roundPngPath, path.join(highDensityPath, 'ic_launcher_round.png')),
  ])
}

async function generate72Png(sourcePath, temporaryOutput, name) {
  const sourceCopy = path.join(temporaryOutput, `${name}-source.png`)
  const manifestPath = path.join(temporaryOutput, `${name}.json`)
  const iconOutput = path.join(temporaryOutput, `${name}-72`)

  await copyFile(sourcePath, sourceCopy)
  await writeFile(manifestPath, JSON.stringify({ default: path.basename(sourceCopy) }))
  await run(['icon', manifestPath, '--output', iconOutput, '--png', '72'])
  return path.join(iconOutput, '72x72.png')
}

export async function prepareAndroidIcons() {
  const androidProjectManifest = path.join(
    projectRoot,
    'src-tauri',
    'gen',
    'android',
    'app',
    'src',
    'main',
    'AndroidManifest.xml',
  )
  await access(androidProjectManifest).catch(() => {
    throw new Error('Android project is missing. Run `pnpm tauri:android:init` first.')
  })

  const temporaryOutput = await mkdtemp(path.join(os.tmpdir(), 'nevo-android-icons-'))

  try {
    const generatedAndroidPath = path.join(temporaryOutput, 'generated', 'android')
    await run(['icon', manifestPath, '--output', path.join(temporaryOutput, 'generated')])

    const legacyHdpi = await generate72Png(
      path.join(generatedAndroidPath, 'mipmap-xxxhdpi', 'ic_launcher.png'),
      temporaryOutput,
      'legacy',
    )
    const roundHdpi = await generate72Png(
      path.join(generatedAndroidPath, 'mipmap-xxxhdpi', 'ic_launcher_round.png'),
      temporaryOutput,
      'round',
    )
    await replaceHighDensityFallbacks(generatedAndroidPath, legacyHdpi, roundHdpi)

    await copyAndroidIconResources(generatedAndroidPath, androidResourcesPath)
  } finally {
    await rm(temporaryOutput, { recursive: true, force: true })
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await prepareAndroidIcons()
}
