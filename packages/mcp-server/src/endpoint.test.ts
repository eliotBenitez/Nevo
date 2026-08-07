import { describe, expect, it } from 'vitest'
import { join } from 'node:path'

import { BridgeUnavailableError, endpointPath, parseEndpoint, readEndpoint } from './endpoint.js'

describe('endpointPath', () => {
  it('prefers an explicit override', () => {
    expect(endpointPath({ NEVO_MCP_ENDPOINT: '/custom/endpoint.json' })).toBe('/custom/endpoint.json')
  })

  it('resolves under the platform config directory', () => {
    const path = endpointPath({ HOME: '/home/u', XDG_CONFIG_HOME: '/home/u/.config' })
    // The exact prefix is platform-specific; the identifier and filename are not.
    expect(path).toContain('com.eliotBenitezhvat.nevo')
    expect(path.endsWith('mcp-endpoint.json')).toBe(true)
  })

  it.runIf(process.platform === 'linux')('honours XDG_CONFIG_HOME on Linux', () => {
    expect(endpointPath({ HOME: '/home/u', XDG_CONFIG_HOME: '/xdg' })).toBe(
      join('/xdg', 'com.eliotBenitezhvat.nevo', 'mcp-endpoint.json'),
    )
  })
})

describe('parseEndpoint', () => {
  const valid = JSON.stringify({
    port: 51234,
    token: 'abc',
    pid: 99,
    workspacePath: '/home/u/notes',
    mode: 'read-only',
  })

  it('accepts a well-formed descriptor', () => {
    expect(parseEndpoint(valid)).toEqual({
      port: 51234,
      token: 'abc',
      pid: 99,
      workspacePath: '/home/u/notes',
      mode: 'read-only',
    })
  })

  it('rejects malformed JSON and non-objects', () => {
    expect(() => parseEndpoint('not json')).toThrow(BridgeUnavailableError)
    expect(() => parseEndpoint('"a string"')).toThrow(BridgeUnavailableError)
  })

  it('rejects a descriptor without a usable port or token', () => {
    expect(() => parseEndpoint(JSON.stringify({ token: 'abc' }))).toThrow(/port/)
    expect(() => parseEndpoint(JSON.stringify({ port: 0, token: 'abc' }))).toThrow(/port/)
    expect(() => parseEndpoint(JSON.stringify({ port: 70000, token: 'abc' }))).toThrow(/port/)
    expect(() => parseEndpoint(JSON.stringify({ port: 1234 }))).toThrow(/token/)
  })

  it('falls back to off for an unrecognised mode', () => {
    const parsed = parseEndpoint(JSON.stringify({ port: 1, token: 't', mode: 'full-access' }))
    expect(parsed.mode).toBe('off')
  })
})

describe('readEndpoint', () => {
  it('explains that Nevo is not running when the file is absent', async () => {
    await expect(
      readEndpoint({ NEVO_MCP_ENDPOINT: '/nonexistent/nevo-endpoint.json' }),
    ).rejects.toThrow(/Nevo is not running/)
  })
})
