import { describe, expect, it } from 'vitest'
import { addressMapUrl, mapEmbedUrl } from './mapEmbed'
import { detectEmbedProvider, generateEmbedHtml, resolveEmbed } from './oembed'
import { extractEmbedIframeAttrs } from '../editor-core/node-views/embed'

describe('mapEmbedUrl', () => {
  it('rewrites Google Maps place links with coordinates and zoom', () => {
    const src = mapEmbedUrl('https://www.google.com/maps/place/Eiffel+Tower/@48.8583701,2.2944813,17z/data=!3m1')
    const parsed = new URL(src!)
    expect(parsed.origin + parsed.pathname).toBe('https://maps.google.com/maps')
    expect(parsed.searchParams.get('q')).toBe('Eiffel Tower')
    expect(parsed.searchParams.get('ll')).toBe('48.8583701,2.2944813')
    expect(parsed.searchParams.get('z')).toBe('17')
    expect(parsed.searchParams.get('output')).toBe('embed')
  })

  it('handles Google Maps coordinates, ?q= and existing embed links', () => {
    expect(new URL(mapEmbedUrl('https://www.google.ru/maps/@55.75,37.61,12z')!).searchParams.get('q')).toBe('55.75,37.61')
    expect(new URL(mapEmbedUrl('https://maps.google.com/?q=Berlin')!).searchParams.get('q')).toBe('Berlin')
    expect(mapEmbedUrl('https://www.google.com/maps/embed?pb=!1m18')).toBe('https://www.google.com/maps/embed?pb=!1m18')
  })

  it('turns a free-text address into a Google Maps embed', () => {
    const link = addressMapUrl('  Red Square, Moscow ')
    expect(detectEmbedProvider(link)).toBe('map')
    const src = new URL(mapEmbedUrl(link)!)
    expect(src.origin + src.pathname).toBe('https://maps.google.com/maps')
    expect(src.searchParams.get('q')).toBe('Red Square, Moscow')
    expect(src.searchParams.has('z')).toBe(false)
  })

  it('rewrites Yandex Maps links to the map widget', () => {
    const src = new URL(mapEmbedUrl('https://yandex.ru/maps/213/moscow/?ll=37.61%2C55.75&z=12')!)
    expect(src.origin + src.pathname).toBe('https://yandex.ru/map-widget/v1/')
    expect(src.searchParams.get('ll')).toBe('37.61,55.75')
    expect(src.searchParams.get('z')).toBe('12')

    const org = new URL(mapEmbedUrl('https://yandex.ru/maps/org/gum/1018907821/')!)
    expect(org.searchParams.get('oid')).toBe('1018907821')
  })

  it('rewrites OpenStreetMap links to the export embed', () => {
    const src = new URL(mapEmbedUrl('https://www.openstreetmap.org/?mlat=55.75&mlon=37.61#map=15/55.75/37.61')!)
    expect(src.pathname).toBe('/export/embed.html')
    expect(src.searchParams.get('marker')).toBe('55.75,37.61')
    const [minLon, minLat, maxLon, maxLat] = src.searchParams.get('bbox')!.split(',').map(Number)
    expect(minLon).toBeLessThan(37.61)
    expect(maxLon).toBeGreaterThan(37.61)
    expect(minLat).toBeLessThan(55.75)
    expect(maxLat).toBeGreaterThan(55.75)
  })

  it('ignores non-map and lookalike URLs', () => {
    for (const url of [
      'https://www.google.com/search?q=maps',
      'https://google.com.evil.test/maps/@1,2,3z',
      'https://notopenstreetmap.org/#map=15/1/2',
      'https://www.openstreetmap.org/about',
      'https://yandex.ru/search/?text=maps',
      'javascript:alert(1)',
    ]) {
      expect(mapEmbedUrl(url)).toBeNull()
    }
  })

  it('resolves map links as iframe embeds without network calls', async () => {
    const url = 'https://www.google.com/maps/place/Big+Ben/@51.5007,-0.1246,16z'
    expect(detectEmbedProvider(url)).toBe('map')

    const result = await resolveEmbed(url)
    expect(result?.provider).toBe('map')
    expect(extractEmbedIframeAttrs(result!.embedHtml)?.src).toBe(mapEmbedUrl(url))
    expect(generateEmbedHtml('https://example.com', 'map')).toBe('')
  })
})
