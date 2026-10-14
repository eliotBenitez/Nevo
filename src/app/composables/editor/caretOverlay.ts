import type { EditorView } from 'prosemirror-view'
import { TextSelection } from 'prosemirror-state'

export type CaretOverlayEffect = 'smooth' | 'sparkle' | 'glow' | 'comet' | 'jelly'

const MAX_PARTICLES = 48
const BLINK_KEYFRAMES: Keyframe[] = [{ opacity: 1 }, { opacity: 1, offset: 0.5 }, { opacity: 0, offset: 0.5 }, { opacity: 0 }]
const PULSE_KEYFRAMES: Keyframe[] = [
  { opacity: 1, filter: 'brightness(1.15)' },
  { opacity: 0.45, filter: 'brightness(0.9)' },
  { opacity: 1, filter: 'brightness(1.15)' },
]

function prefersReducedMotion(): boolean {
  const mode = document.documentElement.getAttribute('data-motion')
  if (mode === 'reduce') return true
  if (mode === 'full') return false
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
}

function canAnimate(el: Element): boolean {
  return typeof el.animate === 'function'
}

/** Nearest ancestor that clips its content, so the fixed-position caret can hide when scrolled out. */
function findClipRect(el: HTMLElement): DOMRect {
  for (let node = el.parentElement; node; node = node.parentElement) {
    const { overflowY } = getComputedStyle(node)
    if (overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'hidden') return node.getBoundingClientRect()
  }
  return new DOMRect(0, 0, window.innerWidth, window.innerHeight)
}

/**
 * A drawn caret that replaces the native one (made transparent via CSS) and
 * follows the ProseMirror selection head. It lives in a fixed layer on <body>
 * so editor transforms (canvas zoom) and scroll containers don't affect it.
 */
export class CaretOverlay {
  private readonly layer = document.createElement('div')
  private readonly caret = document.createElement('div')
  private readonly bar = document.createElement('div')
  private last: { x: number, y: number } | null = null
  private typed = false
  private frame = 0
  private particles = 0

  constructor(private readonly view: EditorView, private effect: CaretOverlayEffect) {
    this.layer.className = 'nv-caret-layer'
    this.layer.setAttribute('aria-hidden', 'true')
    this.caret.className = 'nv-caret'
    this.bar.className = 'nv-caret__bar'
    this.caret.appendChild(this.bar)
    this.layer.appendChild(this.caret)
    document.body.appendChild(this.layer)
    this.setEffect(effect)

    document.addEventListener('selectionchange', this.schedule)
    window.addEventListener('scroll', this.schedule, { capture: true, passive: true })
    window.addEventListener('resize', this.schedule)
    view.dom.addEventListener('focus', this.schedule)
    view.dom.addEventListener('blur', this.schedule)
    view.dom.addEventListener('input', this.onInput)
    this.schedule()
  }

  setEffect(effect: CaretOverlayEffect): void {
    this.effect = effect
    this.caret.dataset.effect = effect
    this.last = null
    this.schedule()
  }

  destroy(): void {
    cancelAnimationFrame(this.frame)
    document.removeEventListener('selectionchange', this.schedule)
    window.removeEventListener('scroll', this.schedule, { capture: true })
    window.removeEventListener('resize', this.schedule)
    this.view.dom.removeEventListener('focus', this.schedule)
    this.view.dom.removeEventListener('blur', this.schedule)
    this.view.dom.removeEventListener('input', this.onInput)
    this.layer.remove()
  }

  private readonly onInput = () => {
    this.typed = true
    this.schedule()
  }

  private readonly schedule = () => {
    cancelAnimationFrame(this.frame)
    this.frame = requestAnimationFrame(() => this.update())
  }

  private hide(): void {
    this.caret.style.visibility = 'hidden'
    this.last = null
  }

  private update(): void {
    const { view } = this
    if (view.isDestroyed) return this.destroy()
    const { selection } = view.state
    // Nested inputs (code blocks, inline math) keep their own native caret.
    if (document.activeElement !== view.dom || !selection.empty || !(selection instanceof TextSelection)) return this.hide()

    let coords: { left: number, top: number, bottom: number }
    try {
      coords = view.coordsAtPos(selection.head)
    } catch {
      return this.hide()
    }
    const clip = findClipRect(view.dom)
    if (coords.bottom < clip.top || coords.top > clip.bottom) return this.hide()

    const x = Math.round(coords.left)
    const y = Math.round(coords.top)
    const height = Math.max(1, coords.bottom - coords.top)
    const from = this.last
    const moved = !from || from.x !== x || from.y !== y
    const animate = !prefersReducedMotion() && canAnimate(this.bar)

    // The first placement after showing must not glide in from a stale spot.
    this.caret.classList.toggle('nv-caret--instant', !from || !animate)
    this.caret.style.visibility = 'visible'
    this.caret.style.height = `${height}px`
    this.caret.style.transform = `translate(${x}px, ${y}px)`
    this.last = { x, y }

    if (moved) {
      this.restartBlink(animate)
      if (animate && from) {
        if (this.effect === 'comet') this.spawnTrail(from, { x, y }, height)
        if (this.effect === 'jelly') this.squash(Math.sign(x - from.x || y - from.y))
      }
    }
    if (this.typed && animate && this.effect === 'sparkle') this.spawnSparks(x, y, height)
    this.typed = false
  }

  private restartBlink(animate: boolean): void {
    if (!canAnimate(this.bar)) return
    for (const anim of this.bar.getAnimations()) if (anim.id === 'blink') anim.cancel()
    const pulse = this.effect === 'glow'
    const anim = this.bar.animate(pulse ? PULSE_KEYFRAMES : BLINK_KEYFRAMES, {
      duration: pulse ? 1600 : 1060,
      delay: 500,
      iterations: animate ? Infinity : 0,
      easing: pulse ? 'ease-in-out' : 'linear',
    })
    anim.id = 'blink'
  }

  private squash(direction: number): void {
    const stretch = direction < 0 ? 'right' : 'left'
    this.bar.animate([
      { transform: 'scale(3.2, 0.72)', transformOrigin: stretch },
      { transform: 'scale(0.75, 1.14)', transformOrigin: stretch, offset: 0.55 },
      { transform: 'scale(1, 1)', transformOrigin: stretch },
    ], { duration: 320, easing: 'cubic-bezier(.34, 1.56, .64, 1)' })
  }

  private spawnTrail(from: { x: number, y: number }, to: { x: number, y: number }, height: number): void {
    const dx = to.x - from.x
    const dy = to.y - from.y
    const length = Math.hypot(dx, dy)
    if (length < 2) return
    const trail = document.createElement('div')
    trail.className = 'nv-caret-trail'
    trail.style.width = `${length}px`
    trail.style.height = `${Math.max(2, height * 0.55)}px`
    trail.style.transform = `translate(${from.x}px, ${from.y + height / 2}px) rotate(${Math.atan2(dy, dx)}rad) translateY(-50%)`
    this.emit(trail, [{ opacity: 0.85 }, { opacity: 0 }], 420)
  }

  private spawnSparks(x: number, y: number, height: number): void {
    const count = 2 + Math.floor(Math.random() * 3)
    for (let i = 0; i < count; i += 1) {
      const spark = document.createElement('div')
      spark.className = 'nv-caret-spark'
      const startX = x + 1
      const startY = y + Math.random() * height
      const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.4
      const distance = 10 + Math.random() * 18
      const endX = startX + Math.cos(angle) * distance
      const endY = startY + Math.sin(angle) * distance
      this.emit(spark, [
        { transform: `translate(${startX}px, ${startY}px) scale(1)`, opacity: 1 },
        { transform: `translate(${endX}px, ${endY}px) scale(0.2)`, opacity: 0 },
      ], 480 + Math.random() * 260)
    }
  }

  private emit(el: HTMLElement, keyframes: Keyframe[], duration: number): void {
    if (this.particles >= MAX_PARTICLES) return
    this.particles += 1
    this.layer.appendChild(el)
    const anim = el.animate(keyframes, { duration, easing: 'cubic-bezier(.2, .7, .3, 1)', fill: 'forwards' })
    anim.onfinish = anim.oncancel = () => {
      el.remove()
      this.particles -= 1
    }
  }
}
