// Shared source-size guard for heavy embedded blocks (mermaid/vega/markmap).
// Their rendering libraries hand arbitrarily large input straight to a parser
// with no bound of their own, which can hang or crash the tab on
// adversarial/huge source text. Node views skip invoking the library above
// this length and show a "too large" placeholder instead — see mermaid.ts,
// vega.ts, markmap.ts.
export const MAX_EMBED_SOURCE_CHARS = 100_000
