import { onMounted, onUnmounted } from 'vue'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import { useI18n } from 'vue-i18n'
import { useToast } from '../../ui/composables/useToast'

interface GithubSyncResultEvent {
  ok: boolean
  auto: boolean
  commitSha?: string | null
  filesCount?: number | null
  error?: string | null
}

function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

/**
 * Surfaces GitHub Sync outcomes as toasts. Both manual (`Sync now`) and the
 * background auto-sync run through the same Rust `perform_sync`, which emits a
 * `github-sync-result` event — so a single listener covers every path. Timed
 * auto-sync successes stay silent to avoid nagging; errors always surface.
 */
export function useGithubSyncNotifications(): void {
  const { t } = useI18n()
  const { showToast } = useToast()
  let unlisten: UnlistenFn | null = null

  onMounted(async () => {
    if (!isTauriRuntime()) return
    try {
      unlisten = await listen<GithubSyncResultEvent>('github-sync-result', ({ payload }) => {
        if (payload.ok) {
          if (payload.auto) return
          const count = payload.filesCount
          showToast({
            variant: 'success',
            title: t('settings.plugins.githubSync.toast.successTitle'),
            message: count != null
              ? t('settings.plugins.githubSync.toast.successDetail', { count })
              : t('settings.plugins.githubSync.toast.success'),
          })
        } else {
          showToast({
            variant: 'error',
            title: t('settings.plugins.githubSync.toast.errorTitle'),
            message: payload.error || t('settings.plugins.githubSync.toast.error'),
            duration: 8000,
          })
        }
      })
    } catch {
      // Event bridge is unavailable outside the Tauri runtime.
    }
  })

  onUnmounted(() => {
    unlisten?.()
    unlisten = null
  })
}
