import { afterEach, describe, expect, it, vi } from 'vitest'
import { isJwtExpiring, readJwtExpiryMs } from './jwt'

function jwt(payload: Record<string, unknown>): string {
  // base64url, unpadded — exactly what a real relay token looks like.
  const encode = (value: object) =>
    btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode(payload)}.signature`
}

describe('readJwtExpiryMs', () => {
  it('reads exp as milliseconds', () => {
    expect(readJwtExpiryMs(jwt({ exp: 1_700_000_000, uid: 'u1' }))).toBe(1_700_000_000_000)
  })

  it('returns null for tokens it cannot read', () => {
    expect(readJwtExpiryMs(null)).toBeNull()
    expect(readJwtExpiryMs('')).toBeNull()
    expect(readJwtExpiryMs('not-a-jwt')).toBeNull()
    expect(readJwtExpiryMs('a.!!!not-base64!!!.c')).toBeNull()
    expect(readJwtExpiryMs(jwt({ uid: 'u1' }))).toBeNull()
  })
})

describe('isJwtExpiring', () => {
  afterEach(() => { vi.useRealTimers() })

  it('is false only while the token has more than the skew window left', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-02T12:00:00Z'))
    const in15Min = Math.floor(Date.parse('2026-08-02T12:15:00Z') / 1000)

    expect(isJwtExpiring(jwt({ exp: in15Min }))).toBe(false)

    // 30 s of validity left is inside the default 60 s skew.
    vi.setSystemTime(new Date('2026-08-02T12:14:30Z'))
    expect(isJwtExpiring(jwt({ exp: in15Min }))).toBe(true)

    vi.setSystemTime(new Date('2026-08-02T12:20:00Z'))
    expect(isJwtExpiring(jwt({ exp: in15Min }))).toBe(true)
  })

  it('treats an unreadable or missing token as expiring', () => {
    expect(isJwtExpiring(null)).toBe(true)
    expect(isJwtExpiring('garbage')).toBe(true)
  })
})
