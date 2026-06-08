import { describe, expect, it, vi } from 'vitest'
import { resolveCoverSource, resolveCoverStyle } from './editorCoverStyle'

function resolveCover(cover: string | undefined, resolver = (src: string) => `asset://${src}`) {
  const resolved = resolveCoverSource(cover, resolver)
  return resolveCoverStyle(resolved ?? undefined)
}

describe('editor cover style', () => {
  it('resolves local workspace cover assets before building CSS', () => {
    expect(resolveCover('image:.nevo/assets/cover.jpg')).toEqual({
      backgroundImage: 'url("asset://.nevo/assets/cover.jpg")',
      backgroundSize: 'cover',
      backgroundPosition: 'center',
    })
  })

  it('keeps remote, data, and blob cover image sources unchanged', () => {
    const resolver = vi.fn((src: string) => `asset://${src}`)

    expect(resolveCoverSource('image:https://cdn.example.com/cover.jpg', resolver)).toBe('image:https://cdn.example.com/cover.jpg')
    expect(resolveCoverSource('image:data:image/png;base64,abc', resolver)).toBe('image:data:image/png;base64,abc')
    expect(resolveCoverSource('image:blob:http://localhost/cover', resolver)).toBe('image:blob:http://localhost/cover')
    expect(resolver).not.toHaveBeenCalled()
  })

  it('keeps gradient and color cover styles intact', () => {
    expect(resolveCover('gradient:linear-gradient(135deg, #111, #eee)')).toEqual({
      background: 'linear-gradient(135deg, #111, #eee)',
    })
    expect(resolveCover('color:#f2d7d5')).toEqual({
      background: '#f2d7d5',
    })
  })

  it('returns null for an empty image cover source', () => {
    expect(resolveCover('image:')).toBeNull()
  })
})
