export type AiErrorKind = 'privacy' | 'offline' | 'rateLimit' | 'auth' | 'other'

/** Mirrors Rust `url_is_loopback`: localhost, 127.0.0.0/8, ::1. */
export function describeEndpoint(baseUrl: string): { local: boolean; host: string } {
  let host: string
  try {
    host = new URL(baseUrl).hostname.toLowerCase()
  } catch {
    return { local: false, host: '' }
  }
  if (host.startsWith('[') && host.endsWith(']')) host = host.slice(1, -1)
  const local = host === 'localhost' || host === '::1' || /^127(\.\d{1,3}){3}$/.test(host)
  return { local, host }
}

export function classifyAiError(message: string): AiErrorKind {
  const m = message.toLowerCase()
  if (m.includes('privacy mode')) return 'privacy'
  // reqwest status errors read "HTTP status client error (429 Too Many Requests) for url (…)".
  if (/\(429\b|too many requests|rate limit/.test(m)) return 'rateLimit'
  if (/\(40[13]\b|unauthorized|forbidden/.test(m)) return 'auth'
  if (/connection refused|error sending request|tcp connect|timed out|dns/.test(m)) return 'offline'
  return 'other'
}
