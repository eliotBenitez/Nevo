#!/usr/bin/env node
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { applyViewportOverride, buildKeyEvents, connectToPage, getQaMetadata, saveViewportOverride } from './windows-cdp.mjs'

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const VIEWPORT_STATE = resolve(SCRIPT_DIR, '../../.qa/windows/viewport.json')

const HELP = `Usage: node tools/visual-qa/windows-qa.mjs --port 9223 [--target ID] <command>

  status                         Print URL, viewport, target and isolated app metadata.
  shot PATH [--el CSS]           Save a PNG of the page or visible element.
  eval EXPRESSION                Evaluate JavaScript in the real page; prints JSON.
  click CSS                      Click the first visible, unobscured matching element.
  type CSS TEXT [--clear]         Focus and type text through native CDP keyboard input.
  key Control+k                  Press a native keyboard chord.
  resize 1000x800                Emulate a viewport size (does not resize the OS window).
  wait CSS [--timeout 10000]      Wait for a matching element (maximum 10000 ms).
  nav '#/onboarding'              Set the SPA hash on the local development origin.

Every command requires a page running in a separately configured .qa profile whose
get_app_metadata configPath contains com.eliotBenitezhvat.nevo.qa.`

const USAGE_ERROR = 'Command usage: status | shot PATH [--el CSS] | eval EXPRESSION | click CSS | type CSS TEXT [--clear] | key CHORD | resize WxH | wait CSS [--timeout MS] | nav HASH'

function parseArgs(args) {
  const options = { positional: [], flags: {} }
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      const key = args[i].slice(2)
      const value = args[i + 1]
      options.flags[key] = value && !value.startsWith('--') ? args[++i] : true
    } else options.positional.push(args[i])
  }
  return options
}

function expressionResult(value, method) {
  const details = value.exceptionDetails
  if (details) throw new Error(details.exception?.description ?? details.text ?? `${method} failed`)
  return value.result?.value
}

async function evaluate(connection, expression, awaitPromise = false) {
  const response = await connection.send('Runtime.evaluate', { expression, awaitPromise, returnByValue: true })
  return expressionResult(response, 'JavaScript evaluation')
}

async function elementRect(connection, selector, { scroll = false } = {}) {
  const result = await evaluate(connection, `(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) throw new Error('No element matches selector: ' + ${JSON.stringify(selector)});
    if (${scroll}) el.scrollIntoView({ block: 'center', inline: 'center' });
    const r = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    return { x:r.x,y:r.y,width:r.width,height:r.height,scrollX:window.pageXOffset,scrollY:window.pageYOffset,display:style.display,visibility:style.visibility,opacity:Number(style.opacity) };
  })()`)
  if (!result || result.width <= 0 || result.height <= 0 || result.display === 'none' || result.visibility === 'hidden' || result.opacity === 0) {
    throw new Error(`Element is not visible: ${selector}`)
  }
  return result
}

async function clickAt(connection, selector) {
  const rect = await elementRect(connection, selector, { scroll: true })
  const x = rect.x + rect.width / 2
  const y = rect.y + rect.height / 2
  const hit = await evaluate(connection, `(() => { const el=document.querySelector(${JSON.stringify(selector)}); const hit=document.elementFromPoint(${x},${y}); return !!hit && (hit===el || el.contains(hit)); })()`)
  if (!hit) throw new Error(`Element is covered by another element: ${selector}`)
  await connection.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y })
  await connection.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 })
  await connection.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 })
}

async function press(connection, chord) {
  for (const params of buildKeyEvents(chord)) {
    await connection.send('Input.dispatchKeyEvent', params)
  }
}

async function run(connection, command, positional, flags, metadata) {
  await connection.send('Page.enable')
  await connection.send('Runtime.enable')
  switch (command) {
    case 'status':
      return { targetId: flags.target ?? undefined, url: await evaluate(connection, 'location.href'), title: await evaluate(connection, 'document.title'), viewport: await evaluate(connection, '({width:innerWidth,height:innerHeight,deviceScaleFactor:devicePixelRatio})'), metadata }
    case 'eval': {
      const source = positional.join(' ')
      if (!source) throw new Error(USAGE_ERROR)
      return await evaluate(connection, source, true)
    }
    case 'click':
      if (!positional[0]) throw new Error(USAGE_ERROR)
      return clickAt(connection, positional[0])
    case 'type': {
      const [selector, ...words] = positional
      if (!selector || !words.length) throw new Error(USAGE_ERROR)
      await clickAt(connection, selector)
      if (flags.clear) { await press(connection, 'Control+a'); await press(connection, 'Backspace') }
      await connection.send('Input.insertText', { text: words.join(' ') })
      return
    }
    case 'key':
      if (!positional[0]) throw new Error(USAGE_ERROR)
      return press(connection, positional[0])
    case 'resize': {
      const match = /^(\d{1,4})x(\d{1,4})$/i.exec(positional[0] ?? '')
      if (!match || Number(match[1]) < 1 || Number(match[2]) < 1) throw new Error('resize requires WxH with positive dimensions')
      const width = Number(match[1]); const height = Number(match[2])
      await connection.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false })
      return { width, height, mode: 'viewport emulation; OS window unchanged' }
    }
    case 'wait': {
      const selector = positional[0]
      const timeout = Number(flags.timeout ?? 10_000)
      if (!selector || !Number.isFinite(timeout) || timeout < 0 || timeout > 10_000) throw new Error('wait requires CSS and --timeout between 0 and 10000 ms')
      const deadline = Date.now() + timeout
      while (true) {
        if (await evaluate(connection, `!!document.querySelector(${JSON.stringify(selector)})`)) return { found: true, selector }
        if (Date.now() >= deadline) throw new Error(`Timed out waiting for selector ${selector}`)
        await new Promise((resolve) => setTimeout(resolve, Math.min(100, deadline - Date.now())))
      }
    }
    case 'nav': {
      const hash = positional[0]
      if (!hash || !hash.startsWith('#')) throw new Error("nav requires a hash such as '#/onboarding'")
      return evaluate(connection, `(() => { if (!['http://localhost:1420','http://127.0.0.1:1420'].includes(location.origin)) throw new Error('Navigation is restricted to the local dev origin'); location.hash=${JSON.stringify(hash)}; return location.href })()`)
    }
    case 'shot': {
      const outputPath = positional[0]
      if (!outputPath) throw new Error(USAGE_ERROR)
      let clip
      if (flags.el) {
        const rect = await elementRect(connection, flags.el, { scroll: true })
        clip = { x: rect.x + rect.scrollX, y: rect.y + rect.scrollY, width: rect.width, height: rect.height, scale: 1 }
      }
      const response = await connection.send('Page.captureScreenshot', { format: 'png', fromSurface: true, ...(clip ? { clip, captureBeyondViewport: true } : {}) })
      const path = resolve(outputPath)
      mkdirSync(dirname(path), { recursive: true })
      writeFileSync(path, Buffer.from(response.data, 'base64'))
      return { path }
    }
    default:
      throw new Error(HELP)
  }
}

async function main(args) {
  const { positional, flags } = parseArgs(args)
  const command = positional.shift()
  if (!command || command === 'help' || command === '--help') { console.log(HELP); return }
  if (!flags.port || flags.port === true) throw new Error('Pass --port PORT for the WebView2 debugging endpoint')
  const { target, connection } = await connectToPage(flags.port, typeof flags.target === 'string' ? flags.target : undefined)
  try {
    const metadata = await getQaMetadata(connection)
    if (command !== 'resize') await applyViewportOverride(connection, VIEWPORT_STATE, target.id, metadata)
    const result = await run(connection, command, positional, { ...flags, target: target.id }, metadata)
    if (command === 'resize' && result) saveViewportOverride(VIEWPORT_STATE, target.id, metadata, result)
    if (result !== undefined) console.log(JSON.stringify(result, null, 2))
  } finally {
    connection.close()
  }
}

main(process.argv.slice(2)).catch((error) => {
  console.error(error.message)
  process.exitCode = 1
})
