import { Plugin, PluginKey } from 'prosemirror-state'
import { Decoration, DecorationSet } from 'prosemirror-view'
import type { EditorView } from 'prosemirror-view'

export const aiStreamingPluginKey = new PluginKey<AiStreamingState>('ai-streaming')

export type AiStreamingMeta =
  | { type: 'start'; pos: number }
  | { type: 'stop' }

interface AiStreamingState {
  active: { from: number; to: number } | null
}

export function createAiStreamingPlugin(): Plugin {
  return new Plugin<AiStreamingState>({
    key: aiStreamingPluginKey,

    state: {
      init(): AiStreamingState {
        return { active: null }
      },

      apply(tr, value): AiStreamingState {
        let active = value.active
          ? {
              from: tr.mapping.map(value.active.from, -1),
              to: tr.mapping.map(value.active.to, 1),
            }
          : null

        const meta = tr.getMeta(aiStreamingPluginKey) as AiStreamingMeta | undefined
        if (meta) {
          if (meta.type === 'start') {
            active = { from: meta.pos, to: meta.pos }
          } else if (meta.type === 'stop') {
            active = null
          }
        }

        return { active }
      },
    },

    props: {
      decorations(state) {
        const pluginState = aiStreamingPluginKey.getState(state)
        if (!pluginState?.active) return null

        const { from, to } = pluginState.active
        const decos: Decoration[] = []

        if (to > from) {
          decos.push(
            Decoration.inline(from, to, { class: 'ai-streaming-text' }),
          )
        }

        decos.push(
          Decoration.widget(
            to,
            () => {
              const el = document.createElement('span')
              el.className = 'ai-streaming-caret'
              el.setAttribute('aria-hidden', 'true')
              return el
            },
            { side: 1, key: 'ai-streaming-caret' },
          ),
        )

        return DecorationSet.create(state.doc, decos)
      },
    },
  })
}

export function startAiStreaming(view: EditorView, pos: number): void {
  view.dispatch(
    view.state.tr.setMeta(aiStreamingPluginKey, { type: 'start', pos } satisfies AiStreamingMeta),
  )
}

export function stopAiStreaming(view: EditorView): void {
  view.dispatch(
    view.state.tr.setMeta(aiStreamingPluginKey, { type: 'stop' } satisfies AiStreamingMeta),
  )
}
