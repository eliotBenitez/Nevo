import { BridgeUnavailableError, readEndpoint, type Endpoint } from './endpoint.js'

/** Shape of every bridge response, success or failure. */
interface BridgeEnvelope {
  ok: boolean
  result?: unknown
  error?: { code?: string; message?: string }
}

/** A refusal from the bridge, carrying the machine-readable code. */
export class BridgeError extends Error {
  readonly code: string

  constructor(code: string, message: string) {
    super(message)
    this.name = 'BridgeError'
    this.code = code
  }
}

const REQUEST_TIMEOUT_MS = 30_000

/**
 * Calls one bridge method. The endpoint is re-read per call rather than cached:
 * the user can switch workspaces or toggle the bridge at any time, and a cached
 * port would then point at a listener that is gone — or, worse, at a different
 * workspace's bridge.
 */
export async function callBridge(
  method: string,
  params: Record<string, unknown> = {},
  env: NodeJS.ProcessEnv = process.env,
): Promise<unknown> {
  const endpoint = await readEndpoint(env)
  return callBridgeAt(endpoint, method, params)
}

export async function callBridgeAt(
  endpoint: Endpoint,
  method: string,
  params: Record<string, unknown> = {},
): Promise<unknown> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  let response: Response
  try {
    response = await fetch(`http://127.0.0.1:${endpoint.port}/rpc`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${endpoint.token}`,
      },
      body: JSON.stringify({ method, params }),
      signal: controller.signal,
    })
  } catch (error) {
    if ((error as Error).name === 'AbortError') {
      throw new BridgeUnavailableError(`Nevo did not respond within ${REQUEST_TIMEOUT_MS / 1000}s.`)
    }
    // A live endpoint file with a dead socket means Nevo exited without
    // cleaning up — most likely a crash or a force quit.
    throw new BridgeUnavailableError(
      'Could not reach Nevo. It may have been closed since the bridge was started.',
    )
  } finally {
    clearTimeout(timeout)
  }

  const text = await response.text()
  let envelope: BridgeEnvelope
  try {
    envelope = JSON.parse(text) as BridgeEnvelope
  } catch {
    throw new BridgeError('malformed_response', `Nevo returned a non-JSON response: ${text.slice(0, 200)}`)
  }

  if (!response.ok || envelope.ok !== true) {
    throw new BridgeError(
      envelope.error?.code ?? 'unknown',
      envelope.error?.message ?? `Nevo returned HTTP ${response.status}.`,
    )
  }

  return envelope.result
}
