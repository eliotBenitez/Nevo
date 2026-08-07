// Approximate LaTeX → Typst math converter for the common subset used in notes.
// Native Typst math keeps the export fully offline (no `mitex` package / WASM).
//
// Robustness contract: this must NEVER produce Typst that fails to compile.
// Known commands map to Typst symbols; unknown commands degrade to quoted text
// (`"name"`) rather than a bare identifier (which Typst rejects as an unknown
// variable). The result may be visually imperfect, but it always compiles.

// Mathematical functions that Typst recognises verbatim in math mode.
const SAFE_BARE = new Set([
  'sin', 'cos', 'tan', 'cot', 'sec', 'csc', 'sinh', 'cosh', 'tanh', 'coth',
  'arcsin', 'arccos', 'arctan', 'exp', 'ln', 'log', 'lg', 'lim', 'limsup', 'liminf',
  'max', 'min', 'sup', 'inf', 'det', 'dim', 'gcd', 'hom', 'ker', 'deg', 'arg', 'Pr',
  'dif',
])

const COMMAND_MAP: Record<string, string> = {
  // relations
  le: '≤', leq: '≤', ge: '≥', geq: '≥', neq: '≠', ne: '≠',
  ll: '≪', gg: '≫', equiv: '≡', cong: '≅', simeq: '≃', sim: '∼',
  approx: '≈', asymp: '≍', propto: '∝', parallel: '∥', perp: '⊥',
  mid: '∣', models: '⊨', prec: '≺', succ: '≻', preceq: '⪯', succeq: '⪰',
  doteq: '≐', vdash: '⊢', dashv: '⊣',
  nleq: '≰', ngeq: '≱', nless: '≮', ngtr: '≯', nparallel: '∦', nmid: '∤',
  ncong: '≆', nsim: '≁',
  // set theory
  in: '∈', notin: '∉', ni: '∋', subset: '⊂', supset: '⊃',
  subseteq: '⊆', supseteq: '⊇', subsetneq: '⊊', supsetneq: '⊋',
  nsubseteq: '⊈', nsupseteq: '⊉',
  cup: '∪', cap: '∩', bigcup: '⋃', bigcap: '⋂', setminus: '∖',
  emptyset: '∅', varnothing: '∅',
  // logic
  wedge: '∧', land: '∧', vee: '∨', lor: '∨', neg: '¬', lnot: '¬',
  implies: '⟹', impliedby: '⟸', iff: '⟺',
  forall: '∀', exists: '∃', nexists: '∄',
  therefore: '∴', because: '∵',
  // operators
  cdot: '⋅', times: '×', div: '÷', ast: '∗', circ: '∘',
  oplus: '⊕', otimes: '⊗', odot: '⊙',
  ominus: '⊖', oslash: '⊘', uplus: '⊎', sqcap: '⊓', sqcup: '⊔',
  pm: '±', mp: '∓', sum: '∑', prod: '∏', coprod: '∐',
  int: '∫', iint: '∬', iiint: '∭', oint: '∮', oiint: '∯', oiiint: '∰',
  bigvee: '⋁', bigwedge: '⋀', biguplus: '⨄', bigsqcup: '⨆',
  bigoplus: '⨁', bigotimes: '⨂', bigodot: '⨀',
  partial: '∂', infty: '∞',
  // arrows
  to: '→', rightarrow: '→', leftarrow: '←', gets: '←', leftrightarrow: '↔',
  Rightarrow: '⇒', Leftarrow: '⇐', Leftrightarrow: '⇔',
  longrightarrow: '⟶', longleftarrow: '⟵', longleftrightarrow: '⟷',
  Longrightarrow: '⟹', Longleftarrow: '⟸', Longleftrightarrow: '⟺',
  uparrow: '↑', downarrow: '↓', updownarrow: '↕',
  Uparrow: '⇑', Downarrow: '⇓', Updownarrow: '⇕',
  nearrow: '↗', searrow: '↘', swarrow: '↙', nwarrow: '↖',
  mapsto: '↦', longmapsto: '⟼', hookleftarrow: '↩', hookrightarrow: '↪',
  leftharpoonup: '↼', leftharpoondown: '↽',
  rightharpoonup: '⇀', rightharpoondown: '⇁',
  rightleftharpoons: '⇌', leftrightharpoons: '⇋',
  nleftarrow: '↚', nrightarrow: '↛', nleftrightarrow: '↮',
  nLeftarrow: '⇍', nRightarrow: '⇏', nLeftrightarrow: '⇎',
  twoheadleftarrow: '↞', twoheadrightarrow: '↠',
  leftarrowtail: '↢', rightarrowtail: '↣',
  dashleftarrow: '⇠', dashrightarrow: '⇢',
  rightsquigarrow: '⇝', leadsto: '⇝', leftrightsquigarrow: '↭',
  // delimiters / dots
  langle: '⟨', rangle: '⟩', lfloor: '⌊', rfloor: '⌋',
  lceil: '⌈', rceil: '⌉', lbrace: '{', rbrace: '}',
  ldots: '…', cdots: '⋯', dots: '…', vdots: '⋮', ddots: '⋱',
  prime: '′', hbar: 'ℏ', diamond: '⋄', bullet: '∙',
  angle: '∠', triangle: '△', square: '□', star: '⋆', dagger: '†',
  top: '⊤', bot: '⊥', nabla: '∇', aleph: 'ℵ', ell: 'ℓ', Re: 'ℜ', Im: 'ℑ',
  // greek
  alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ',
  epsilon: 'ϵ', varepsilon: 'ε', zeta: 'ζ', eta: 'η',
  theta: 'θ', vartheta: 'ϑ', iota: 'ι', kappa: 'κ', varkappa: 'ϰ',
  lambda: 'λ', mu: 'μ', nu: 'ν', xi: 'ξ', omicron: 'ο',
  pi: 'π', varpi: 'ϖ', rho: 'ρ', varrho: 'ϱ',
  sigma: 'σ', varsigma: 'ς', tau: 'τ', upsilon: 'υ',
  phi: 'ϕ', varphi: 'φ', chi: 'χ', psi: 'ψ', omega: 'ω',
  Gamma: 'Γ', Delta: 'Δ', Theta: 'Θ', Lambda: 'Λ', Xi: 'Ξ',
  Pi: 'Π', Sigma: 'Σ', Upsilon: 'Υ', Phi: 'Φ', Psi: 'Ψ', Omega: 'Ω',
}

// LaTeX accents whose Typst equivalents are unary math functions.
const ACCENT_FUNCTION_MAP: Record<string, string> = {
  acute: 'acute',
  grave: 'grave',
  ddot: 'dot.double',
  tilde: 'tilde',
  bar: 'macron',
  breve: 'breve',
  check: 'caron',
  hat: 'hat',
  vec: 'arrow',
  dot: 'dot',
  mathring: 'circle',
  widecheck: 'caron',
  widehat: 'hat',
  widetilde: 'tilde',
  overline: 'overline',
  underline: 'underline',
  overbrace: 'overbrace',
  underbrace: 'underbrace',
  overbracket: 'overbracket',
  underbracket: 'underbracket',
  overlinesegment: 'overline',
  underlinesegment: 'underline',
}

// Stretchy accents without a dedicated Typst function. Combining characters
// are used for accents below the base so Typst positions them correctly.
const ACCENT_SYMBOL_MAP: Record<string, string> = {
  overrightarrow: '→',
  overleftarrow: '←',
  overleftrightarrow: '↔',
  overgroup: '⏠',
  overleftharpoon: '↼',
  overrightharpoon: '⇀',
  underleftarrow: '\u20ee',
  underrightarrow: '\u20ef',
  underleftrightarrow: '\u034d',
  undergroup: '⏡',
  utilde: '\u0330',
}

// Double arrows are not valid combining accents in Typst. A centered top
// attachment preserves the double shaft without overlapping the base.
const ACCENT_ATTACHMENT_MAP: Record<string, string> = {
  Overrightarrow: '⟹',
}

// LaTeX font/style commands → Typst math styling functions taking a group.
const STYLE_MAP: Record<string, string> = {
  mathbb: 'bb', mathcal: 'cal', mathfrak: 'frak', mathbf: 'bold',
  mathrm: 'upright', mathsf: 'sans', mathtt: 'mono', mathit: 'italic', boldsymbol: 'bold',
}

function readGroup(src: string, start: number): { content: string; next: number } {
  let depth = 0
  for (let i = start; i < src.length; i++) {
    if (src[i] === '{') depth++
    else if (src[i] === '}') {
      depth--
      if (depth === 0) return { content: src.slice(start + 1, i), next: i + 1 }
    }
  }
  return { content: src.slice(start + 1), next: src.length }
}

function requiredArg(value: string): string {
  return value.trim() || '""'
}

/**
 * Read one required LaTeX argument. Braced groups and single-token shorthand
 * are both valid (`\frac{1}{2}` and `\frac12`). Missing or empty arguments
 * degrade to invisible text because Typst functions reject omitted arguments.
 */
function readRequiredArg(src: string, start: number): { arg: string; next: number } {
  let i = start
  while (i < src.length && /\s/.test(src[i])) i++

  if (src[i] === '{') {
    const { content, next } = readGroup(src, i)
    return { arg: requiredArg(convert(content)), next }
  }

  if (src[i] === '\\') {
    let j = i + 1
    while (j < src.length && /[a-zA-Z]/.test(src[j])) j++
    if (j === i + 1 && j < src.length) j++
    return { arg: requiredArg(convert(src.slice(i, j))), next: j }
  }

  if (i >= src.length) return { arg: '""', next: i }
  return { arg: requiredArg(convert(src[i])), next: i + 1 }
}

function mapCommand(name: string): string {
  if (COMMAND_MAP[name]) return COMMAND_MAP[name]
  if (SAFE_BARE.has(name)) return name
  // Unknown command: render as upright text so Typst never fails to compile.
  return `"${name}"`
}

function convert(latex: string): string {
  const src = latex
    .replace(/\\(left|right|big|Big|bigg|Bigg|displaystyle|textstyle|scriptstyle)(?![a-zA-Z])\s*/g, '')
    .replace(/\\begin\{[^}]*\}|\\end\{[^}]*\}/g, ' ')
    .replace(/\\[,;:!]/g, ' ')
    .replace(/\\quad|\\qquad/g, ' ')
    .replace(/\\\\/g, ' ')
    .replace(/&/g, ' ')

  let out = ''

  // Typst lexes a letter followed by more letters or digits as a single
  // identifier, so emitting `bold(x)` right after `t` yields the unknown
  // variable `tbold`, and `2` after `n` yields `n2`. Every appended token that
  // could extend a preceding identifier gets a separating space (Typst ignores
  // whitespace between math elements, so this changes nothing visually).
  const push = (token: string) => {
    if (/\p{L}$/u.test(out) && /^[\p{L}\p{N}]/u.test(token)) out += ' '
    out += token
  }

  let i = 0
  while (i < src.length) {
    const ch = src[i]
    if (ch === '\\') {
      let j = i + 1
      while (j < src.length && /[a-zA-Z]/.test(src[j])) j++
      const name = src.slice(i + 1, j)
      i = j
      if (name === '') {
        // Escaped non-letter (e.g. \{ \} \| \%): emit the literal character.
        push(src[i] ?? '')
        i += 1
      } else if (name === 'frac' || name === 'dfrac' || name === 'tfrac') {
        const numerator = readRequiredArg(src, i)
        const denominator = readRequiredArg(src, numerator.next)
        push(`frac(${numerator.arg}, ${denominator.arg})`)
        i = denominator.next
      } else if (name === 'sqrt') {
        if (src[i] === '[') {
          const close = src.indexOf(']', i)
          if (close < 0) {
            push('sqrt("")')
            i = src.length
          } else {
            const index = requiredArg(convert(src.slice(i + 1, close)))
            const radicand = readRequiredArg(src, close + 1)
            push(`root(${index}, ${radicand.arg})`)
            i = radicand.next
          }
        } else {
          const radicand = readRequiredArg(src, i)
          push(`sqrt(${radicand.arg})`)
          i = radicand.next
        }
      } else if (ACCENT_FUNCTION_MAP[name]) {
        const value = readRequiredArg(src, i)
        push(`${ACCENT_FUNCTION_MAP[name]}(${value.arg})`)
        i = value.next
      } else if (ACCENT_SYMBOL_MAP[name]) {
        const value = readRequiredArg(src, i)
        push(`accent(${value.arg}, "${ACCENT_SYMBOL_MAP[name]}")`)
        i = value.next
      } else if (ACCENT_ATTACHMENT_MAP[name]) {
        const value = readRequiredArg(src, i)
        push(`attach(limits(${value.arg}), t: ${ACCENT_ATTACHMENT_MAP[name]})`)
        i = value.next
      } else if (STYLE_MAP[name]) {
        const value = readRequiredArg(src, i)
        push(`${STYLE_MAP[name]}(${value.arg})`)
        i = value.next
      } else if ((name === 'text' || name === 'operatorname' || name === 'mbox') && src[i] === '{') {
        const g = readGroup(src, i)
        push(`"${g.content.replace(/"/g, '')}"`)
        i = g.next
      } else {
        // Separate from a preceding alphanumeric so e.g. `A\Rightarrow` does not
        // glue into the identifier `Aarrow`. Trailing space separates from what follows.
        if (/[A-Za-z0-9]$/.test(out)) out += ' '
        push(`${mapCommand(name)} `)
      }
    } else if (ch === '{') {
      const g = readGroup(src, i)
      push(`(${convert(g.content)})`)
      i = g.next
    } else if (ch === '}') {
      i++
    } else if (ch === '^' || ch === '_') {
      const { arg, next } = readRequiredArg(src, i + 1)
      // Typst attachments need a base expression. Keep malformed/orphaned
      // LaTeX scripts exportable by attaching them to an invisible text node.
      if (!out.trim()) out += '""'
      out += `${ch}(${arg})`
      i = next
    } else {
      // In LaTeX `XZ` means X·Z and `n2` means n·2; `push` keeps them apart.
      push(ch)
      i++
    }
  }
  return out.replace(/\s+/g, ' ').trim()
}

/** Convert a LaTeX math string to Typst math markup (without the `$` delimiters). */
export function latexToTypstMath(latex: string): string {
  return convert(latex)
}
