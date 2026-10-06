import test from 'node:test'
import assert from 'node:assert/strict'
import { assertQaAvdName, devtoolsPortForSerial, parseAvdNameReply, parseDevices, parsePhysicalSize, parseRotation } from './android-adb.mjs'
import { assertAndroidMetadata, buildTapEvents, findAndroidTarget } from './android-cdp.mjs'

test('parseDevices keeps serial and state and skips the header', () => {
  const output = 'List of devices attached\r\nemulator-5554\tdevice\r\nR58M123\tunauthorized\r\n\r\n'
  assert.deepEqual(parseDevices(output), [
    { serial: 'emulator-5554', state: 'device' },
    { serial: 'R58M123', state: 'unauthorized' },
  ])
})

test('parseAvdNameReply strips the console OK line', () => {
  assert.equal(parseAvdNameReply('nevo-tablet\r\nOK\r\n'), 'nevo-tablet')
  assert.equal(parseAvdNameReply('OK\r\n'), null)
})

test('only nevo-* AVD names are accepted', () => {
  assert.equal(assertQaAvdName('nevo-phone'), 'nevo-phone')
  for (const name of ['Pixel_8', 'nevo_phone', '../nevo-phone', 'nevo-', '', undefined]) {
    assert.throws(() => assertQaAvdName(name), /Refusing AVD/)
  }
})

test('devtools ports are derived from emulator console ports and refuse physical serials', () => {
  assert.equal(devtoolsPortForSerial('emulator-5554'), 9300)
  assert.equal(devtoolsPortForSerial('emulator-5556'), 9301)
  assert.throws(() => devtoolsPortForSerial('R58M123'), /Not an emulator/)
})

test('parseRotation is relative to the natural display orientation', () => {
  const phone = { width: 1080, height: 2400 }
  const tablet = { width: 2560, height: 1600 }
  assert.equal(parseRotation('portrait', phone), 0)
  assert.equal(parseRotation('landscape', phone), 1)
  assert.equal(parseRotation('landscape', tablet), 0)
  assert.equal(parseRotation('portrait', tablet), 1)
  assert.throws(() => parseRotation('sideways', phone), /rotate requires/)
})

test('parsePhysicalSize reads wm size output', () => {
  assert.deepEqual(parsePhysicalSize('Physical size: 2560x1600\r\n'), { width: 2560, height: 1600 })
  assert.throws(() => parsePhysicalSize('error'), /Unable to read display size/)
})

test('findAndroidTarget selects the tauri.localhost page and rebuilds a loopback socket URL', () => {
  const targets = [
    { id: 'A', type: 'page', url: 'http://tauri.localhost/#/home', webSocketDebuggerUrl: 'ws:///devtools/page/A' },
    { id: 'B', type: 'page', url: 'https://example.com/' },
    { id: 'C', type: 'service_worker', url: 'http://tauri.localhost/sw.js' },
  ]
  const target = findAndroidTarget(targets, 9300)
  assert.equal(target.id, 'A')
  assert.equal(target.webSocketDebuggerUrl, 'ws://127.0.0.1:9300/devtools/page/A')
})

test('findAndroidTarget requires --target when several app pages exist', () => {
  const targets = ['A', 'B'].map((id) => ({ id, type: 'page', url: 'http://tauri.localhost/' }))
  assert.throws(() => findAndroidTarget(targets, 9300), /pass --target ID/)
  assert.equal(findAndroidTarget(targets, 9300, 'B').id, 'B')
  assert.throws(() => findAndroidTarget([{ id: 'X', type: 'page', url: 'https://example.com/' }], 9300), /No Nevo page/)
})

test('assertAndroidMetadata refuses desktop runtimes', () => {
  assert.equal(assertAndroidMetadata({ runtime: 'android' }).runtime, 'android')
  assert.throws(() => assertAndroidMetadata({ runtime: 'desktop' }), /non-Android/)
  assert.throws(() => assertAndroidMetadata(null), /non-Android/)
})

test('buildTapEvents emits a single-finger touch start and end', () => {
  const [start, end] = buildTapEvents(10, 20)
  assert.equal(start.type, 'touchStart')
  assert.deepEqual(start.touchPoints[0], { x: 10, y: 20, radiusX: 4, radiusY: 4, force: 1, id: 0 })
  assert.deepEqual(end, { type: 'touchEnd', touchPoints: [] })
})
