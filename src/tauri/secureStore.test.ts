import { describe, expect, it } from 'vitest'
import { pluginSecretKey } from './secureStore'

describe('pluginSecretKey', () => {
  it('namespaces plugin secrets by plugin id', () => {
    expect(pluginSecretKey('com.example.plugin', 'token')).toBe('com.example.plugin.token')
  })

  it('cannot resolve to a host-owned `nevo:` secret', () => {
    expect(() => pluginSecretKey('nevo:ai', 'apiKey')).toThrow()
  })
})
