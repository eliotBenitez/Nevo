let cachedHome: string | null = null

function isWindowsPlatform(platform: string | null | undefined): boolean {
  const normalizedPlatform = platform?.toLowerCase()
  return normalizedPlatform === 'windows' || normalizedPlatform === 'win32'
}

/**
 * Uses the native separator for paths shown to the user. This is deliberately
 * presentation-only: persisted workspace paths continue to be handled by the
 * backend as filesystem paths.
 */
export function formatWorkspacePath(path: string, platform?: string | null): string {
  return isWindowsPlatform(platform) ? path.replace(/\//g, '\\') : path.replace(/\\/g, '/')
}

/**
 * Expand a leading `~` / `~/` / `~\` in a workspace path to the absolute home
 * directory.
 *
 * The Rust commands expand tildes internally, but the frontend uses the raw
 * workspace path to build `asset://` URLs via `convertFileSrc`. An unexpanded
 * `~` lands outside the asset-protocol scope (`$HOME/**`), so the webview
 * rejects the request with 403 and local images/covers never load.
 */
export async function expandHomePath(path: string): Promise<string> {
  if (path !== '~' && !path.startsWith('~/') && !path.startsWith('~\\')) return path
  if (cachedHome === null) {
    try {
      const { homeDir } = await import('@tauri-apps/api/path')
      cachedHome = (await homeDir()).replace(/[\\/]+$/, '')
    } catch {
      return path
    }
  }
  if (path === '~') return cachedHome
  // path.slice(1) keeps the original separator (`/Documents` or `\Documents`).
  return cachedHome + path.slice(1)
}
