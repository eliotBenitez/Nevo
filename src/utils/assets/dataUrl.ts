// Decodes a `data:` URL into raw bytes, so a pasted/dropped base64 image can be
// imported through the workspace asset store (see
// useImageUpload.importUrlAndApplyImage) instead of being embedded verbatim
// into the document, ProseMirror doc, and every Yjs snapshot/relay update.

const DATA_URL_PATTERN = /^data:([^,;]*)((?:;[^,;]*)*),(.*)$/is

const MIME_EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
  'image/bmp': 'bmp',
  'image/avif': 'avif',
  'image/x-icon': 'ico',
}

export interface ParsedDataUrl {
  bytes: Uint8Array
  mime: string
  fileName: string
}

function decodeBase64(data: string): Uint8Array | null {
  try {
    const binary = atob(data)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    return bytes
  } catch {
    return null
  }
}

function decodePercentEncoded(data: string): Uint8Array | null {
  try {
    return new TextEncoder().encode(decodeURIComponent(data))
  } catch {
    return null
  }
}

function extensionForMime(mime: string): string {
  const known = MIME_EXTENSIONS[mime]
  if (known) return known
  const subtype = mime.split('/').pop()?.replace(/[^a-z0-9]/gi, '')
  return subtype || 'bin'
}

/** Parses a `data:` URL, or returns null when it is malformed / not decodable. */
export function parseDataUrl(url: string): ParsedDataUrl | null {
  const match = DATA_URL_PATTERN.exec(url)
  if (!match) return null

  const mime = (match[1] || 'text/plain').toLowerCase()
  const params = match[2] ?? ''
  const data = match[3] ?? ''
  const isBase64 = /;base64/i.test(params)

  const bytes = isBase64 ? decodeBase64(data) : decodePercentEncoded(data)
  if (!bytes || bytes.length === 0) return null

  return { bytes, mime, fileName: `pasted-image.${extensionForMime(mime)}` }
}
