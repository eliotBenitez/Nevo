import { readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'

const assetsDir = new globalThis.URL('../dist/assets/', import.meta.url)
const defaultBudget = 1100 * 1024
const lazyMathJaxSvgBudget = 1300 * 1024
const failures = []

for (const fileName of await readdir(assetsDir)) {
  if (!fileName.endsWith('.js')) continue
  const bytes = (await stat(join(assetsDir.pathname, fileName))).size
  const budget = fileName.startsWith('svg-') ? lazyMathJaxSvgBudget : defaultBudget
  if (bytes > budget) failures.push({ fileName, bytes, budget })
}

if (failures.length > 0) {
  for (const { fileName, bytes, budget } of failures) {
    globalThis.console.error(`${fileName}: ${(bytes / 1024).toFixed(1)} KiB exceeds ${(budget / 1024).toFixed(0)} KiB`)
  }
  globalThis.process.exitCode = 1
} else {
  globalThis.console.log('Bundle budgets passed')
}
