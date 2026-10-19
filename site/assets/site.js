// Nevo landing: scroll-driven view switching for the demo note, plus OS-aware downloads.
const REPO = 'eliotBenitez/Nevo'
const VIEWS = ['doc', 'canvas', 'graph', 'kanban', 'db']
const EDGES = [['local', 'md'], ['local', 'links'], ['local', 'ai'], ['links', 'board'], ['md', 'math'], ['links', 'md']]
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)')

const track = document.querySelector('.track')
const island = document.querySelector('.island')
const board = island.querySelector('.board')
const buttons = [...document.querySelectorAll('.views button')]
const caption = document.querySelector('.caption-text')
const captionIcon = document.querySelector('.caption use')
const movers = () => [...island.querySelectorAll('.blk, .note-title')]

let current = 'doc'

function drawLinks () {
  const svg = board.querySelector('.links')
  if (current !== 'canvas' && current !== 'graph') { svg.replaceChildren(); return }
  const box = board.getBoundingClientRect()
  const centre = k => {
    const el = board.querySelector(`.blk[data-k="${k}"] ${current === 'graph' ? '.dot' : ''}`)
    const r = el.getBoundingClientRect()
    return [r.left - box.left + r.width / 2, r.top - box.top + r.height / 2]
  }
  svg.setAttribute('viewBox', `0 0 ${box.width} ${box.height}`)
  // Graph edges stop at each node's ring instead of running into the dot.
  const ring = k => current === 'graph' ? board.querySelector(`.blk[data-k="${k}"] .dot`).offsetWidth / 2 + 6 : 0
  svg.replaceChildren(...EDGES.map(([a, b], i) => {
    const [ax, ay] = centre(a)
    const [bx, by] = centre(b)
    const d = Math.hypot(bx - ax, by - ay) || 1
    const [ux, uy] = [(bx - ax) / d, (by - ay) / d]
    const [x1, y1] = [ax + ux * ring(a), ay + uy * ring(a)]
    const [x2, y2] = [bx - ux * ring(b), by - uy * ring(b)]
    const p = document.createElementNS('http://www.w3.org/2000/svg', 'path')
    const mx = x1 + (x2 - x1) / 2
    p.setAttribute('d', current === 'canvas' ? `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}` : `M${x1},${y1} L${x2},${y2}`)
    if (i < 3) p.classList.add('hi')
    p.style.setProperty('--len', Math.hypot(x2 - x1, y2 - y1) * 1.3)
    return p
  }))
}

function setView (view) {
  if (view === current) return
  const els = movers()
  // Measure where blocks are on screen (mid-flight included), then drop running animations
  // so the new layout and its base transforms are read clean.
  const before = new Map(els.map(el => [el, el.getBoundingClientRect()]))
  els.forEach(el => el.getAnimations().forEach(a => a.cancel()))
  current = view
  island.dataset.view = view
  buttons.forEach(b => b.setAttribute('aria-pressed', String(b.dataset.view === view)))
  const active = buttons.find(b => b.dataset.view === view)
  caption.textContent = active.dataset.caption
  captionIcon.setAttribute('href', active.querySelector('use').getAttribute('href'))
  if (reduceMotion.matches) { drawLinks(); return }
  board.querySelector('.links').replaceChildren()
  // FLIP: the same blocks travel from their old layout to the new one.
  for (const el of els) {
    const a = before.get(el)
    const b = el.getBoundingClientRect()
    const dx = a.left - b.left
    const dy = a.top - b.top
    const s = el.classList.contains('note-title') ? a.height / b.height : 1
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1 && s === 1) continue
    const base = getComputedStyle(el).transform
    const from = `translate(${dx}px, ${dy}px) scale(${s}) ${base === 'none' ? '' : base}`
    el.animate([{ transform: from }, { transform: base === 'none' ? 'none' : base }], { duration: 620, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' })
  }
  // Links are measured from settled positions; a newer view change cancels these animations.
  const settled = els.flatMap(el => el.getAnimations()).map(a => a.finished)
  Promise.all(settled).then(() => { if (island.dataset.view === view) drawLinks() }, () => {})
}

const stepSize = () => parseFloat(getComputedStyle(track).getPropertyValue('--step')) / 100 * innerHeight
const trackTop = () => track.getBoundingClientRect().top + scrollY

let ticking = false
function onScroll () {
  if (ticking) return
  ticking = true
  requestAnimationFrame(() => {
    ticking = false
    const i = Math.round((scrollY - trackTop()) / stepSize())
    setView(VIEWS[Math.min(VIEWS.length - 1, Math.max(0, i))])
  })
}

buttons.forEach((b, i) => b.addEventListener('click', () => {
  scrollTo({ top: trackTop() + i * stepSize(), behavior: reduceMotion.matches ? 'auto' : 'smooth' })
  setView(b.dataset.view)
}))
addEventListener('scroll', onScroll, { passive: true })
addEventListener('resize', () => { drawLinks(); onScroll() })
onScroll()

/* ───────── Downloads ───────── */
function detectOs () {
  const ua = navigator.userAgent
  if (/Android/i.test(ua)) return 'android'
  if (/iPhone|iPad|iPod/i.test(ua)) return null
  if (/Mac/i.test(ua)) return 'mac'
  if (/Win/i.test(ua)) return 'windows'
  if (/Linux|X11/i.test(ua)) return 'linux'
  return null
}

// Asset names come from the release workflow; anything unmatched keeps the Releases page link.
const MATCHERS = {
  'windows-exe': /_x64-setup\.exe$/,
  'windows-msi': /_x64_en-US\.msi$/,
  'mac-arm': /_aarch64\.dmg$/,
  'mac-intel': /_x64\.dmg$/,
  'linux-deb': /_amd64\.deb$/,
  'linux-rpm': /\.x86_64\.rpm$/,
  'linux-flatpak': /\.flatpak$/,
  android: /_android\.apk$/
}
const PRIMARY = { windows: 'windows-exe', mac: 'mac-arm', linux: 'linux-deb', android: 'android' }

const os = detectOs()
const primary = document.querySelectorAll('[data-dl-primary]')
if (os) {
  const name = document.querySelector(`[data-os-name="${os}"]`)?.textContent
  primary.forEach(a => {
    const label = a.querySelector('.dl-label')
    if (label && name) label.textContent = a.dataset.tpl.replace('{os}', name)
  })
  document.querySelector(`.plat[data-os="${os}"]`)?.classList.add('is-you')
}

fetch(`https://api.github.com/repos/${REPO}/releases/latest`, { headers: { Accept: 'application/vnd.github+json' } })
  .then(r => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
  .then(release => {
    const url = {}
    for (const [key, re] of Object.entries(MATCHERS)) {
      const asset = release.assets.find(a => re.test(a.name))
      if (asset) url[key] = asset.browser_download_url
    }
    document.querySelectorAll('[data-asset]').forEach(a => { if (url[a.dataset.asset]) a.href = url[a.dataset.asset] })
    if (os && url[PRIMARY[os]]) primary.forEach(a => { a.href = url[PRIMARY[os]] })
    document.querySelectorAll('[data-version]').forEach(el => { el.textContent = release.tag_name })
  })
  .catch(() => { /* offline or rate-limited: every link already points at the Releases page */ })
