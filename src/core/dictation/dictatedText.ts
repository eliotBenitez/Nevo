export type DictationOp = { kind: 'text'; text: string } | { kind: 'paragraph' }

const NO_SPACE_AFTER = /[\s([{«"']$/
const LEADING_PUNCTUATION = /^[,.!?:;…]/

/** Returns `chunk` ready to insert after `textBefore` with exactly the spacing it needs. */
export function joinDictatedText(textBefore: string, chunk: string): string {
  const text = chunk.trim()
  if (!text || !textBefore || NO_SPACE_AFTER.test(textBefore) || LEADING_PUNCTUATION.test(text)) return text
  return ` ${text}`
}

const PARAGRAPH_COMMAND = /(?<![\p{L}\p{N}])(?:новый абзац|new paragraph|neuer absatz|nouveau paragraphe|nuevo párrafo)(?![\p{L}\p{N}])[,.!?:;…]*/giu

/** Splits recognized text into text runs and spoken "new paragraph" commands. */
export function splitSpokenCommands(text: string): DictationOp[] {
  const ops: DictationOp[] = []
  const pushText = (value: string) => {
    const trimmed = value.trim()
    if (trimmed) ops.push({ kind: 'text', text: trimmed })
  }
  const normalized = text.normalize('NFC')
  let last = 0
  for (const match of normalized.matchAll(PARAGRAPH_COMMAND)) {
    pushText(normalized.slice(last, match.index))
    ops.push({ kind: 'paragraph' })
    last = match.index + match[0].length
  }
  pushText(normalized.slice(last))
  return ops
}
