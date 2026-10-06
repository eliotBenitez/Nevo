#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { appPid, assertQaAvdName, bootAvd, forwardDevtools, listEmulators, naturalDisplaySize, parseRotation, resolveSerial, runAdb, screencap } from './android-adb.mjs'
import { buildTapEvents, connectToAndroidPage, getAndroidMetadata } from './android-cdp.mjs'
import { buildKeyEvents } from './windows-cdp.mjs'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const PACKAGE_NAME = JSON.parse(readFileSync(resolve(REPO_ROOT, 'src-tauri/tauri.conf.json'), 'utf8')).identifier
const APK_CANDIDATES = [
  'src-tauri/gen/android/app/build/outputs/apk/universal/debug/app-universal-debug.apk',
  'src-tauri/gen/android/app/build/outputs/apk/x86_64/debug/app-x86_64-debug.apk',
]

const HELP = `Usage: node tools/visual-qa/android-qa.mjs [--avd NAME | --serial ID] [--target ID] <command>

Device (adb, QA emulators named nevo-* only):
  avds                           List running QA emulators.
  boot NAME [--wipe]             Start an AVD (nevo-phone, nevo-tablet) and wait for boot.
  kill                           Shut down the selected emulator.
  install [APK]                  Install the debug APK (default: Tauri debug build output).
  launch                         (Re)start Nevo and wait for its WebView debugger.
  stop-app                       Force-stop Nevo.
  shot PATH --device             Full-screen PNG incl. system bars and on-screen keyboard.
  tap-xy X Y                     Real touch tap in device pixels (system UI, keyboard).
  back                           Press the Android back button.
  rotate portrait|landscape      Lock screen orientation (also reverse-*).
  theme light|dark               Switch the system night mode.

Page (WebView DevTools over adb forward):
  status                         URL, viewport, DPR, env() and effective --safe-area-* insets, app metadata.
  shot PATH [--el CSS]           PNG of the WebView or a visible element.
  eval EXPRESSION                Evaluate JavaScript in the real page; prints JSON.
  tap CSS                        Touch-tap the first visible, unobscured matching element.
  type CSS TEXT [--clear]        Tap the element and insert text.
  key Control+k                  Press a keyboard chord (hardware keyboard semantics).
  wait CSS [--timeout 10000]     Wait for a matching element (maximum 10000 ms).
  nav '#/onboarding'             Set the SPA hash on the app origin.`

function parseArgs(args) {
  const options = { positional: [], flags: {} }
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      const key = args[i].slice(2)
      const value = args[i + 1]
      options.flags[key] = value !== undefined && !value.startsWith('--') ? args[++i] : true
    } else options.positional.push(args[i])
  }
  return options
}

const flagString = (value) => (typeof value === 'string' ? value : undefined)

function writePng(outputPath, data) {
  const path = resolve(outputPath)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, data)
  return { path }
}

async function evaluate(connection, expression, awaitPromise = false) {
  const response = await connection.send('Runtime.evaluate', { expression, awaitPromise, returnByValue: true })
  if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description ?? response.exceptionDetails.text ?? 'JavaScript evaluation failed')
  return response.result?.value
}

async function elementRect(connection, selector) {
  const rect = await evaluate(connection, `(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) throw new Error('No element matches selector: ' + ${JSON.stringify(selector)});
    el.scrollIntoView({ block: 'center', inline: 'center' });
    const r = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    return { x:r.x,y:r.y,width:r.width,height:r.height,scrollX:window.pageXOffset,scrollY:window.pageYOffset,display:style.display,visibility:style.visibility,opacity:Number(style.opacity) };
  })()`)
  if (!rect || rect.width <= 0 || rect.height <= 0 || rect.display === 'none' || rect.visibility === 'hidden' || rect.opacity === 0) {
    throw new Error(`Element is not visible: ${selector}`)
  }
  return rect
}

async function tapElement(connection, selector) {
  const rect = await elementRect(connection, selector)
  const x = rect.x + rect.width / 2
  const y = rect.y + rect.height / 2
  const hit = await evaluate(connection, `(() => { const el=document.querySelector(${JSON.stringify(selector)}); const hit=document.elementFromPoint(${x},${y}); return !!hit && (hit===el || el.contains(hit)); })()`)
  if (!hit) throw new Error(`Element is covered by another element: ${selector}`)
  for (const params of buildTapEvents(x, y)) await connection.send('Input.dispatchTouchEvent', params)
  return { tapped: selector, x: Math.round(x), y: Math.round(y) }
}

async function press(connection, chord) {
  for (const params of buildKeyEvents(chord)) await connection.send('Input.dispatchKeyEvent', params)
}

async function runPageCommand(connection, command, positional, flags, metadata) {
  await connection.send('Page.enable')
  await connection.send('Runtime.enable')
  switch (command) {
    case 'status':
      return {
        url: await evaluate(connection, 'location.href'),
        viewport: await evaluate(connection, `(() => { const probe=document.createElement('div'); probe.style.cssText='position:fixed;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)'; document.body.appendChild(probe); const s=getComputedStyle(probe); const insets={top:s.paddingTop,right:s.paddingRight,bottom:s.paddingBottom,left:s.paddingLeft}; probe.style.padding='var(--safe-area-top,0px) var(--safe-area-right,0px) var(--safe-area-bottom,0px) var(--safe-area-left,0px)'; const e=getComputedStyle(probe); const effective={top:e.paddingTop,right:e.paddingRight,bottom:e.paddingBottom,left:e.paddingLeft}; probe.remove(); return { width:innerWidth, height:innerHeight, deviceScaleFactor:devicePixelRatio, colorScheme: matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light', coarsePointer: matchMedia('(pointer: coarse)').matches, safeArea: insets, effectiveSafeArea: effective } })()`),
        metadata,
      }
    case 'eval': {
      const source = positional.join(' ')
      if (!source) throw new Error('eval requires an expression')
      return evaluate(connection, source, true)
    }
    case 'tap':
      if (!positional[0]) throw new Error('tap requires a CSS selector')
      return tapElement(connection, positional[0])
    case 'type': {
      const [selector, ...words] = positional
      if (!selector || !words.length) throw new Error('type requires CSS and TEXT')
      await tapElement(connection, selector)
      if (flags.clear) { await press(connection, 'Control+a'); await press(connection, 'Backspace') }
      await connection.send('Input.insertText', { text: words.join(' ') })
      return { typed: selector }
    }
    case 'key':
      if (!positional[0]) throw new Error('key requires a chord such as Control+k')
      await press(connection, positional[0])
      return { pressed: positional[0] }
    case 'wait': {
      const selector = positional[0]
      const timeout = Number(flags.timeout ?? 10_000)
      if (!selector || !Number.isFinite(timeout) || timeout < 0 || timeout > 10_000) throw new Error('wait requires CSS and --timeout between 0 and 10000 ms')
      const deadline = Date.now() + timeout
      while (true) {
        if (await evaluate(connection, `!!document.querySelector(${JSON.stringify(selector)})`)) return { found: true, selector }
        if (Date.now() >= deadline) throw new Error(`Timed out waiting for selector ${selector}`)
        await new Promise((done) => setTimeout(done, Math.min(100, deadline - Date.now())))
      }
    }
    case 'nav': {
      const hash = positional[0]
      if (!hash || !hash.startsWith('#')) throw new Error("nav requires a hash such as '#/onboarding'")
      return evaluate(connection, `(() => { if (location.hostname !== 'tauri.localhost') throw new Error('Navigation is restricted to the app origin'); location.hash=${JSON.stringify(hash)}; return location.href })()`)
    }
    case 'shot': {
      if (!positional[0]) throw new Error('shot requires PATH')
      let clip
      if (typeof flags.el === 'string') {
        const rect = await elementRect(connection, flags.el)
        clip = { x: rect.x + rect.scrollX, y: rect.y + rect.scrollY, width: rect.width, height: rect.height, scale: 1 }
      }
      const response = await connection.send('Page.captureScreenshot', { format: 'png', fromSurface: true, ...(clip ? { clip, captureBeyondViewport: true } : {}) })
      return writePng(positional[0], Buffer.from(response.data, 'base64'))
    }
    default:
      throw new Error(`Unknown command: ${command}\n\n${HELP}`)
  }
}

async function waitForDevtools(serial, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs
  let lastError
  while (Date.now() < deadline) {
    try {
      const { port } = await forwardDevtools(serial, PACKAGE_NAME)
      const { connection } = await connectToAndroidPage(port)
      try { return await getAndroidMetadata(connection) } finally { connection.close() }
    } catch (error) { lastError = error }
    await new Promise((done) => setTimeout(done, 1000))
  }
  throw new Error(`Nevo WebView debugger did not become ready: ${lastError?.message ?? 'timeout'}`)
}

async function runDeviceCommand(command, positional, flags) {
  if (command === 'avds') return listEmulators()
  if (command === 'boot') return bootAvd(assertQaAvdName(positional[0]), { wipe: Boolean(flags.wipe) })

  const serial = await resolveSerial({ serial: flagString(flags.serial), avd: flagString(flags.avd) })
  switch (command) {
    case 'kill':
      await runAdb(['emu', 'kill'], { serial })
      return { killed: serial }
    case 'install': {
      const apk = positional[0] ?? APK_CANDIDATES.map((path) => resolve(REPO_ROOT, path)).find((path) => existsSync(path))
      if (!apk || !existsSync(apk)) throw new Error('Debug APK not found; build it with: pnpm tauri android build --debug --apk --target x86_64')
      await runAdb(['install', '-r', '-t', resolve(apk)], { serial, timeoutMs: 300_000 })
      return { installed: resolve(apk), serial }
    }
    case 'launch': {
      await runAdb(['shell', 'am', 'force-stop', PACKAGE_NAME], { serial })
      await runAdb(['shell', 'am', 'start', '-W', '-n', `${PACKAGE_NAME}/.MainActivity`], { serial })
      return { serial, metadata: await waitForDevtools(serial) }
    }
    case 'stop-app':
      await runAdb(['shell', 'am', 'force-stop', PACKAGE_NAME], { serial })
      return { stopped: PACKAGE_NAME, serial }
    case 'tap-xy': {
      const [x, y] = positional.map(Number)
      if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0) throw new Error('tap-xy requires integer device-pixel X Y')
      await runAdb(['shell', 'input', 'tap', String(x), String(y)], { serial })
      return { tapped: [x, y], serial }
    }
    case 'back':
      await runAdb(['shell', 'input', 'keyevent', 'KEYCODE_BACK'], { serial })
      return { back: serial }
    case 'rotate': {
      const rotation = parseRotation(positional[0], await naturalDisplaySize(serial))
      await runAdb(['shell', 'settings', 'put', 'system', 'accelerometer_rotation', '0'], { serial })
      await runAdb(['shell', 'settings', 'put', 'system', 'user_rotation', String(rotation)], { serial })
      return { rotation: positional[0], serial }
    }
    case 'theme': {
      if (!['light', 'dark'].includes(positional[0])) throw new Error('theme requires light | dark')
      await runAdb(['shell', 'cmd', 'uimode', 'night', positional[0] === 'dark' ? 'yes' : 'no'], { serial })
      return { theme: positional[0], serial }
    }
    case 'shot':
      if (flags.device) {
        if (!positional[0]) throw new Error('shot requires PATH')
        return { ...writePng(positional[0], await screencap(serial)), serial }
      }
      // Without --device a shot captures the WebView through DevTools.
      // falls through
    default: {
      if (!(await appPid(serial, PACKAGE_NAME))) throw new Error(`Nevo is not running on ${serial}; run: launch`)
      const { port } = await forwardDevtools(serial, PACKAGE_NAME)
      const { connection } = await connectToAndroidPage(port, flagString(flags.target))
      try {
        const metadata = await getAndroidMetadata(connection)
        return await runPageCommand(connection, command, positional, flags, metadata)
      } finally {
        connection.close()
      }
    }
  }
}

async function main(args) {
  const { positional, flags } = parseArgs(args)
  const command = positional.shift()
  if (!command || command === 'help' || flags.help) { console.log(HELP); return }
  const result = await runDeviceCommand(command, positional, flags)
  if (result !== undefined) console.log(JSON.stringify(result, null, 2))
}

main(process.argv.slice(2)).catch((error) => {
  console.error(error.message)
  process.exitCode = 1
})
