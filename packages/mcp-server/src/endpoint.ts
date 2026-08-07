import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

/**
 * Must match `identifier` in `src-tauri/tauri.conf.json` — Tauri derives the
 * config directory from it, and that directory is where the bridge writes its
 * endpoint file.
 */
const APP_IDENTIFIER = 'com.eliotBenitezhvat.nevo'

const ENDPOINT_FILE_NAME = 'mcp-endpoint.json'

export type McpMode = 'off' | 'read-only' | 'ask' | 'auto'

export interface Endpoint {
  port: number
  token: string
  pid: number
  workspacePath: string
  mode: McpMode
}

/** Raised when Nevo is not running, or is running with the bridge disabled. */
export class BridgeUnavailableError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'BridgeUnavailableError'
  }
}

/**
 * Mirrors Tauri v2's `app_config_dir` so the server finds the same file the
 * bridge wrote. `NEVO_MCP_ENDPOINT` overrides the whole lookup, which is what
 * a portable or sandboxed install needs.
 */
export function endpointPath(env: NodeJS.ProcessEnv = process.env): string {
  const override = env.NEVO_MCP_ENDPOINT
  if (override) return override

  const home = env.HOME ?? env.USERPROFILE ?? homedir()

  if (process.platform === 'win32') {
    const appData = env.APPDATA ?? join(home, 'AppData', 'Roaming')
    return join(appData, APP_IDENTIFIER, ENDPOINT_FILE_NAME)
  }
  if (process.platform === 'darwin') {
    return join(home, 'Library', 'Application Support', APP_IDENTIFIER, ENDPOINT_FILE_NAME)
  }
  const configHome = env.XDG_CONFIG_HOME ?? join(home, '.config')
  return join(configHome, APP_IDENTIFIER, ENDPOINT_FILE_NAME)
}

const VALID_MODES: readonly McpMode[] = ['off', 'read-only', 'ask', 'auto']

/** Validates the on-disk descriptor without trusting its shape. */
export function parseEndpoint(raw: string): Endpoint {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new BridgeUnavailableError('The Nevo endpoint file is not valid JSON. Restart Nevo.')
  }

  if (typeof parsed !== 'object' || parsed === null) {
    throw new BridgeUnavailableError('The Nevo endpoint file is malformed. Restart Nevo.')
  }

  const record = parsed as Record<string, unknown>
  const { port, token, pid, workspacePath, mode } = record

  if (typeof port !== 'number' || !Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new BridgeUnavailableError('The Nevo endpoint file has no usable port. Restart Nevo.')
  }
  if (typeof token !== 'string' || token.length === 0) {
    throw new BridgeUnavailableError('The Nevo endpoint file has no access token. Restart Nevo.')
  }

  return {
    port,
    token,
    pid: typeof pid === 'number' ? pid : 0,
    workspacePath: typeof workspacePath === 'string' ? workspacePath : '',
    mode: VALID_MODES.includes(mode as McpMode) ? (mode as McpMode) : 'off',
  }
}

/**
 * Reads the endpoint descriptor. The bridge removes this file when it stops, so
 * a missing file means "no bridge to talk to" rather than a broken install.
 */
export async function readEndpoint(env: NodeJS.ProcessEnv = process.env): Promise<Endpoint> {
  const path = endpointPath(env)
  let raw: string
  try {
    raw = await readFile(path, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new BridgeUnavailableError(
        'Nevo is not running, or its MCP bridge is turned off. Open Nevo and enable the MCP bridge in Settings.',
      )
    }
    throw new BridgeUnavailableError(
      `Could not read the Nevo endpoint file at ${path}: ${(error as Error).message}`,
    )
  }
  return parseEndpoint(raw)
}
