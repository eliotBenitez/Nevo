// Inlines site/assets/site.css into the landing pages for the Pages deploy, so the first
// paint does not wait on a stylesheet request. The repo keeps the CSS as its own file, so the
// pages are rewritten in place: run it only on a disposable checkout (CI) and pass the root explicitly.
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// url() paths in the CSS are relative to assets/; rebase relative ones (any quoting) onto the page.
export function rebaseCssUrls(css, base) {
  return css.replace(/url\(\s*(['"]?)(?!data:|https?:|\/|#)([^'")\s]+)\1\s*\)/g, (_, q, p) => `url(${q}${base}/${p}${q})`)
}

export function inlineSiteCss(root) {
  const cssPath = join(root, 'assets', 'site.css')
  const css = readFileSync(cssPath, 'utf8')
  const pages = [join(root, 'index.html'), join(root, 'ru', 'index.html')]
  for (const page of pages) {
    const html = readFileSync(page, 'utf8')
    const base = relative(dirname(page), dirname(cssPath)).replaceAll('\\', '/')
    const link = /<link rel="stylesheet" href="[^"]*assets\/site\.css">/
    if (!link.test(html)) throw new Error(`No site.css link in ${page}`)
    writeFileSync(page, html.replace(link, () => `<style>\n${rebaseCssUrls(css, base)}</style>`))
    console.log(`inlined site.css into ${page}`)
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = process.argv[2]
  if (!root) {
    console.error('usage: node build-tools/inline-site-css.mjs <site-root>  (rewrites the pages in place)')
    process.exit(1)
  }
  inlineSiteCss(root)
}
