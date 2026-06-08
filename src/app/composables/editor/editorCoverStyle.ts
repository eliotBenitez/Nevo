/** Pure helpers for the note title icon + cover background, extracted from
 *  WorkspaceEditorPane so the component keeps only orchestration. */

export function normalizeIcon(icon: string): string {
  return icon.trim() || '📄'
}

const IMAGE_SRC_RE = /^(https?|data|blob):/

export function resolveCoverImageSource(src: string, resolveWorkspaceAssetSrc: (src: string) => string | null): string | null {
  if (!src) return null
  if (IMAGE_SRC_RE.test(src)) return src
  return resolveWorkspaceAssetSrc(src)
}

export function resolveCoverSource(cover: string | undefined, resolveWorkspaceAssetSrc: (src: string) => string | null): string | undefined | null {
  if (!cover) return cover
  if (cover.startsWith('image:')) {
    const src = cover.slice(6)
    const resolvedSrc = resolveCoverImageSource(src, resolveWorkspaceAssetSrc)
    return resolvedSrc ? `image:${resolvedSrc}` : null
  }
  if (IMAGE_SRC_RE.test(cover) || cover.startsWith('.nevo/') || cover.startsWith('/') || cover.startsWith('cloud-asset:')) {
    const resolvedSrc = resolveCoverImageSource(cover, resolveWorkspaceAssetSrc)
    return resolvedSrc ? `image:${resolvedSrc}` : null
  }
  return cover
}

export function resolveCoverStyle(cover: string | undefined): Record<string, string> | null {
  if (!cover) return null
  if (cover.startsWith('image:')) {
    const src = cover.slice(6)
    if (!src) return null
    return { backgroundImage: `url(${JSON.stringify(src)})`, backgroundSize: 'cover', backgroundPosition: 'center' }
  }
  if (cover.startsWith('gradient:')) {
    const gradient = cover.slice(9)
    return gradient ? { background: gradient } : null
  }
  if (cover.startsWith('color:')) {
    const color = cover.slice(6)
    return color ? { background: color } : null
  }
  if (cover.includes('gradient(')) return { background: cover }
  if (cover.startsWith('.nevo/') || IMAGE_SRC_RE.test(cover) || cover.startsWith('/')) {
    return { backgroundImage: `url(${JSON.stringify(cover)})`, backgroundSize: 'cover', backgroundPosition: 'center' }
  }
  return { background: cover }
}
