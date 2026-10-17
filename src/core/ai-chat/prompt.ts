export interface ChatSource {
  /** 1-based citation number. */
  n: number
  noteId: string
  noteTitle: string
  blockIndex: number | null
  text: string
  /** The open note; never dropped by the source budget. */
  current?: boolean
}

export interface ChatTurn {
  role: 'user' | 'assistant'
  text: string
}

export interface ChatPromptInput {
  question: string
  history: ChatTurn[]
  sources: ChatSource[]
  selection?: string
  locale: string
}

export const MAX_HISTORY_TURNS = 6
export const MAX_SOURCES_CHARS = 12_000

const SYSTEM = [
  'You are the assistant inside the Nevo note-taking app.',
  'Answer only from the numbered sources and the conversation.',
  'Cite the sources you used with [n] right after the claim, for example [1] or [1][3].',
  'If the notes do not contain the answer, say so plainly instead of guessing.',
  'Answer in the language of the question.',
  'Markdown is allowed.',
].join('\n')

const SELECTION_RULE = 'When the user asks to rewrite the selected text, output only the rewritten text, without commentary or citations.'

/** Drops the lowest-ranked (highest n) sources until the budget fits; the current-note source always stays. */
export function fitSources(sources: ChatSource[], budget = MAX_SOURCES_CHARS): ChatSource[] {
  const kept = [...sources]
  let total = kept.reduce((sum, s) => sum + s.text.length, 0)
  for (let i = kept.length - 1; i >= 0 && total > budget; i--) {
    if (kept[i].current) continue
    total -= kept[i].text.length
    kept.splice(i, 1)
  }
  return kept
}

export function buildChatPrompt(input: ChatPromptInput): { system: string; prompt: string } {
  const sources = fitSources(input.sources)
  const history = input.history.slice(-MAX_HISTORY_TURNS)
  const parts: string[] = []

  if (sources.length) {
    parts.push('Sources:\n' + sources.map(s => `[${s.n}] ${s.noteTitle}\n${s.text}`).join('\n\n'))
  } else {
    parts.push('Sources: none')
  }
  if (history.length) {
    parts.push('Conversation so far:\n' + history.map(t => `${t.role === 'user' ? 'User' : 'Assistant'}: ${t.text}`).join('\n'))
  }
  if (input.selection) parts.push(`Selected text:\n${input.selection}`)
  parts.push(`Question (user interface language: ${input.locale}):\n${input.question}`)

  return {
    system: input.selection ? `${SYSTEM}\n${SELECTION_RULE}` : SYSTEM,
    prompt: parts.join('\n\n'),
  }
}
