// Minimal W3C WebDriver client (WebKitWebDriver speaks the standard protocol).
// Kept dependency-free so any agent can use it with a plain `node`.

const ELEMENT_KEY = 'element-6066-11e4-a52e-4f735466cecf'

// WebDriver key codepoints for the keys agents actually need.
export const SPECIAL_KEYS = {
  Backspace: '\uE003', Tab: '\uE004', Enter: '\uE007', Shift: '\uE008',
  Control: '\uE009', Alt: '\uE00A', Escape: '\uE00C', Space: '\uE00D',
  PageUp: '\uE00E', PageDown: '\uE00F', End: '\uE010', Home: '\uE011',
  ArrowLeft: '\uE012', ArrowUp: '\uE013', ArrowRight: '\uE014', ArrowDown: '\uE015',
  Delete: '\uE017', Meta: '\uE03D',
}

export class WebDriver {
  constructor(port, sessionId = null) {
    this.base = `http://127.0.0.1:${port}`
    this.sessionId = sessionId
  }

  async request(method, path, body) {
    const res = await fetch(this.base + path, {
      method,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok || json.value?.error) {
      const err = json.value ?? {}
      throw new Error(`WebDriver ${method} ${path}: ${err.error ?? res.status} ${err.message ?? ''}`.trim())
    }
    return json.value
  }

  session(method, path, body) {
    if (!this.sessionId) throw new Error('No WebDriver session')
    return this.request(method, `/session/${this.sessionId}${path}`, body)
  }

  async ready() {
    try {
      return (await this.request('GET', '/status')).ready === true
    } catch {
      return false
    }
  }

  async createSession(binary, args = []) {
    const value = await this.request('POST', '/session', {
      capabilities: { alwaysMatch: { 'webkitgtk:browserOptions': { binary, args } } },
    })
    this.sessionId = value.sessionId
    return value
  }

  deleteSession() {
    return this.session('DELETE', '')
  }

  url() {
    return this.session('GET', '/url')
  }

  execute(script, args = [], { async = false } = {}) {
    return this.session('POST', async ? '/execute/async' : '/execute/sync', { script, args })
  }

  async find(css) {
    const value = await this.session('POST', '/element', { using: 'css selector', value: css })
    return value[ELEMENT_KEY]
  }

  async activeElement() {
    return (await this.session('GET', '/element/active'))[ELEMENT_KEY]
  }

  click(elementId) {
    return this.session('POST', `/element/${elementId}/click`, {})
  }

  clear(elementId) {
    return this.session('POST', `/element/${elementId}/clear`, {})
  }

  sendKeys(elementId, text) {
    return this.session('POST', `/element/${elementId}/value`, { text })
  }

  async screenshot(elementId = null) {
    const path = elementId ? `/element/${elementId}/screenshot` : '/screenshot'
    return Buffer.from(await this.session('GET', path), 'base64')
  }

  windowRect() {
    return this.session('GET', '/window/rect')
  }

  setWindowRect(rect) {
    return this.session('POST', '/window/rect', rect)
  }

  // Presses a chord such as "Control+k" or "Escape" through the actions API.
  async pressChord(chord) {
    const parts = chord.split('+').map((part) => SPECIAL_KEYS[part] ?? part)
    const down = parts.map((value) => ({ type: 'keyDown', value }))
    const up = [...parts].reverse().map((value) => ({ type: 'keyUp', value }))
    await this.session('POST', '/actions', {
      actions: [{ type: 'key', id: 'keyboard', actions: [...down, ...up] }],
    })
    await this.session('DELETE', '/actions')
  }
}
