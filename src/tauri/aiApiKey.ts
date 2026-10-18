import { secureStore, SECRET_AI_API_KEY } from './secureStore'

// The origin the key was saved for, stored beside it so a key for one provider
// is never sent to a different endpoint after the base URL changes.
const SECRET_AI_API_KEY_ORIGIN = 'nevo:ai.apiKeyOrigin'

export function endpointOrigin(baseUrl: string): string | null {
  try {
    const { origin } = new URL(baseUrl)
    return origin === 'null' ? null : origin
  } catch {
    return null
  }
}

async function boundOrigin(): Promise<string | null> {
  return secureStore.get(SECRET_AI_API_KEY_ORIGIN)
}

/** The key, only when it was saved for `baseUrl`'s origin. */
export async function readAiApiKey(baseUrl: string): Promise<string | undefined> {
  const key = await secureStore.get(SECRET_AI_API_KEY)
  const origin = endpointOrigin(baseUrl)
  if (key === null || !origin) return undefined
  const bound = await boundOrigin()
  if (bound === null) {
    // Keys saved before endpoint binding belong to the endpoint in use when first read.
    await secureStore.set(SECRET_AI_API_KEY_ORIGIN, origin)
    return key
  }
  return bound === origin ? key : undefined
}

export async function hasAiApiKey(baseUrl: string): Promise<boolean> {
  if (await secureStore.get(SECRET_AI_API_KEY) === null) return false
  const bound = await boundOrigin()
  return bound === null || bound === endpointOrigin(baseUrl)
}

export async function saveAiApiKey(baseUrl: string, key: string): Promise<void> {
  const origin = endpointOrigin(baseUrl)
  if (!origin) throw new Error('Invalid AI endpoint URL')
  await secureStore.set(SECRET_AI_API_KEY, key)
  try {
    await secureStore.set(SECRET_AI_API_KEY_ORIGIN, origin)
  } catch (error) {
    // A new key left bound to the old origin would be sent there; drop it instead.
    await secureStore.delete(SECRET_AI_API_KEY).catch(() => {})
    throw error
  }
}

export async function deleteAiApiKey(): Promise<void> {
  await secureStore.delete(SECRET_AI_API_KEY)
  await secureStore.delete(SECRET_AI_API_KEY_ORIGIN)
}
