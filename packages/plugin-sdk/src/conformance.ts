#!/usr/bin/env node

declare const process: {
  argv: string[]
  cwd(): string
  exit(code: number): never
}

const target = process.argv[2]
if (!target) {
  console.error('Usage: nevo-plugin-conformance <plugin-module>')
  process.exit(2)
} else {
  const moduleUrl = new URL(target, `file://${process.cwd()}/`).href
  const pluginModule = await import(moduleUrl)
  const definition = pluginModule.default ?? pluginModule.plugin
  if (!definition || typeof definition.setup !== 'function') {
    throw new Error('Plugin must export definePlugin({ setup }) as default or plugin')
  }
  console.log('Nevo Plugin SDK v2 conformance: module shape is valid')
}

export {}
