import type { NevoSlashItem } from '../../../types/editor-plugin'
import type { useAiCompletion } from '../../../composables/useAiCompletion'
import { startAiStreaming, stopAiStreaming } from '../../../editor-core/plugins/ai-streaming'

export interface AiSlashItemDeps {
  ai: ReturnType<typeof useAiCompletion>
  t: (key: string) => string
  onError: (msg: string) => void
  requestAiAsk: (onSubmit: (instruction: string) => void) => void
}

export function buildAiSlashItems(deps: AiSlashItemDeps): NevoSlashItem[] {
  const { ai, t, onError, requestAiAsk } = deps

  const continueItem: NevoSlashItem = {
    id: 'ai-continue',
    title: t('editor.slash.ai.continue.title'),
    category: 'ai',
    keywords: ['ai', 'continue', 'write'],
    run({ view }) {
      const from = 0
      const to = view.state.selection.from
      const context = view.state.doc.textBetween(from, to, '\n', ' ')
      let pos = view.state.selection.to

      startAiStreaming(view, pos)

      const insertToken = (text: string) => {
        const tr = view.state.tr.insertText(text, pos)
        pos += text.length
        view.dispatch(tr)
      }

      void ai.generate({
        system: 'You are a writing assistant. Continue the user\'s text naturally. Output only the continuation, no preamble.',
        prompt: context,
        onToken: insertToken,
        onDone: () => stopAiStreaming(view),
        onError: (msg) => { stopAiStreaming(view); onError(msg) },
      })
    },
  }

  const summarizeItem: NevoSlashItem = {
    id: 'ai-summarize',
    title: t('editor.slash.ai.summarize.title'),
    category: 'ai',
    keywords: ['ai', 'summary', 'tldr'],
    run({ view }) {
      const from = 0
      const to = view.state.doc.content.size
      const context = view.state.doc.textBetween(from, to, '\n', ' ')
      let pos = view.state.selection.to

      startAiStreaming(view, pos)

      const insertToken = (text: string) => {
        const tr = view.state.tr.insertText(text, pos)
        pos += text.length
        view.dispatch(tr)
      }

      void ai.generate({
        system: 'You are a summarization assistant. Produce a concise summary. Output only the summary.',
        prompt: context,
        onToken: insertToken,
        onDone: () => stopAiStreaming(view),
        onError: (msg) => { stopAiStreaming(view); onError(msg) },
      })
    },
  }

  const askItem: NevoSlashItem = {
    id: 'ai-ask',
    title: t('editor.slash.ai.ask.title'),
    category: 'ai',
    keywords: ['ai', 'ask', 'prompt'],
    run({ view }) {
      requestAiAsk((instruction: string) => {
        if (!instruction.trim()) return

        // Recompute pos from current selection at submit time
        let pos = view.state.selection.to

        startAiStreaming(view, pos)

        const insertToken = (text: string) => {
          const tr = view.state.tr.insertText(text, pos)
          pos += text.length
          view.dispatch(tr)
        }

        void ai.generate({
          system: 'You are a helpful writing assistant. Output only the answer, no preamble.',
          prompt: instruction,
          onToken: insertToken,
          onDone: () => stopAiStreaming(view),
          onError: (msg) => { stopAiStreaming(view); onError(msg) },
        })
      })
    },
  }

  return [continueItem, summarizeItem, askItem]
}
