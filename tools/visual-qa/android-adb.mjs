import { execFile, spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

const QA_AVD_PATTERN = /^nevo-[a-z0-9-]+$/
const EMULATOR_SERIAL_PATTERN = /^emulator-(\d+)$/
const FIRST_DEVTOOLS_PORT = 9300

function sdkRoot() {
  return process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || ''
}

function sdkTool(relativeDir, name) {
  const root = sdkRoot()
  const executable = process.platform === 'win32' ? `${name}.exe` : name
  const candidate = root ? join(root, relativeDir, executable) : ''
  return candidate && existsSync(candidate) ? candidate : name
}

export const adbPath = () => sdkTool('platform-tools', 'adb')
export const emulatorPath = () => sdkTool('emulator', 'emulator')

export function runAdb(args, { serial, timeoutMs = 60_000, encoding = 'utf8' } = {}) {
  const fullArgs = serial ? ['-s', serial, ...args] : args
  return new Promise((resolve, reject) => {
    execFile(adbPath(), fullArgs, { timeout: timeoutMs, encoding, maxBuffer: 64 * 1024 * 1024, windowsHide: true }, (error, stdout, stderr) => {
      if (error) reject(new Error(`adb ${fullArgs.join(' ')} failed: ${(stderr || error.message).toString().trim()}`))
      else resolve(stdout)
    })
  })
}

export function assertQaAvdName(name) {
  if (typeof name !== 'string' || !QA_AVD_PATTERN.test(name)) {
    throw new Error(`Refusing AVD "${name}"; QA AVDs must be named nevo-<profile> (for example nevo-phone, nevo-tablet)`)
  }
  return name
}

export function parseDevices(output) {
  return output.split(/\r?\n/).slice(1)
    .map((line) => line.trim().split(/\s+/))
    .filter((parts) => parts.length >= 2 && parts[0])
    .map(([serial, state]) => ({ serial, state }))
}

export function parseAvdNameReply(output) {
  const name = output.split(/\r?\n/).map((line) => line.trim()).find((line) => line && line !== 'OK')
  return name ?? null
}

export function devtoolsPortForSerial(serial) {
  const match = EMULATOR_SERIAL_PATTERN.exec(serial)
  if (!match) throw new Error(`Not an emulator serial: ${serial}`)
  return FIRST_DEVTOOLS_PORT + (Number(match[1]) - 5554) / 2
}

export async function listEmulators() {
  const devices = parseDevices(await runAdb(['devices']))
  const result = []
  for (const device of devices) {
    if (!EMULATOR_SERIAL_PATTERN.test(device.serial) || device.state !== 'device') continue
    const avd = parseAvdNameReply(await runAdb(['emu', 'avd', 'name'], { serial: device.serial }).catch(() => ''))
    result.push({ ...device, avd })
  }
  return result
}

// Every operation is restricted to disposable QA emulators so a connected
// physical phone with real user data can never be driven by this tool.
export async function assertQaEmulator(serial) {
  if (!EMULATOR_SERIAL_PATTERN.test(serial ?? '')) throw new Error(`Refusing non-emulator device: ${serial}`)
  const qemu = (await runAdb(['shell', 'getprop', 'ro.kernel.qemu'], { serial })).trim()
  const bootQemu = (await runAdb(['shell', 'getprop', 'ro.boot.qemu'], { serial })).trim()
  if (qemu !== '1' && bootQemu !== '1') throw new Error(`Refusing ${serial}: it does not report itself as an emulator`)
  const avd = parseAvdNameReply(await runAdb(['emu', 'avd', 'name'], { serial }))
  assertQaAvdName(avd)
  return { serial, avd }
}

export async function resolveSerial({ serial, avd } = {}) {
  if (serial) return (await assertQaEmulator(serial)).serial
  const emulators = (await listEmulators()).filter((item) => item.avd && QA_AVD_PATTERN.test(item.avd))
  const matches = avd ? emulators.filter((item) => item.avd === avd) : emulators
  if (matches.length === 1) return (await assertQaEmulator(matches[0].serial)).serial
  if (!matches.length) throw new Error(avd ? `QA emulator ${avd} is not running; run: boot ${avd}` : 'No QA emulator is running; run: boot nevo-phone')
  throw new Error(`Several QA emulators are running; pass --avd NAME or --serial ID (${matches.map((item) => `${item.avd}=${item.serial}`).join(', ')})`)
}

export async function bootAvd(name, { timeoutMs = 240_000, wipe = false } = {}) {
  assertQaAvdName(name)
  const running = (await listEmulators()).find((item) => item.avd === name)
  if (running) return { serial: running.serial, avd: name, alreadyRunning: true }
  const args = ['-avd', name, '-no-snapshot-save', '-no-boot-anim', ...(wipe ? ['-wipe-data'] : [])]
  const child = spawn(emulatorPath(), args, { detached: true, stdio: 'ignore', windowsHide: false })
  child.unref()
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const found = (await listEmulators()).find((item) => item.avd === name)
    if (found) {
      const booted = (await runAdb(['shell', 'getprop', 'sys.boot_completed'], { serial: found.serial }).catch(() => '')).trim()
      if (booted === '1') return { serial: found.serial, avd: name, alreadyRunning: false }
    }
    await new Promise((resolve) => setTimeout(resolve, 2000))
  }
  throw new Error(`Timed out waiting for ${name} to boot`)
}

export async function appPid(serial, packageName) {
  const output = await runAdb(['shell', 'pidof', packageName], { serial }).catch(() => '')
  const pid = output.trim().split(/\s+/)[0]
  return /^\d+$/.test(pid ?? '') ? pid : null
}

export async function forwardDevtools(serial, packageName) {
  const pid = await appPid(serial, packageName)
  if (!pid) throw new Error(`${packageName} is not running on ${serial}; run: launch`)
  const port = devtoolsPortForSerial(serial)
  await runAdb(['forward', `tcp:${port}`, `localabstract:webview_devtools_remote_${pid}`], { serial })
  return { port, pid }
}

export async function screencap(serial) {
  return runAdb(['exec-out', 'screencap', '-p'], { serial, encoding: 'buffer' })
}

export function parsePhysicalSize(output) {
  const match = /Physical size:\s*(\d+)x(\d+)/.exec(output)
  if (!match) throw new Error(`Unable to read display size: ${output.trim()}`)
  return { width: Number(match[1]), height: Number(match[2]) }
}

// user_rotation is relative to the display's natural orientation, which is
// landscape on tablets such as the Pixel Tablet and portrait on phones.
export function parseRotation(value, naturalSize) {
  const naturalLandscape = naturalSize.width > naturalSize.height
  const rotations = naturalLandscape
    ? { landscape: 0, portrait: 1, 'reverse-landscape': 2, 'reverse-portrait': 3 }
    : { portrait: 0, landscape: 1, 'reverse-portrait': 2, 'reverse-landscape': 3 }
  if (!(value in rotations)) throw new Error('rotate requires portrait | landscape | reverse-portrait | reverse-landscape')
  return rotations[value]
}

export async function naturalDisplaySize(serial) {
  return parsePhysicalSize(await runAdb(['shell', 'wm', 'size'], { serial }))
}
