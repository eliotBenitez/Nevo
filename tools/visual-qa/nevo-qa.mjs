#!/usr/bin/env node
// Visual QA driver for the real Tauri/WebKitGTK app, usable by any agent from a shell.
// `start` boots an isolated headless GNOME session (tools/visual-qa/session.sh),
// the Vite dev server if needed, and a WebDriver session that launches the debug
// binary. Later commands (shot, eval, click, type, key, resize, wait) talk to that
// session through the state file in `.qa/`. Run `node tools/visual-qa/nevo-qa.mjs help`.
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { WebDriver } from './webdriver.mjs'

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(SCRIPT_DIR, '../..')
const QA_DIR = join(REPO_ROOT, '.qa')
const STATE_FILE = join(QA_DIR, 'state.json')
const DEV_URL = 'http://localhost:1420'
const DEFAULTS = { size: '1440x900', port: '4444', app: join(REPO_ROOT, 'src-tauri/target/debug/nevo') }

const HELP = `Usage: node tools/visual-qa/nevo-qa.mjs <command> [args]

  start [--size WxH] [--port N] [--app PATH] [--profile DIR] [--fresh] [--color-scheme default|prefer-dark|prefer-light]
                       Boot headless GNOME + Vite (if 1420 is free) + the Tauri debug app.
                       Profile (app data, dconf, keyring) defaults to .qa/profile.
  stop                 Close the app, GNOME session, and the Vite server started by 'start'.
  status               Print the running session, current URL and window size.
  shot FILE [--el CSS] Save a PNG of the whole webview or one element.
  eval JS [--async]    Run JS in the page; bare expressions are returned. Prints JSON.
  click CSS            Click the first element matching CSS.
  type CSS TEXT [--clear]
                       Focus CSS and type TEXT (appends unless --clear).
  key CHORD            Press keys on the focused element, e.g. Escape, Enter, Control+k, ArrowDown.
  resize WxH           Resize the window (bounded by the virtual monitor size).
  nav HASH             Navigate the SPA, e.g. nav '#/onboarding'.
  wait CSS [--timeout MS]
                       Wait until CSS matches an element (default 10000 ms).
`

function parseArgs(argv) {
  const positional = []
  const flags = {}
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg.startsWith('--')) {
      const name = arg.slice(2)
      const next = argv[i + 1]
      if (next === undefined || next.startsWith('--')) flags[name] = true
      else flags[name] = argv[++i]
    } else {
      positional.push(arg)
    }
  }
  return { positional, flags }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function waitFor(check, timeoutMs, label) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await check()) return
    await sleep(200)
  }
  throw new Error(`Timed out waiting for ${label}`)
}

async function httpOk(url) {
  try {
    return (await fetch(url)).ok
  } catch {
    return false
  }
}

function readState() {
  if (!existsSync(STATE_FILE)) throw new Error('No QA session. Run `start` first.')
  return JSON.parse(readFileSync(STATE_FILE, 'utf8'))
}

function driverFromState() {
  const state = readState()
  return new WebDriver(state.port, state.sessionId)
}

function killGroup(pid) {
  if (!pid) return
  try {
    process.kill(-pid, 'SIGTERM')
  } catch {
    // Already gone.
  }
}

function requireTools() {
  const missing = ['gnome-shell', 'dbus-run-session', 'WebKitWebDriver'].filter(
    (tool) => spawnSync('sh', ['-c', `command -v ${tool}`]).status !== 0,
  )
  if (missing.length) throw new Error(`Missing tools: ${missing.join(', ')} (Linux + GNOME + webkit2gtk-4.1 driver required)`)
}

function spawnDetached(command, args, { cwd, env, logFile }) {
  const out = openSync(logFile, 'a')
  const child = spawn(command, args, { cwd, env, detached: true, stdio: ['ignore', out, out] })
  child.unref()
  return child.pid
}

async function start(flags) {
  requireTools()
  if (existsSync(STATE_FILE)) throw new Error('A QA session is already recorded. Run `stop` first.')
  const size = flags.size ?? DEFAULTS.size
  const port = String(flags.port ?? DEFAULTS.port)
  const app = resolve(flags.app ?? DEFAULTS.app)
  if (!existsSync(app)) {
    throw new Error(`App binary not found: ${app}\nBuild it with: cargo build --manifest-path src-tauri/Cargo.toml`)
  }
  const profile = resolve(flags.profile ?? join(QA_DIR, 'profile'))
  if (flags.fresh) rmSync(profile, { recursive: true, force: true })
  const logDir = join(QA_DIR, 'logs')
  mkdirSync(logDir, { recursive: true })
  mkdirSync(profile, { recursive: true })

  // Keep the runtime dir short: Wayland socket paths are limited to 108 bytes.
  const runtimeDir = `/tmp/nevo-qa-${process.getuid()}-${port}`
  rmSync(runtimeDir, { recursive: true, force: true })
  mkdirSync(runtimeDir, { mode: 0o700 })

  let vitePid = null
  if (!(await httpOk(DEV_URL))) {
    vitePid = spawnDetached('pnpm', ['dev'], { cwd: REPO_ROOT, env: process.env, logFile: join(logDir, 'vite.log') })
    await waitFor(() => httpOk(DEV_URL), 60_000, `Vite on ${DEV_URL} (see .qa/logs/vite.log)`)
  }

  const sessionPid = spawnDetached('dbus-run-session', ['--', 'bash', join(SCRIPT_DIR, 'session.sh')], {
    cwd: REPO_ROOT,
    env: {
      ...process.env,
      XDG_RUNTIME_DIR: runtimeDir,
      QA_PROFILE: profile,
      QA_LOG_DIR: logDir,
      QA_PORT: port,
      QA_SIZE: size,
      QA_WAYLAND_DISPLAY: `nevo-qa-${port}`,
      QA_COLOR_SCHEME: typeof flags['color-scheme'] === 'string' ? flags['color-scheme'] : '',
    },
    logFile: join(logDir, 'session.log'),
  })

  const state = { port, sessionPid, vitePid, runtimeDir, profile, app, size, sessionId: null }
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2))
  const driver = new WebDriver(port)
  try {
    await waitFor(() => driver.ready(), 30_000, 'WebKitWebDriver (see .qa/logs/)')
    await driver.createSession(app)
    state.sessionId = driver.sessionId
    writeFileSync(STATE_FILE, JSON.stringify(state, null, 2))
    await waitFor(
      async () => (await driver.execute('return document.readyState')) === 'complete',
      60_000,
      'the app document to load',
    )
  } catch (error) {
    await stop()
    throw error
  }
  console.log(JSON.stringify({ started: true, url: await driver.url(), size, profile }, null, 2))
}

async function stop() {
  if (!existsSync(STATE_FILE)) {
    console.log('No QA session recorded.')
    return
  }
  const state = readState()
  if (state.sessionId) {
    await new WebDriver(state.port, state.sessionId).deleteSession().catch(() => {})
  }
  killGroup(state.sessionPid)
  killGroup(state.vitePid)
  await sleep(500)
  rmSync(state.runtimeDir, { recursive: true, force: true })
  rmSync(STATE_FILE, { force: true })
  console.log('QA session stopped.')
}

async function status() {
  const state = readState()
  const driver = new WebDriver(state.port, state.sessionId)
  console.log(JSON.stringify({ ...state, url: await driver.url(), window: await driver.windowRect() }, null, 2))
}

async function main() {
  const [command, ...rest] = process.argv.slice(2)
  const { positional, flags } = parseArgs(rest)
  switch (command) {
    case 'start':
      return start(flags)
    case 'stop':
      return stop()
    case 'status':
      return status()
    case 'shot': {
      if (!positional[0]) throw new Error('shot FILE [--el CSS]')
      const driver = driverFromState()
      const element = typeof flags.el === 'string' ? await driver.find(flags.el) : null
      const out = resolve(positional[0])
      mkdirSync(dirname(out), { recursive: true })
      writeFileSync(out, await driver.screenshot(element))
      console.log(out)
      return
    }
    case 'eval': {
      const source = positional.join(' ')
      // Expressions are returned; statement bodies (starting with a keyword) run as-is.
      const isBody = /^\s*(return|const|let|var|if|for|while|await|throw)\b/.test(source)
      const script = isBody ? source : `return (${source})`
      const result = await driverFromState().execute(script, [], { async: Boolean(flags.async) })
      console.log(JSON.stringify(result, null, 2))
      return
    }
    case 'click': {
      const driver = driverFromState()
      await driver.click(await driver.find(positional[0]))
      return
    }
    case 'type': {
      const driver = driverFromState()
      const element = await driver.find(positional[0])
      await driver.click(element)
      if (flags.clear) await driver.clear(element)
      await driver.sendKeys(element, positional.slice(1).join(' '))
      return
    }
    case 'key':
      return driverFromState().pressChord(positional[0])
    case 'resize': {
      const [width, height] = String(positional[0] ?? '').split('x').map(Number)
      if (!width || !height) throw new Error('resize WxH')
      console.log(JSON.stringify(await driverFromState().setWindowRect({ width, height })))
      return
    }
    case 'nav': {
      const hash = positional[0]?.startsWith('#') ? positional[0] : `#${positional[0] ?? '/'}`
      await driverFromState().execute('location.hash = arguments[0]', [hash])
      return
    }
    case 'wait': {
      const driver = driverFromState()
      const timeout = Number(flags.timeout ?? 10_000)
      await waitFor(
        async () => Boolean(await driver.execute('return !!document.querySelector(arguments[0])', [positional[0]])),
        timeout,
        `selector ${positional[0]}`,
      )
      return
    }
    default:
      console.log(HELP)
  }
}

main().catch((error) => {
  console.error(error.message)
  process.exit(1)
})
