import { describe, expect, it } from 'vitest'
import { extractEmbedIframeAttrs } from '../node-views/embed'

describe('embed node view', () => {
  it('extracts iframe attrs for direct provider rendering', () => {
    const attrs = extractEmbedIframeAttrs('<iframe src="https://www.youtube.com/embed/dQw4w9WgXcQ" allow="autoplay; web-share; fullscreen" title="Video" referrerpolicy="strict-origin-when-cross-origin"></iframe>')

    expect(attrs).toEqual({
      src: 'https://www.youtube.com/embed/dQw4w9WgXcQ',
      title: 'Video',
      allow: 'autoplay; web-share; fullscreen',
      referrerPolicy: 'strict-origin-when-cross-origin',
    })
  })

  it('rejects non-http iframe sources', () => {
    expect(extractEmbedIframeAttrs('<iframe src="javascript:alert(1)"></iframe>')).toBeNull()
    expect(extractEmbedIframeAttrs('<iframe src="/local/embed"></iframe>')).toBeNull()
  })
})
