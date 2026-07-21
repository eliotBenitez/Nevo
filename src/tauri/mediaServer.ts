import { noteCommands } from './commands'
import { workspaceAssetUrl } from '../utils/workspaceAssetUrl'

interface MediaServerInfo {
  port: number
  token: string
}

let cached: MediaServerInfo | null = null
let inflight: Promise<MediaServerInfo | null> | null = null

/**
 * The loopback media server is a WebKitGTK-desktop workaround and is not started
 * on mobile. `main.ts` stamps the resolved platform onto the root element before
 * mount, so this is a reliable synchronous signal for media URL building.
 */
function isMobileRuntime(): boolean {
  if (typeof document === 'undefined') return false
  const platform = document.documentElement.dataset.platform
  return platform === 'android' || platform === 'ios'
}

/**
 * Fetch (once) the localhost media server connection info. The Rust server is
 * started at app launch, so this resolves almost immediately and is cached.
 * On mobile there is no server, so this resolves to null without a round-trip.
 */
export function ensureMediaServer(): Promise<MediaServerInfo | null> {
  if (cached) return Promise.resolve(cached)
  if (isMobileRuntime()) return Promise.resolve(null)
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
 * Mobile webviews (Chromium/WKWebView) stream local media fine over the asset
 * protocol, so there we resolve synchronously via convertFileSrc.
 */
export function mediaHttpUrl(absolutePath: string, workspaceAssetSrc?: string): string | null {
  if (isMobileRuntime()) return workspaceAssetSrc ? workspaceAssetUrl(workspaceAssetSrc) : null
  if (!cached) {
    void ensureMediaServer()
    return null
  }
  return `http://127.0.0.1:${cached.port}/asset?token=${cached.token}&path=${encodeURIComponent(absolutePath)}`
}

/**
 * Build a YouTube embed proxy URL served from the local media server.
 * Returns null if the server info is not yet cached (falls back to thumbnail card).
 * The proxy is desktop-only, so on mobile this returns null and callers show the
 * thumbnail card instead.
 */
export function youTubeEmbedUrl(videoId: string): string | null {
  if (isMobileRuntime()) return null
  if (!cached) return null
  return `http://127.0.0.1:${cached.port}/youtube?id=${encodeURIComponent(videoId)}`
}
