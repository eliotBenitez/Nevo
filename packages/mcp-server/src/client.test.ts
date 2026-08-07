import { afterEach, describe, expect, it } from 'vitest'
import { createServer, type Server } from 'node:http'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { BridgeError, callBridge } from './client.js'

interface Stub {
  server: Server
  endpointFile: string
  /** Requests the stub received, so tests can assert on the wire format. */
  received: { authorization?: string; body: string }[]
}

const stubs: Stub[] = []

/** Stands in for the Rust bridge: one loopback listener plus an endpoint file. */
async function startStubBridge(
  respond: (body: string) => { status: number; payload: unknown },
  token = 'test-token',
): Promise<Stub> {
  const received: Stub['received'] = []
  const server = createServer((request, response) => {
    let body = ''
    request.on('data', chunk => { body += chunk })
    request.on('end', () => {
      received.push({ authorization: request.headers.authorization, body })
      const { status, payload } = respond(body)
      response.writeHead(status, { 'content-type': 'application/json' })
      response.end(JSON.stringify(payload))
    })
  })

  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (typeof address === 'string' || address === null) throw new Error('no port')

  const dir = await mkdtemp(join(tmpdir(), 'nevo-mcp-'))
  const endpointFile = join(dir, 'mcp-endpoint.json')
  await writeFile(
    endpointFile,
    JSON.stringify({
      port: address.port,
      token,
      pid: process.pid,
      workspacePath: '/tmp/vault',
      mode: 'read-only',
    }),
  )

  const stub: Stub = { server, endpointFile, received }
  stubs.push(stub)
  return stub
}

afterEach(async () => {
  await Promise.all(
    stubs.splice(0).map(stub => new Promise<void>(resolve => stub.server.close(() => resolve()))),
  )
})

describe('callBridge', () => {
  it('sends the bearer token and method, and unwraps the result', async () => {
    const stub = await startStubBridge(() => ({
      status: 200,
      payload: { ok: true, result: { notes: [], total: 0 } },
    }))

    const result = await callBridge(
      'notes.list',
      { limit: 5 },
      { NEVO_MCP_ENDPOINT: stub.endpointFile },
    )

    expect(result).toEqual({ notes: [], total: 0 })
    expect(stub.received[0]?.authorization).toBe('Bearer test-token')
    expect(JSON.parse(stub.received[0]?.body ?? '{}')).toEqual({
      method: 'notes.list',
      params: { limit: 5 },
    })
  })

  it('surfaces the bridge error code so the agent can react to it', async () => {
    const stub = await startStubBridge(() => ({
      status: 403,
      payload: { ok: false, error: { code: 'read_only', message: 'Bridge is read-only.' } },
    }))

    await expect(
      callBridge('notes.create', {}, { NEVO_MCP_ENDPOINT: stub.endpointFile }),
    ).rejects.toMatchObject({ code: 'read_only', message: 'Bridge is read-only.' })
  })

  it('treats a 200 with ok:false as a failure', async () => {
    const stub = await startStubBridge(() => ({
      status: 200,
      payload: { ok: false, error: { code: 'not_found', message: 'No such note.' } },
    }))

    await expect(
      callBridge('notes.read', { noteId: 'x' }, { NEVO_MCP_ENDPOINT: stub.endpointFile }),
    ).rejects.toBeInstanceOf(BridgeError)
  })

  it('reports a dead socket as Nevo being closed', async () => {
    const stub = await startStubBridge(() => ({ status: 200, payload: { ok: true, result: null } }))
    await new Promise<void>(resolve => stub.server.close(() => resolve()))
    stubs.length = 0

    await expect(
      callBridge('workspace.info', {}, { NEVO_MCP_ENDPOINT: stub.endpointFile }),
    ).rejects.toThrow(/may have been closed/)
  })
})
