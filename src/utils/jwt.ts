// Minimal, unverified read of a JWT's `exp` claim. This is only used to decide
// when to proactively refresh an access token client-side — the relay remains
// the sole authority on validity, so no signature check is needed (or possible:
// the client never has the signing secret).

/** Milliseconds since epoch at which the token expires, or null if unreadable. */
export function readJwtExpiryMs(token: string | null | undefined): number | null {
  if (!token) return null
  const segments = token.split('.')
  if (segments.length < 2) return null
  try {
    // JWT payloads are base64url: restore the base64 alphabet and padding.
    const base64 = segments[1].replace(/-/g, '+').replace(/_/g, '/')
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=')
    const payload = JSON.parse(atob(padded)) as { exp?: unknown }
    return typeof payload.exp === 'number' ? payload.exp * 1000 : null
  } catch {
    return null
  }
}

/**
 * True when the token is missing, unreadable, or expires within `skewMs`.
 * An unreadable token counts as expiring so the caller refreshes rather than
 * sending a value the relay will reject.
 */
export function isJwtExpiring(token: string | null | undefined, skewMs = 60_000): boolean {
  const expiresAt = readJwtExpiryMs(token)
  if (expiresAt === null) return true
  return expiresAt - Date.now() <= skewMs
}
