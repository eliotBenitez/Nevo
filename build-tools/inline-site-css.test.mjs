import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { inlineSiteCss, rebaseCssUrls } from './inline-site-css.mjs'

test('rebases relative url() in any quoting and leaves absolute ones alone', () => {
  const css = "a{src:url('fonts/a.woff2')} b{src:url(\"fonts/b.woff2\")} c{src:url(img/c.png)} d{src:url(data:x)} e{src:url('https://x/y')} f{src:url(/abs.png)}"
  assert.equal(
    rebaseCssUrls(css, '../assets'),
    "a{src:url('../assets/fonts/a.woff2')} b{src:url(\"../assets/fonts/b.woff2\")} c{src:url(../assets/img/c.png)} d{src:url(data:x)} e{src:url('https://x/y')} f{src:url(/abs.png)}",
  )
})

test('inlines the stylesheet into both pages with page-relative font paths', async () => {
  const root = await mkdtemp(join(tmpdir(), 'nevo-site-'))
  try {
    await mkdir(join(root, 'assets'))
    await mkdir(join(root, 'ru'))
    await writeFile(join(root, 'assets', 'site.css'), "@font-face{src:url('fonts/g.woff2')}")
    await writeFile(join(root, 'index.html'), '<link rel="stylesheet" href="assets/site.css">')
    await writeFile(join(root, 'ru', 'index.html'), '<link rel="stylesheet" href="../assets/site.css">')
    inlineSiteCss(root)
    assert.match(await readFile(join(root, 'index.html'), 'utf8'), /<style>\n@font-face\{src:url\('assets\/fonts\/g\.woff2'\)\}<\/style>/)
    assert.match(await readFile(join(root, 'ru', 'index.html'), 'utf8'), /url\('\.\.\/assets\/fonts\/g\.woff2'\)/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
