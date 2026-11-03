import { describe, expect, it } from 'vitest'
import { isPluginFrameUrl, pluginCodeUrl } from './pluginFrameUrl'

const token = '0123456789abcdef0123456789abcdef'

describe('plugin frame URLs', () => {
  it('accepts the scheme form and the WebView2/Android localhost form', () => {
    expect(isPluginFrameUrl(`nevoplugin://${token}/views/a.html`)).toBe(true)
    expect(isPluginFrameUrl(`http://nevoplugin.localhost/${token}/views/a.html`)).toBe(true)
    expect(isPluginFrameUrl(`https://nevoplugin.localhost/${token}/views/a.html`)).toBe(true)
  })

  it('rejects other origins, bad tokens and traversal', () => {
    expect(isPluginFrameUrl(`http://nevoplugin.localhost.evil/${token}/a.html`)).toBe(false)
    expect(isPluginFrameUrl(`http://evil.test/${token}/a.html`)).toBe(false)
    expect(isPluginFrameUrl(`nevoplugin-asset://${token}/a.html`)).toBe(false)
    expect(isPluginFrameUrl('nevoplugin://token/a.html')).toBe(false)
    expect(isPluginFrameUrl(`nevoplugin://${token}/../a.html`)).toBe(false)
  })

  it('keeps the entry URL form when resolving plugin paths', () => {
    expect(pluginCodeUrl({ token, entryUrl: `nevoplugin://${token}/dist/index.js` }, 'views/a b.html'))
      .toBe(`nevoplugin://${token}/views/a%20b.html`)
    expect(pluginCodeUrl({ token, entryUrl: `http://nevoplugin.localhost/${token}/index.js` }, 'view.html'))
      .toBe(`http://nevoplugin.localhost/${token}/view.html`)
    expect(() => pluginCodeUrl({ token, entryUrl: 'nevoplugin://other/index.js' }, 'view.html')).toThrow()
  })
})
