import { ref, watch, type Ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { RecentWorkspace } from '../../../types/workspace'
import { workspaceCommands } from '../../../tauri/commands'
import { workspaceNoteCount } from '../../../utils/workspace-note-count'
import { pluralChoice } from '../../../utils/plural-index'

export function useRecentWorkspaceNoteCounts(workspaces: Ref<RecentWorkspace[]>) {
  const { t, locale } = useI18n()
  const counts = ref<Record<string, number>>({})

  watch(() => workspaces.value.map(workspace => workspace.path), (paths, _, onCleanup) => {
    let cancelled = false
    onCleanup(() => { cancelled = true })
    counts.value = {}
    for (const path of new Set(paths)) {
      void workspaceCommands.loadManifest(path).then(manifest => {
        if (!cancelled) counts.value[path] = workspaceNoteCount(manifest)
      }).catch(() => {
        // An unavailable workspace has no known count, rather than zero notes.
      })
    }
  }, { immediate: true })

  function noteCountLabel(path: string): string | null {
    const count = counts.value[path]
    if (count === undefined) return null
    return t('onboarding.noteCount', pluralChoice(locale.value, count), {
      named: { count: count.toLocaleString(locale.value) },
    })
  }

  return { noteCountLabel }
}
