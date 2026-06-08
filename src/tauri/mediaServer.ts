import { noteCommands } from './commands'

interface MediaServerInfo {
  port: number
  token: string
}

let cached: MediaServerInfo | null = null
let inflight: Promise<MediaServerInfo | null> | null = null

/**
 * Fetch (once) the localhost media server connection info. The Rust server is
 * started at app launch, so this resolves almost immediately and is cached.
 */
export function ensureMediaServer(): Promise<MediaServerInfo | null> {
  if (cached) return Promise.resolve(cached)
  if (!inflight) {
    inflight = noteCommands
      .getMediaServerInfo()
      .then((info) => { cached = info; return info })
      .catch(() => null)
  }
  return inflight
}

/**
 * Build a streaming URL for an absolute media file path. Returns null until the
 * server info has loaded (kicks off the fetch as a side effect).
 * WebKitGTK's <video> requires real HTTP range streaming — asset:// does not work.
 */
export function mediaHttpUrl(absolutePath: string): string | null {
  if (!cached) {
    void ensureMediaServer()
    return null
  }
  return `http://127.0.0.1:${cached.port}/asset?token=${cached.token}&path=${encodeURIComponent(absolutePath)}`
}

/**
 * Build a YouTube embed proxy URL served from the local media server.
 * Returns null if the server info is not yet cached (falls back to thumbnail card).
 */
export function youTubeEmbedUrl(videoId: string): string | null {
  if (!cached) return null
  return `http://127.0.0.1:${cached.port}/youtube?id=${encodeURIComponent(videoId)}`
}
