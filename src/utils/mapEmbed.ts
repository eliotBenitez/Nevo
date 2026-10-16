// Map services do not implement oEmbed, so share links are rewritten into
// their official embeddable URLs here. Returns null for anything unrecognized.

const GOOGLE_HOST = /^(?:www\.|maps\.)?google\.(?:[a-z]{2,3}|com?\.[a-z]{2})$/
const YANDEX_HOST = /^(?:www\.)?yandex\.(?:ru|com|by|kz|uz|com\.tr)$/
const GOOGLE_AT = /@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)(?:,(\d+(?:\.\d+)?)z)?/
const OSM_HASH = /map=(\d+(?:\.\d+)?)\/(-?\d+(?:\.\d+)?)\/(-?\d+(?:\.\d+)?)/
const OSM_MARKER_ZOOM = 15

function decodeSegment(segment: string): string {
  try {
    return decodeURIComponent(segment.replace(/\+/g, ' '))
  } catch {
    return segment
  }
}

function googleEmbedUrl(parsed: URL): string | null {
  const host = parsed.hostname
  const path = parsed.pathname
  if (!host.startsWith('maps.') && !path.startsWith('/maps')) return null
  if (path.startsWith('/maps/embed')) return parsed.toString()

  const segments = path.split('/').filter(Boolean)
  const at = path.match(GOOGLE_AT)
  let query = parsed.searchParams.get('q') ?? parsed.searchParams.get('query')

  if (!query) {
    const kind = segments.indexOf('place') >= 0 ? 'place' : segments.indexOf('search') >= 0 ? 'search' : ''
    const name = kind ? segments[segments.indexOf(kind) + 1] : undefined
    if (name && !name.startsWith('@')) query = decodeSegment(name)
  }
  if (!query && at) query = `${at[1]},${at[2]}`
  if (!query) return null

  const params = new URLSearchParams({ q: query, output: 'embed' })
  // Without `ll` Google ignores the place query's location when `z` is set and shows an empty map.
  if (at) {
    params.set('ll', `${at[1]},${at[2]}`)
    if (at[3]) params.set('z', String(Math.round(Number(at[3]))))
  }
  return `https://maps.google.com/maps?${params.toString()}`
}

function yandexEmbedUrl(parsed: URL): string | null {
  const path = parsed.pathname
  if (path.startsWith('/map-widget/')) return parsed.toString()
  if (!path.startsWith('/maps')) return null

  const widget = new URL(`https://${parsed.hostname}/map-widget/v1/`)
  parsed.searchParams.forEach((value, key) => widget.searchParams.set(key, value))
  const org = path.match(/\/org\/[^/]+\/(\d+)/)
  if (org) {
    widget.searchParams.set('oid', org[1])
    widget.searchParams.set('ol', 'biz')
  }
  return widget.toString()
}

function osmEmbedUrl(parsed: URL): string | null {
  if (parsed.pathname === '/export/embed.html') return parsed.toString()

  const hash = parsed.hash.match(OSM_HASH)
  const markerLat = Number(parsed.searchParams.get('mlat'))
  const markerLon = Number(parsed.searchParams.get('mlon'))
  const hasMarker = parsed.searchParams.has('mlat') && parsed.searchParams.has('mlon')
    && Number.isFinite(markerLat) && Number.isFinite(markerLon)
  if (!hash && !hasMarker) return null

  const zoom = hash ? Number(hash[1]) : OSM_MARKER_ZOOM
  const lat = hash ? Number(hash[2]) : markerLat
  const lon = hash ? Number(hash[3]) : markerLon
  // One tile spans 360 / 2^zoom degrees of longitude; show ~2 tiles across.
  const span = 360 / 2 ** zoom
  const bbox = [lon - span, lat - span / 2, lon + span, lat + span / 2].map((n) => n.toFixed(6)).join(',')

  const params = new URLSearchParams({ bbox, layer: 'mapnik' })
  if (hasMarker) params.set('marker', `${markerLat},${markerLon}`)
  return `https://www.openstreetmap.org/export/embed.html?${params.toString()}`
}

export function mapEmbedUrl(url: string): string | null {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return null
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null
  parsed.protocol = 'https:'

  const host = parsed.hostname.toLowerCase().replace(/\.$/, '')
  if (GOOGLE_HOST.test(host)) return googleEmbedUrl(parsed)
  if (YANDEX_HOST.test(host)) return yandexEmbedUrl(parsed)
  if (host === 'openstreetmap.org' || host.endsWith('.openstreetmap.org')) return osmEmbedUrl(parsed)
  return null
}
