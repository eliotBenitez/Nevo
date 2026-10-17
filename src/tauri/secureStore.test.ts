import { describe, expect, it } from 'vitest'
import { pluginSecretKey, SECRET_AI_API_KEY } from './secureStore'

describe('pluginSecretKey', () => {
  it('namespaces plugin secrets by plugin id', () => {
    expect(pluginSecretKey('com.example.plugin', 'token')).toBe('com.example.plugin.token')
  })

  it('cannot resolve to the host AI key', () => {
    expect(() => pluginSecretKey('nevo:ai', 'apiKey')).toThrow()
    expect(SECRET_AI_API_KEY).toContain(':')
  })
})
