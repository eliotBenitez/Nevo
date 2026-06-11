#!/usr/bin/env node
// Generates `latest.json` (the Tauri updater manifest) from the `.sig` files
// produced by a local `tauri build` (requires `createUpdaterArtifacts: true`).
//
// Usage:
//   node scripts/generate-updater-manifest.mjs <tag> [owner/repo] [notes]
//
// Example:
//   node scripts/generate-updater-manifest.mjs v0.1.2
//
// It scans the Tauri bundle output, picks the updater artifact for each
// platform, embeds its signature, and points the URL at the matching GitHub
// release asset. Upload the printed `latest.json` to the SAME release.
//
// Note: a local build only produces artifacts for the CURRENT OS. To cover
// several platforms, run this on each OS and merge the `platforms` objects
// into a single `latest.json` before uploading.

import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const tag = process.argv[2]
const repo = process.argv[3] || 'eliotBenitez/Nevo'
const notes = process.argv[4] || `Nevo ${tag}`

if (!tag) {
  console.error('Usage: node scripts/generate-updater-manifest.mjs <tag> [owner/repo] [notes]')
  process.exit(1)
}

const version = tag.replace(/^v/, '')
const baseUrl = `https://github.com/${repo}/releases/download/${tag}`

// Collect every bundle directory under target (handles cross-compiled triples).
const targetDir = 'src-tauri/target'
const bundleRoots = []
if (existsSync(`${targetDir}/release/bundle`)) bundleRoots.push(`${targetDir}/release/bundle`)
for (const entry of existsSync(targetDir) ? readdirSync(targetDir) : []) {
  const p = join(targetDir, entry, 'release/bundle')
  if (existsSync(p)) bundleRoots.push(p)
}

// Walk a directory tree collecting files that have a sibling `.sig`.
function walk(dir, out) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (full.endsWith('.sig')) out.push(full.slice(0, -4)) // strip .sig
  }
}

const signed = []
for (const root of bundleRoots) walk(root, signed)

// Map an updater artifact path to a Tauri platform key, or null to skip
// (e.g. .deb/.rpm are NOT updater targets).
function platformKey(file) {
  const aarch64 = /aarch64|arm64/i.test(file)
  if (file.endsWith('.AppImage')) return aarch64 ? 'linux-aarch64' : 'linux-x86_64'
  if (file.endsWith('-setup.exe') || file.endsWith('.msi')) return aarch64 ? 'windows-aarch64' : 'windows-x86_64'
  if (file.endsWith('.app.tar.gz')) return aarch64 ? 'darwin-aarch64' : 'darwin-x86_64'
  return null
}

const platforms = {}
for (const artifact of signed) {
  const key = platformKey(artifact)
  if (!key) continue
  const fileName = artifact.split('/').pop()
  platforms[key] = {
    signature: readFileSync(`${artifact}.sig`, 'utf8').trim(),
    url: `${baseUrl}/${encodeURIComponent(fileName)}`,
  }
  console.error(`+ ${key}  ->  ${fileName}`)
}

if (Object.keys(platforms).length === 0) {
  console.error('No updater artifacts (.AppImage / .msi / -setup.exe / .app.tar.gz) with .sig found.')
  console.error('Did you run `pnpm tauri build` with createUpdaterArtifacts enabled?')
  process.exit(1)
}

const manifest = {
  version,
  notes,
  pub_date: new Date().toISOString(),
  platforms,
}

writeFileSync('latest.json', JSON.stringify(manifest, null, 2) + '\n')
console.error('\nWrote latest.json — upload it to the release', tag)
