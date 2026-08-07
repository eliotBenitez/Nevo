import { describe, expect, it } from 'vitest'
import { latexToTypstMath } from './latexToTypstMath'

type SymbolCase = readonly [command: string, symbol: string]

const RELATION_CASES: SymbolCase[] = [
  ['le', '≤'], ['leq', '≤'], ['ge', '≥'], ['geq', '≥'],
  ['neq', '≠'], ['ne', '≠'], ['ll', '≪'], ['gg', '≫'],
  ['equiv', '≡'], ['cong', '≅'], ['simeq', '≃'], ['sim', '∼'],
  ['approx', '≈'], ['asymp', '≍'], ['propto', '∝'],
  ['parallel', '∥'], ['perp', '⊥'], ['mid', '∣'], ['models', '⊨'],
  ['prec', '≺'], ['succ', '≻'], ['preceq', '⪯'], ['succeq', '⪰'],
  ['doteq', '≐'], ['vdash', '⊢'], ['dashv', '⊣'],
  ['nleq', '≰'], ['ngeq', '≱'], ['nless', '≮'], ['ngtr', '≯'],
  ['nparallel', '∦'], ['nmid', '∤'], ['ncong', '≆'], ['nsim', '≁'],
]

const SET_CASES: SymbolCase[] = [
  ['in', '∈'], ['notin', '∉'], ['ni', '∋'],
  ['subset', '⊂'], ['supset', '⊃'], ['subseteq', '⊆'], ['supseteq', '⊇'],
  ['subsetneq', '⊊'], ['supsetneq', '⊋'],
  ['nsubseteq', '⊈'], ['nsupseteq', '⊉'],
  ['cup', '∪'], ['cap', '∩'], ['bigcup', '⋃'], ['bigcap', '⋂'],
  ['setminus', '∖'], ['emptyset', '∅'], ['varnothing', '∅'],
]

const LOGIC_CASES: SymbolCase[] = [
  ['wedge', '∧'], ['land', '∧'], ['vee', '∨'], ['lor', '∨'],
  ['neg', '¬'], ['lnot', '¬'], ['implies', '⟹'], ['impliedby', '⟸'],
  ['iff', '⟺'], ['forall', '∀'], ['exists', '∃'], ['nexists', '∄'],
  ['therefore', '∴'], ['because', '∵'],
]

const OPERATOR_CASES: SymbolCase[] = [
  ['cdot', '⋅'], ['times', '×'], ['div', '÷'], ['ast', '∗'], ['circ', '∘'],
  ['oplus', '⊕'], ['otimes', '⊗'], ['odot', '⊙'],
  ['ominus', '⊖'], ['oslash', '⊘'], ['uplus', '⊎'],
  ['sqcap', '⊓'], ['sqcup', '⊔'], ['pm', '±'], ['mp', '∓'],
  ['sum', '∑'], ['prod', '∏'], ['coprod', '∐'],
  ['int', '∫'], ['iint', '∬'], ['iiint', '∭'],
  ['oint', '∮'], ['oiint', '∯'], ['oiiint', '∰'],
  ['bigvee', '⋁'], ['bigwedge', '⋀'], ['biguplus', '⨄'], ['bigsqcup', '⨆'],
  ['bigoplus', '⨁'], ['bigotimes', '⨂'], ['bigodot', '⨀'],
  ['partial', '∂'], ['infty', '∞'],
]

const ARROW_CASES: SymbolCase[] = [
  ['to', '→'], ['rightarrow', '→'], ['leftarrow', '←'], ['gets', '←'],
  ['leftrightarrow', '↔'], ['Rightarrow', '⇒'], ['Leftarrow', '⇐'],
  ['Leftrightarrow', '⇔'],
  ['longrightarrow', '⟶'], ['longleftarrow', '⟵'], ['longleftrightarrow', '⟷'],
  ['Longrightarrow', '⟹'], ['Longleftarrow', '⟸'], ['Longleftrightarrow', '⟺'],
  ['uparrow', '↑'], ['downarrow', '↓'], ['updownarrow', '↕'],
  ['Uparrow', '⇑'], ['Downarrow', '⇓'], ['Updownarrow', '⇕'],
  ['nearrow', '↗'], ['searrow', '↘'], ['swarrow', '↙'], ['nwarrow', '↖'],
  ['mapsto', '↦'], ['longmapsto', '⟼'],
  ['hookleftarrow', '↩'], ['hookrightarrow', '↪'],
  ['leftharpoonup', '↼'], ['leftharpoondown', '↽'],
  ['rightharpoonup', '⇀'], ['rightharpoondown', '⇁'],
  ['rightleftharpoons', '⇌'], ['leftrightharpoons', '⇋'],
  ['nleftarrow', '↚'], ['nrightarrow', '↛'], ['nleftrightarrow', '↮'],
  ['nLeftarrow', '⇍'], ['nRightarrow', '⇏'], ['nLeftrightarrow', '⇎'],
  ['twoheadleftarrow', '↞'], ['twoheadrightarrow', '↠'],
  ['leftarrowtail', '↢'], ['rightarrowtail', '↣'],
  ['dashleftarrow', '⇠'], ['dashrightarrow', '⇢'],
  ['rightsquigarrow', '⇝'], ['leadsto', '⇝'], ['leftrightsquigarrow', '↭'],
]

const MISC_CASES: SymbolCase[] = [
  ['langle', '⟨'], ['rangle', '⟩'], ['lfloor', '⌊'], ['rfloor', '⌋'],
  ['lceil', '⌈'], ['rceil', '⌉'], ['lbrace', '{'], ['rbrace', '}'],
  ['ldots', '…'], ['cdots', '⋯'], ['dots', '…'], ['vdots', '⋮'], ['ddots', '⋱'],
  ['prime', '′'], ['hbar', 'ℏ'], ['diamond', '⋄'], ['bullet', '∙'],
  ['angle', '∠'], ['triangle', '△'], ['square', '□'], ['star', '⋆'], ['dagger', '†'],
  ['top', '⊤'], ['bot', '⊥'], ['nabla', '∇'], ['aleph', 'ℵ'],
  ['ell', 'ℓ'], ['Re', 'ℜ'], ['Im', 'ℑ'],
]

const GREEK_CASES: SymbolCase[] = [
  ['alpha', 'α'], ['beta', 'β'], ['gamma', 'γ'], ['delta', 'δ'],
  ['epsilon', 'ϵ'], ['varepsilon', 'ε'], ['zeta', 'ζ'], ['eta', 'η'],
  ['theta', 'θ'], ['vartheta', 'ϑ'], ['iota', 'ι'],
  ['kappa', 'κ'], ['varkappa', 'ϰ'], ['lambda', 'λ'], ['mu', 'μ'], ['nu', 'ν'],
  ['xi', 'ξ'], ['omicron', 'ο'], ['pi', 'π'], ['varpi', 'ϖ'],
  ['rho', 'ρ'], ['varrho', 'ϱ'], ['sigma', 'σ'], ['varsigma', 'ς'],
  ['tau', 'τ'], ['upsilon', 'υ'], ['phi', 'ϕ'], ['varphi', 'φ'],
  ['chi', 'χ'], ['psi', 'ψ'], ['omega', 'ω'],
  ['Gamma', 'Γ'], ['Delta', 'Δ'], ['Theta', 'Θ'], ['Lambda', 'Λ'],
  ['Xi', 'Ξ'], ['Pi', 'Π'], ['Sigma', 'Σ'], ['Upsilon', 'Υ'],
  ['Phi', 'Φ'], ['Psi', 'Ψ'], ['Omega', 'Ω'],
]

const SYMBOL_CASES = [
  ...RELATION_CASES,
  ...SET_CASES,
  ...LOGIC_CASES,
  ...OPERATOR_CASES,
  ...ARROW_CASES,
  ...MISC_CASES,
  ...GREEK_CASES,
]

describe('latexToTypstMath symbol compatibility', () => {
  it.each(SYMBOL_CASES)('maps \\%s to the exact %s glyph', (command, symbol) => {
    expect(latexToTypstMath(`\\${command}`)).toBe(symbol)
  })
})
