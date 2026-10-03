import { readdir, readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const distDir = fileURLToPath(new globalThis.URL('../dist/', import.meta.url))
const assetsDir = join(distDir, 'assets')
const defaultBudget = 1100 * 1024
const lazyMathJaxSvgBudget = 1300 * 1024
const failures = []

for (const fileName of await readdir(assetsDir)) {
  if (!fileName.endsWith('.js')) continue
  const bytes = (await stat(join(assetsDir, fileName))).size
  const budget = fileName.startsWith('svg-') ? lazyMathJaxSvgBudget : defaultBudget
  if (bytes > budget) failures.push({ fileName, bytes, budget })
}

// The *initial* dependency graph: the entry script plus every chunk the
// browser fetches before first paint (<link rel="modulepreload"> in
// dist/index.html — see getImportedChunks in Vite's html plugin, which walks
// only static `chunk.imports`, never dynamic import()). A regression here
// means something eager (main.ts, or a module it statically imports, e.g.
// stores/workspace.ts) started pulling in code that should only load with a
// route/feature — see the F14 fix that made the cloud backend, the
// marketplace-plugin migration, and highlight.js/katex/unified all lazy.
// 900 KiB sits ~170 KiB above the ~734 KiB measured after that fix — enough
// headroom for normal growth, but reintroducing any one of those (each
// 117 KiB-520 KiB) trips it immediately.
const initialGraphBudget = 900 * 1024
const html = await readFile(join(distDir, 'index.html'), 'utf8')
const entryScript = html.match(/<script[^>]*\bsrc="\/assets\/([^"]+)"/)?.[1]
const preloadMatches = [...html.matchAll(/<link rel="modulepreload"[^>]*\bhref="\/assets\/([^"]+)"/g)]
const initialFiles = [entryScript, ...preloadMatches.map(m => m[1])].filter(Boolean)

if (initialFiles.length === 0) {
  globalThis.console.error('check-bundle-size: could not find the entry script in dist/index.html')
  globalThis.process.exitCode = 1
} else {
  let initialGraphBytes = 0
  for (const fileName of initialFiles) {
    initialGraphBytes += (await stat(join(assetsDir, fileName))).size
  }
  if (initialGraphBytes > initialGraphBudget) {
    failures.push({ fileName: `initial dependency graph (${initialFiles.join(', ')})`, bytes: initialGraphBytes, budget: initialGraphBudget })
  }
}

if (failures.length > 0) {
  for (const { fileName, bytes, budget } of failures) {
    globalThis.console.error(`${fileName}: ${(bytes / 1024).toFixed(1)} KiB exceeds ${(budget / 1024).toFixed(0)} KiB`)
  }
  globalThis.process.exitCode = 1
} else {
  globalThis.console.log('Bundle budgets passed')
}
