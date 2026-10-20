// Inlines site/assets/site.css into the landing pages for the Pages deploy, so the first
// paint does not wait on a stylesheet request. The repo keeps the CSS as its own file.
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'

const root = process.argv[2] ?? 'site'
const cssPath = join(root, 'assets', 'site.css')
const css = readFileSync(cssPath, 'utf8')
const pages = [join(root, 'index.html'), join(root, 'ru', 'index.html')]

for (const page of pages) {
  const html = readFileSync(page, 'utf8')
  // url() paths in the CSS are relative to assets/; rebase them onto the page.
  const base = relative(dirname(page), dirname(cssPath)).replaceAll('\\', '/')
  const rebased = css.replace(/url\('(?!data:|https?:|\/)([^']+)'\)/g, (_, p) => `url('${base}/${p}')`)
  const link = /<link rel="stylesheet" href="[^"]*assets\/site\.css">/
  if (!link.test(html)) throw new Error(`No site.css link in ${page}`)
  writeFileSync(page, html.replace(link, () => `<style>\n${rebased}</style>`))
  console.log(`inlined site.css into ${page}`)
}
