// OpenRouter is a settings preset over the OpenAI-compatible API kind, not a
// separate provider: requests still go through `providerKind: 'openai'`.
export const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1'

export function isOpenRouterUrl(baseUrl: string): boolean {
  try {
    return new URL(baseUrl).hostname.toLowerCase() === 'openrouter.ai'
  } catch {
    return false
  }
}

/** OpenRouter publishes its no-cost variants with a `:free` id suffix. */
export function freeOpenRouterModels(ids: string[]): string[] {
  return ids.filter(id => id.endsWith(':free')).sort((a, b) => a.localeCompare(b))
}
