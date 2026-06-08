// Approximate LaTeX → Typst math converter for the common subset used in notes.
// Native Typst math keeps the export fully offline (no `mitex` package / WASM).
//
// Robustness contract: this must NEVER produce Typst that fails to compile.
// Known commands map to Typst symbols; unknown commands degrade to quoted text
// (`"name"`) rather than a bare identifier (which Typst rejects as an unknown
// variable). The result may be visually imperfect, but it always compiles.

// Greek letters and operators that Typst recognises verbatim in math mode.
const SAFE_BARE = new Set([
  'alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta', 'eta', 'theta', 'iota',
  'kappa', 'lambda', 'mu', 'nu', 'xi', 'omicron', 'pi', 'rho', 'sigma', 'tau',
  'upsilon', 'phi', 'chi', 'psi', 'omega',
  'Gamma', 'Delta', 'Theta', 'Lambda', 'Xi', 'Pi', 'Sigma', 'Upsilon', 'Phi', 'Psi', 'Omega',
  'sin', 'cos', 'tan', 'cot', 'sec', 'csc', 'sinh', 'cosh', 'tanh', 'coth',
  'arcsin', 'arccos', 'arctan', 'exp', 'ln', 'log', 'lg', 'lim', 'limsup', 'liminf',
  'max', 'min', 'sup', 'inf', 'det', 'dim', 'gcd', 'hom', 'ker', 'deg', 'arg', 'Pr',
  'sum', 'dif', 'diff', 'nabla', 'forall', 'exists', 'aleph', 'ell', 'Re', 'Im',
  'angle', 'triangle', 'square', 'diamond', 'star', 'dagger', 'bullet', 'top', 'bot',
])

const COMMAND_MAP: Record<string, string> = {
  // relations
  le: '<=', leq: '<=', ge: '>=', geq: '>=', neq: '!=', ne: '!=',
  ll: 'lt.double', gg: 'gt.double', equiv: 'equiv', cong: 'tilde.equiv',
  simeq: 'tilde.eq', sim: 'tilde', approx: 'approx', asymp: '≍', propto: 'prop',
  parallel: 'parallel', perp: 'perp', mid: 'divides', models: 'models',
  prec: 'prec', succ: 'succ', preceq: 'prec.eq', succeq: 'succ.eq',
  doteq: 'eq.dot', vdash: 'tack.r', dashv: 'tack.l',
  // set theory
  in: 'in', notin: 'in.not', ni: 'in.rev', subset: 'subset', supset: 'supset',
  subseteq: 'subset.eq', supseteq: 'supset.eq', subsetneq: 'subset.neq',
  supsetneq: 'supset.neq', nsubseteq: 'subset.eq.not', cup: 'union', cap: 'sect',
  bigcup: 'union.big', bigcap: 'sect.big', setminus: 'without',
  emptyset: 'nothing', varnothing: 'nothing',
  // logic
  wedge: 'and', land: 'and', vee: 'or', lor: 'or', neg: 'not', lnot: 'not',
  implies: 'arrow.r.double', iff: 'arrow.l.r.double',
  // operators
  cdot: 'dot.op', times: 'times', div: 'div', ast: 'ast', circ: 'compose',
  oplus: 'plus.circle', otimes: 'times.circle', odot: 'dot.circle',
  pm: 'plus.minus', mp: 'minus.plus', prod: 'product', int: 'integral',
  iint: 'integral.double', oint: 'integral.cont', partial: 'diff', infty: 'infinity',
  // arrows
  to: 'arrow.r', rightarrow: 'arrow.r', leftarrow: 'arrow.l', gets: 'arrow.l',
  leftrightarrow: 'arrow.l.r', Rightarrow: 'arrow.r.double', Leftarrow: 'arrow.l.double',
  Leftrightarrow: 'arrow.l.r.double', uparrow: 'arrow.t', downarrow: 'arrow.b',
  mapsto: 'arrow.r.bar', longrightarrow: 'arrow.r.long', longleftarrow: 'arrow.l.long',
  // delimiters / dots
  langle: 'angle.l', rangle: 'angle.r', lfloor: 'floor.l', rfloor: 'floor.r',
  lceil: 'ceil.l', rceil: 'ceil.r', lbrace: '{', rbrace: '}',
  ldots: 'dots.h', cdots: 'dots.h', dots: 'dots.h', vdots: 'dots.v', ddots: 'dots.down',
  prime: 'prime', hbar: 'planck.reduce',
  // greek variants
  varepsilon: 'epsilon.alt', vartheta: 'theta.alt', varphi: 'phi.alt',
  varrho: 'rho.alt', varsigma: 'sigma.alt', varpi: 'pi.alt', varkappa: 'kappa.alt',
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

function readScriptArg(src: string, i: number): { arg: string; next: number } {
  if (src[i] === '{') {
    const { content, next } = readGroup(src, i)
    return { arg: convert(content), next }
  }
  if (src[i] === '\\') {
    let j = i + 1
    while (j < src.length && /[a-zA-Z]/.test(src[j])) j++
    return { arg: convert(src.slice(i, j)), next: j }
  }
  return { arg: src[i] ?? '', next: i + 1 }
}

function mapCommand(name: string): string {
  if (COMMAND_MAP[name]) return COMMAND_MAP[name]
  if (SAFE_BARE.has(name)) return name
  // Unknown command: render as upright text so Typst never fails to compile.
  return `"${name}"`
}

function convert(latex: string): string {
  let src = latex
    .replace(/\\(left|right|big|Big|bigg|Bigg|displaystyle|textstyle|scriptstyle)\s*/g, '')
    .replace(/\\begin\{[^}]*\}|\\end\{[^}]*\}/g, ' ')
    .replace(/\\[,;:!]/g, ' ')
    .replace(/\\quad|\\qquad/g, ' ')
    .replace(/\\\\/g, ' ')
    .replace(/&/g, ' ')

  let out = ''
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
        out += src[i] ?? ''
        i += 1
      } else if (name === 'frac' || name === 'dfrac' || name === 'tfrac') {
        const a = readGroup(src, i); const b = readGroup(src, a.next)
        out += `frac(${convert(a.content)}, ${convert(b.content)})`
        i = b.next
      } else if (name === 'sqrt') {
        if (src[i] === '[') {
          const close = src.indexOf(']', i)
          const idx = src.slice(i + 1, close)
          const g = readGroup(src, close + 1)
          out += `root(${convert(idx)}, ${convert(g.content)})`
          i = g.next
        } else {
          const g = readGroup(src, i)
          out += `sqrt(${convert(g.content)})`
          i = g.next
        }
      } else if (STYLE_MAP[name] && src[i] === '{') {
        const g = readGroup(src, i)
        out += `${STYLE_MAP[name]}(${convert(g.content)})`
        i = g.next
      } else if ((name === 'text' || name === 'operatorname' || name === 'mbox') && src[i] === '{') {
        const g = readGroup(src, i)
        out += `"${g.content.replace(/"/g, '')}"`
        i = g.next
      } else {
        // Separate from a preceding alphanumeric so e.g. `A\Rightarrow` does not
        // glue into the identifier `Aarrow`. Trailing space separates from what follows.
        if (/[A-Za-z0-9]$/.test(out)) out += ' '
        out += `${mapCommand(name)} `
      }
    } else if (ch === '{') {
      const g = readGroup(src, i)
      out += `(${convert(g.content)})`
      i = g.next
    } else if (ch === '}') {
      i++
    } else if (ch === '^' || ch === '_') {
      const { arg, next } = readScriptArg(src, i + 1)
      out += `${ch}(${arg})`
      i = next
    } else {
      // Typst reads consecutive letters as one identifier, but in LaTeX `XZ`
      // means X·Z. Separate adjacent plain letters into distinct variables.
      if (/[A-Za-z]/.test(ch) && /[A-Za-z]$/.test(out)) out += ' '
      out += ch
      i++
    }
  }
  return out.replace(/\s+/g, ' ').trim()
}

/** Convert a LaTeX math string to Typst math markup (without the `$` delimiters). */
export function latexToTypstMath(latex: string): string {
  return convert(latex)
}
