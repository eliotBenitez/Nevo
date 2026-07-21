import { describe, expect, it } from 'vitest'
import {
  stripObsidianComments,
  transformCallouts,
  calloutVariantForType,
  applyHighlights,
  extractInlineTags,
} from './obsidianSyntax'
import type { BlockNode } from '../../../types/note'

function paragraph(...content: BlockNode[]): BlockNode {
  return { type: 'paragraph', content }
}

function text(value: string, marks?: BlockNode['marks']): BlockNode {
  return marks ? { type: 'text', text: value, marks } : { type: 'text', text: value }
}

function doc(...content: BlockNode[]): BlockNode {
  return { type: 'doc', content }
}

describe('stripObsidianComments', () => {
  it('removes an inline comment and closes the resulting gap', () => {
    expect(stripObsidianComments('before %%hidden%% after')).toBe('before after')
  })

  it('removes a comment spanning multiple lines', () => {
    const input = 'intro\n\n%%\nnote to self\nmore\n%%\n\noutro'
    expect(stripObsidianComments(input)).toBe('intro\n\noutro')
  })

  it('leaves content inside fenced code blocks untouched', () => {
    const input = 'text %%gone%%\n\n```js\nconst a = 1 // %%kept%%\n```\n\ntail'
    const result = stripObsidianComments(input)
    expect(result).toContain('%%kept%%')
    expect(result).not.toContain('%%gone%%')
  })

  it('leaves tilde-fenced code blocks untouched', () => {
    const input = '~~~\n%%kept%%\n~~~'
    expect(stripObsidianComments(input)).toBe(input)
  })

  it('leaves inline code spans untouched', () => {
    expect(stripObsidianComments('use `%%literal%%` here')).toBe('use `%%literal%%` here')
  })

  it('preserves a markdown hard break when there is no comment to remove', () => {
    const input = 'first line  \nsecond line'
    expect(stripObsidianComments(input)).toBe(input)
  })

  it('preserves a markdown hard break on lines it did strip a comment from', () => {
    expect(stripObsidianComments('first %%x%% line  \nsecond')).toBe('first line  \nsecond')
  })

  it('returns markdown without comments unchanged', () => {
    const input = '# Title\n\nSome **bold** text.\n\n- a\n- b'
    expect(stripObsidianComments(input)).toBe(input)
  })
})

describe('calloutVariantForType', () => {
  it('maps known types case-insensitively', () => {
    expect(calloutVariantForType('WARNING')).toEqual({ variant: 'warning', icon: '⚠️' })
    expect(calloutVariantForType('success')).toEqual({ variant: 'success', icon: '✅' })
    expect(calloutVariantForType('danger')).toEqual({ variant: 'danger', icon: '⛔' })
  })

  it('falls back to the generic info style for unknown types', () => {
    expect(calloutVariantForType('totally-made-up')).toEqual({ variant: 'info', icon: '💡' })
  })
})

describe('transformCallouts', () => {
  it('converts a marked blockquote into a callout with variant and icon', () => {
    const input = doc({
      type: 'blockquote',
      content: [paragraph(text('[!warning]\nbe careful'))],
    })
    const result = transformCallouts(input)
    const callout = result.content?.[0]

    expect(callout?.type).toBe('callout')
    expect(callout?.attrs).toEqual({ variant: 'warning', icon: '⚠️' })
    expect(callout?.content).toEqual([paragraph(text('be careful'))])
  })

  it('promotes the callout title to a leading bold paragraph', () => {
    const input = doc({
      type: 'blockquote',
      content: [paragraph(text('[!note] Remember this\nbody text'))],
    })
    const callout = transformCallouts(input).content?.[0]

    expect(callout?.content?.[0]).toEqual(
      paragraph(text('Remember this', [{ type: 'strong' }])),
    )
    expect(callout?.content?.[1]).toEqual(paragraph(text('body text')))
  })

  it('accepts foldable markers and keeps multi-block bodies', () => {
    const input = doc({
      type: 'blockquote',
      content: [
        paragraph(text('[!tip]- Collapsed')),
        paragraph(text('second block')),
      ],
    })
    const callout = transformCallouts(input).content?.[0]

    expect(callout?.type).toBe('callout')
    expect(callout?.attrs).toEqual({ variant: 'info', icon: '💡' })
    expect(callout?.content).toEqual([
      paragraph(text('Collapsed', [{ type: 'strong' }])),
      paragraph(text('second block')),
    ])
  })

  it('emits an empty paragraph for a callout with no body', () => {
    const input = doc({ type: 'blockquote', content: [paragraph(text('[!info]'))] })
    const callout = transformCallouts(input).content?.[0]

    expect(callout?.type).toBe('callout')
    expect(callout?.content).toEqual([{ type: 'paragraph' }])
  })

  it('leaves a plain blockquote untouched', () => {
    const input = doc({ type: 'blockquote', content: [paragraph(text('just a quote'))] })
    expect(transformCallouts(input)).toEqual(input)
  })

  it('converts a callout nested inside a list item', () => {
    const input = doc({
      type: 'bullet_list',
      content: [{
        type: 'list_item',
        content: [{ type: 'blockquote', content: [paragraph(text('[!bug] Broken'))] }],
      }],
    })
    const nested = transformCallouts(input).content?.[0]?.content?.[0]?.content?.[0]

    expect(nested?.type).toBe('callout')
    expect(nested?.attrs).toEqual({ variant: 'danger', icon: '🐛' })
  })

  it('does not mutate the input tree', () => {
    const input = doc({ type: 'blockquote', content: [paragraph(text('[!note] Title'))] })
    const snapshot = structuredClone(input)
    transformCallouts(input)
    expect(input).toEqual(snapshot)
  })
})

describe('applyHighlights', () => {
  it('splits a highlight out of surrounding text', () => {
    const result = applyHighlights(doc(paragraph(text('a ==bright== b'))))

    expect(result.content?.[0].content).toEqual([
      text('a '),
      text('bright', [{ type: 'highlight', attrs: { color: '#fef08a' } }]),
      text(' b'),
    ])
  })

  it('preserves pre-existing marks on the highlighted run', () => {
    const result = applyHighlights(doc(paragraph(text('==x==', [{ type: 'strong' }]))))

    expect(result.content?.[0].content).toEqual([
      text('x', [{ type: 'strong' }, { type: 'highlight', attrs: { color: '#fef08a' } }]),
    ])
  })

  it('handles several highlights in one text node', () => {
    const result = applyHighlights(doc(paragraph(text('==one== mid ==two=='))))
    const parts = result.content?.[0].content ?? []

    expect(parts).toHaveLength(3)
    expect(parts[0].text).toBe('one')
    expect(parts[1].text).toBe(' mid ')
    expect(parts[2].text).toBe('two')
  })

  it('skips text already carrying a code mark', () => {
    const input = doc(paragraph(text('==literal==', [{ type: 'code' }])))
    expect(applyHighlights(input)).toEqual(input)
  })

  // A fenced code block's source is an unmarked text child, so the code-mark
  // guard cannot catch it — the block itself has to be skipped.
  it('leaves a fenced code block untouched', () => {
    const input = doc({
      type: 'code_block',
      attrs: { language: 'js' },
      content: [text('const a = "==not a highlight=="')],
    })
    expect(applyHighlights(input)).toEqual(input)
  })

  it('leaves text without highlights unchanged', () => {
    const input = doc(paragraph(text('nothing here')))
    expect(applyHighlights(input)).toEqual(input)
  })

  it('applies highlights nested deep in the tree', () => {
    const input = doc({
      type: 'bullet_list',
      content: [{ type: 'list_item', content: [paragraph(text('==deep=='))] }],
    })
    const nestedText = applyHighlights(input).content?.[0]?.content?.[0]?.content?.[0]?.content?.[0]

    expect(nestedText?.marks).toEqual([{ type: 'highlight', attrs: { color: '#fef08a' } }])
  })
})

describe('extractInlineTags', () => {
  it('collects tags that start with a letter', () => {
    expect(extractInlineTags(doc(paragraph(text('about #rust and #web-dev'))))).toEqual(['rust', 'web-dev'])
  })

  it('supports nested tag paths', () => {
    expect(extractInlineTags(doc(paragraph(text('#area/work/notes'))))).toEqual(['area/work/notes'])
  })

  it('ignores numeric references like #1 and #fff', () => {
    expect(extractInlineTags(doc(paragraph(text('issue #1 color #123456'))))).toEqual([])
  })

  it('ignores a trailing hash in a word such as C#', () => {
    expect(extractInlineTags(doc(paragraph(text('written in C# mostly'))))).toEqual([])
  })

  it('de-duplicates while preserving first-seen order', () => {
    const input = doc(paragraph(text('#b #a #b')), paragraph(text('#a #c')))
    expect(extractInlineTags(input)).toEqual(['b', 'a', 'c'])
  })

  it('skips text carrying a code mark', () => {
    expect(extractInlineTags(doc(paragraph(text('#notatag', [{ type: 'code' }]))))).toEqual([])
  })

  // Same root cause as the highlight case: the fenced block's text child is
  // unmarked, so a comment like `// #nottag` would otherwise become a real tag.
  it('does not harvest tags out of a fenced code block', () => {
    const input = doc({
      type: 'code_block',
      attrs: { language: 'js' },
      content: [text('const b = 1 // #nottag')],
    })
    expect(extractInlineTags(input)).toEqual([])
  })

  it('finds tags nested deep in the tree', () => {
    const input = doc({
      type: 'bullet_list',
      content: [{ type: 'list_item', content: [paragraph(text('#nested'))] }],
    })
    expect(extractInlineTags(input)).toEqual(['nested'])
  })

  it('returns an empty list for a tag-free document', () => {
    expect(extractInlineTags(doc(paragraph(text('plain text'))))).toEqual([])
  })
})
