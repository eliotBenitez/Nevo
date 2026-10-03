import type { Node as ProseMirrorNode } from 'prosemirror-model'
import { createWordCounter } from '../utils/noteWordCount'

export interface DocStats {
  chars: number
  words: number
}

/**
 * Computes character and word counts in a single tree walk, replicating (for
 * both counts at once) what the previous implementation got from two
 * separate full-document string builds:
 *  - chars matched `doc.textContent`, i.e. `textBetween(0, size, "")` — leaf
 *    nodes contribute nothing unless their node type defines `spec.leafText`.
 *  - words matched `doc.textBetween(0, size, '\n', '\n')` — a `'\n'`
 *    separator is inserted before each textblock (except the very first
 *    contributing node) and before/as any other leaf node, so a block or atom
 *    boundary can never merge two words, mirroring
 *    `Fragment.prototype.textBetween` in prosemirror-model.
 * Neither derived string is ever materialized: chars is a running sum and
 * words is fed incrementally into `createWordCounter`, which only needs to
 * remember whether the previous chunk ended mid-word.
 */
export function computeDocStats(doc: ProseMirrorNode): DocStats {
  let chars = 0
  const wordCounter = createWordCounter()
  // Mirrors Fragment.textBetween's local `first` flag for the word-count
  // virtual production: only a node that is itself separator-eligible
  // (a textblock, or a block leaf with text) advances it.
  let wordsStarted = false

  doc.nodesBetween(0, doc.content.size, (node) => {
    if (node.isText) {
      const text = node.text ?? ''
      chars += text.length
      wordCounter.feed(text)
      return
    }

    // `wordNodeText` mirrors what `textBetween(from, to, '\n', '\n')` would
    // produce for this node: '' for a non-leaf container (paragraph content
    // is reached separately via its text-node children), '\n' for any leaf.
    let wordNodeText = ''
    if (node.isLeaf) {
      wordNodeText = '\n'
      // Chars mirror plain `textContent` (no leafText argument passed), so a
      // leaf only contributes characters if its node type declares its own
      // `spec.leafText` — none of ours currently do, but this keeps parity
      // with `Fragment.textBetween` if one ever does.
      const leafTextSpec = node.type.spec.leafText
      const specText = typeof leafTextSpec === 'function' ? leafTextSpec(node) : leafTextSpec
      if (specText) chars += specText.length
    }

    if (node.isBlock && ((node.isLeaf && wordNodeText) || node.isTextblock)) {
      if (wordsStarted) wordCounter.feed('\n')
      wordsStarted = true
    }
    if (wordNodeText) wordCounter.feed(wordNodeText)
  })

  return { chars, words: wordCounter.count }
}
