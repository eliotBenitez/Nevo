import { secureStore, SECRET_AI_API_KEY } from './secureStore'

// The key is stored together with the origin it was saved for, in one secret, so a
// key for one provider is never sent to a different endpoint after the base URL changes.
interface BoundKey {
  origin: string
  key: string
}

export function endpointOrigin(baseUrl: string): string | null {
  try {
    const { origin } = new URL(baseUrl)
    return origin === 'null' ? null : origin
  } catch {
    return null
  }
}

/** The stored key, or null when none is saved or it predates endpoint binding (a bare string). */
async function readBoundKey(): Promise<BoundKey | null> {
  const raw = await secureStore.get(SECRET_AI_API_KEY)
  if (raw === null) return null
  try {
    const parsed: unknown = JSON.parse(raw)
    if (parsed && typeof parsed === 'object') {
      const { origin, key } = parsed as Partial<BoundKey>
      if (typeof origin === 'string' && typeof key === 'string') return { origin, key }
    }
  } catch {
    // A legacy bare key: its endpoint is unknown, so it is never sent and must be saved again.
  }
  return null
}

/** The key, only when it was saved for `baseUrl`'s origin. */
export async function readAiApiKey(baseUrl: string): Promise<string | undefined> {
  const bound = await readBoundKey()
  return bound && bound.origin === endpointOrigin(baseUrl) ? bound.key : undefined
}

export async function hasAiApiKey(baseUrl: string): Promise<boolean> {
  return (await readAiApiKey(baseUrl)) !== undefined
}

export async function saveAiApiKey(baseUrl: string, key: string): Promise<void> {
  const origin = endpointOrigin(baseUrl)
  if (!origin) throw new Error('Invalid AI endpoint URL')
  await secureStore.set(SECRET_AI_API_KEY, JSON.stringify({ origin, key } satisfies BoundKey))
}

export async function deleteAiApiKey(): Promise<void> {
  await secureStore.delete(SECRET_AI_API_KEY)
}
