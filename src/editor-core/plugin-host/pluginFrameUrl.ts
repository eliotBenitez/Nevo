// Rust mints plugin code URLs per platform: `nevoplugin://<token>/…` on macOS/Linux,
// `http(s)://nevoplugin.localhost/<token>/…` where WebView2/Android WebView only route
// custom schemes through `<protocol>://<scheme>.localhost` (https with `useHttpsScheme`).
const PLUGIN_FRAME_URL_PATTERN =
  /^(?:nevoplugin:\/\/|https?:\/\/nevoplugin\.localhost\/)[a-f0-9]{32}\/[A-Za-z0-9._/-]+$/i

export function isPluginFrameUrl(value: string): boolean {
  return PLUGIN_FRAME_URL_PATTERN.test(value) && !value.includes('..')
}

/** Resolves a plugin-relative path against the code session's entry URL origin. */
export function pluginCodeUrl(session: { token: string; entryUrl: string }, path: string): string {
  const tokenEnd = session.entryUrl.indexOf(`/${session.token}/`)
  if (tokenEnd < 0) throw new Error('Plugin code session entry URL is invalid')
  const encodedPath = path.split('/').map(encodeURIComponent).join('/')
  return `${session.entryUrl.slice(0, tokenEnd)}/${session.token}/${encodedPath}`
}
