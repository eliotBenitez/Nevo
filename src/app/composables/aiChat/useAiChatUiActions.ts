import { useI18n } from 'vue-i18n'
import type { AiChatSelection } from '../../../stores/aiChat'
import { useToast } from '../../../ui/composables/useToast'
import { EditorUnavailableError } from '../editor/mcpEditorOperations'
import { EmptyAnswerError, SelectionChangedError } from './aiChatEditorActions'
import type { useAiChatActions } from './useAiChatActions'

type AiChatActions = ReturnType<typeof useAiChatActions>

/** Wraps the editor actions with localized toasts so components only emit intents. */
export function useAiChatUiActions(actions: AiChatActions) {
  const { t } = useI18n()
  const { showToast } = useToast()

  function fail(error: unknown, fallbackKey = 'aiChat.toast.actionFailed') {
    const key = error instanceof SelectionChangedError ? 'aiChat.toast.selectionChanged'
      : error instanceof EmptyAnswerError ? 'aiChat.toast.emptyAnswer'
        : error instanceof EditorUnavailableError ? 'aiChat.toast.editorUnavailable'
          : fallbackKey
    showToast({ message: t(key), variant: 'error' })
  }

  function insert(markdown: string) {
    try { actions.insert(markdown) } catch (error) { fail(error) }
  }

  function replace(capture: AiChatSelection, markdown: string) {
    try { actions.replace(capture, markdown) } catch (error) { fail(error) }
  }

  async function copy(markdown: string) {
    try { await actions.copy(markdown) } catch (error) { fail(error, 'aiChat.toast.copyFailed') }
  }

  async function saveAsNote(question: string, markdown: string) {
    try {
      await actions.createNote(question, markdown, t('aiChat.untitled'))
      showToast({ message: t('aiChat.toast.noteCreated'), variant: 'success' })
    } catch (error) {
      fail(error, 'aiChat.toast.createFailed')
    }
  }

  return { insert, replace, copy, saveAsNote }
}
