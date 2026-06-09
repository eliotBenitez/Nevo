export type EmbedProvider = 'youtube' | 'vimeo' | 'figma' | 'codepen' | 'twitter' | 'generic'

export interface EmbedResult {
  provider: EmbedProvider
  title: string
  embedHtml: string
  thumbnailUrl: string
}

const YOUTUBE_ID_REGEX = /^[A-Za-z0-9_-]{11}$/
const VIMEO_REGEX = /vimeo\.com\/(\d+)/
const CODEPEN_REGEX = /codepen\.io\/([\w-]+)\/pen\/([\w-]+)/

function hostMatches(hostname: string, domain: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, '')
  return host === domain || host.endsWith(`.${domain}`)
}

function isYouTubeHost(hostname: string): boolean {
  return hostMatches(hostname, 'youtube.com') || hostMatches(hostname, 'youtu.be')
}

export function extractYouTubeVideoId(url: string): string | null {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return null
  }

  if (!isYouTubeHost(parsed.hostname)) return null

  const segments = parsed.pathname.split('/').filter(Boolean)
  let id: string | null = null

  if (hostMatches(parsed.hostname, 'youtu.be')) {
    id = segments[0] ?? null
  } else if (segments[0] === 'watch') {
    id = parsed.searchParams.get('v')
  } else if (segments[0] === 'embed' || segments[0] === 'shorts') {
    id = segments[1] ?? null
  }

  return id && YOUTUBE_ID_REGEX.test(id) ? id : null
}

export function detectEmbedProvider(url: string): EmbedProvider | null {
  try {
    const parsed = new URL(url)
    const host = parsed.hostname
    if (isYouTubeHost(host)) return 'youtube'
    if (hostMatches(host, 'vimeo.com')) return 'vimeo'
    if (hostMatches(host, 'figma.com')) return 'figma'
    if (hostMatches(host, 'codepen.io')) return 'codepen'
    if (hostMatches(host, 'twitter.com') || hostMatches(host, 'x.com')) return 'twitter'
  } catch { /* unparseable URL */ }
  return null
}

export function generateEmbedHtml(url: string, provider: EmbedProvider): string {
  switch (provider) {
    case 'youtube': {
      const id = extractYouTubeVideoId(url)
      if (!id) return ''
      return `<iframe src="https://www.youtube-nocookie.com/embed/${id}?rel=0" title="YouTube video player" frameborder="0" allowfullscreen referrerpolicy="strict-origin-when-cross-origin" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" style="width:100%;height:100%;position:absolute;top:0;left:0;"></iframe>`
    }
    case 'vimeo': {
      const match = url.match(VIMEO_REGEX)
      const id = match?.[1]
      if (!id) return ''
      return `<iframe src="https://player.vimeo.com/video/${id}" title="Vimeo video player" frameborder="0" allowfullscreen referrerpolicy="strict-origin-when-cross-origin" allow="autoplay; fullscreen; picture-in-picture" style="width:100%;height:100%;position:absolute;top:0;left:0;"></iframe>`
    }
    case 'figma': {
      return `<iframe src="https://www.figma.com/embed?embed_host=nevo&url=${encodeURIComponent(url)}" frameborder="0" allowfullscreen style="width:100%;height:100%;position:absolute;top:0;left:0;"></iframe>`
    }
    case 'codepen': {
      const match = url.match(CODEPEN_REGEX)
      const user = match?.[1]
      const id = match?.[2]
      if (!user || !id) return ''
      return `<iframe src="https://codepen.io/${user}/embed/${id}?default-tab=result" frameborder="0" allowfullscreen style="width:100%;height:100%;position:absolute;top:0;left:0;"></iframe>`
    }
    default:
      return ''
  }
}

export async function resolveEmbed(url: string): Promise<EmbedResult | null> {
  if (!url.trim()) return null

  const provider = detectEmbedProvider(url)

  if (provider === 'youtube') {
    const id = extractYouTubeVideoId(url) ?? ''
    return {
      provider: 'youtube',
      title: '',
      embedHtml: '',
      thumbnailUrl: id ? `https://img.youtube.com/vi/${id}/mqdefault.jpg` : '',
    }
  }

  if (provider && provider !== 'twitter' && provider !== 'generic') {
    const embedHtml = generateEmbedHtml(url, provider)
    if (embedHtml) {
      return {
        provider,
        title: '',
        embedHtml,
        thumbnailUrl: '',
      }
    }
  }

  try {
    const res = await fetch(`https://noembed.com/embed?url=${encodeURIComponent(url)}`)
    const data = await res.json()
    if (data.error) return null

    const detectedProvider = provider || 'generic'
    const html = data.html ?? ''

    return {
      provider: detectedProvider === 'twitter' ? 'twitter' : detectedProvider,
      title: data.title ?? '',
      embedHtml: provider && provider !== 'twitter' && provider !== 'generic'
        ? generateEmbedHtml(url, provider) || html
        : html,
      thumbnailUrl: data.thumbnail_url ?? '',
    }
  } catch {
    if (provider) {
      return {
        provider,
        title: '',
        embedHtml: generateEmbedHtml(url, provider),
        thumbnailUrl: '',
      }
    }
    return null
  }
}
