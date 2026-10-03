import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useWorkspaceStore } from '../stores/workspace'
import { useToast } from '../ui/composables/useToast'
import { promptPassword } from '../ui/composables/usePasswordPrompt'
import { workspaceTransferCommands } from '../tauri/workspaceTransfer'
import type { MergeReport, TransferProgress } from '../types/workspace-transfer'
import { isWorkspaceSchemaTooNewError } from '../utils/workspaceSchemaError'

export type TransferStage = 'idle' | 'starting' | 'packing' | 'encrypting' | 'extracting' | 'finishing'

/** Which transfer operation `isBusy`/`stage`/`progress` currently describe.
 * Lets a panel with multiple transfer actions (export + merge) show the
 * progress row only under the action the user actually triggered. */
export type TransferAction = 'export' | 'importAsNew' | 'merge' | null

type TransferErrorKind =
  | 'incorrectPassword'
  | 'passwordRequired'
  | 'notNevoArchive'
  | 'unsupportedVersion'
  | 'workspaceSchemaTooNew'
  | 'destinationNotEmpty'
  | 'unknown'

/** Mirrors the private helper in `src/composables/useNoteExport.ts` — kept
 * local rather than imported since that helper isn't exported and this
 * change should not touch unrelated export code. */
function sanitizeFilename(title: string, fallback: string): string {
  const safe = title.replace(/[/\\?%*:|"<>]/g, '-').trim()
  return safe || fallback
}

function normalizePassword(password: string | null | undefined): string | null {
  if (password == null) return null
  const trimmed = password.trim()
  return trimmed.length > 0 ? trimmed : null
}

/** Classifies a Rust command error string against the exact messages emitted
 * by `src-tauri/src/commands/workspace_transfer/archive_read.rs` / `mod.rs`,
 * so the UI can react (re-prompt for a password) instead of just displaying
 * the raw message. */
function classifyTransferError(message: string): TransferErrorKind {
  if (/incorrect archive password/i.test(message)) return 'incorrectPassword'
  if (/password-protected.*password is required/i.test(message)) return 'passwordRequired'
  if (/not a valid nevo workspace archive/i.test(message)) return 'notNevoArchive'
  if (isWorkspaceSchemaTooNewError(message)) return 'workspaceSchemaTooNew'
  if (/incompatible app version/i.test(message)) return 'unsupportedVersion'
  if (/empty folder/i.test(message)) return 'destinationNotEmpty'
  return 'unknown'
}

const MAX_PASSWORD_ATTEMPTS = 5

export function useWorkspaceTransfer() {
  const { t } = useI18n()
  const workspaceStore = useWorkspaceStore()
  const { showToast } = useToast()

  const isBusy = ref(false)
  const stage = ref<TransferStage>('idle')
  /** 0-100, or `null` while a stage has no meaningful percentage (encrypting/finishing). */
  const progress = ref<number | null>(null)
  const lastError = ref<string | null>(null)
  const activeAction = ref<TransferAction>(null)

  function resetProgress() {
    stage.value = 'idle'
    progress.value = null
    lastError.value = null
  }

  function onProgress(event: TransferProgress) {
    switch (event.type) {
      case 'started':
        stage.value = 'starting'
        progress.value = 0
        break
      case 'file':
        stage.value = 'packing'
        progress.value = event.total > 0 ? Math.round((event.done / event.total) * 100) : 0
        break
      case 'encrypting':
        stage.value = 'encrypting'
        progress.value = null
        break
      case 'extracting':
        stage.value = 'extracting'
        progress.value = event.total > 0 ? Math.round((event.done / event.total) * 100) : 0
        break
      case 'finished':
        stage.value = 'finishing'
        progress.value = 100
        break
    }
  }

  function friendlyErrorMessage(kind: TransferErrorKind, raw: string): string {
    switch (kind) {
      case 'incorrectPassword': return t('workspaceTransfer.errors.incorrectPassword')
      case 'passwordRequired': return t('workspaceTransfer.errors.passwordRequired')
      case 'notNevoArchive': return t('workspaceTransfer.errors.notNevoArchive')
      case 'unsupportedVersion': return t('workspaceTransfer.errors.unsupportedVersion')
      case 'workspaceSchemaTooNew': return t('workspaceTransfer.errors.workspaceSchemaTooNew')
      case 'destinationNotEmpty': return t('workspaceTransfer.errors.destinationNotEmpty')
      default: return raw
    }
  }

  /** Exports the currently open local workspace to a `.nevoz` archive picked
   * via a native save dialog. Prompts for an optional password unless one is
   * passed explicitly (used by tests / future automation). */
  async function exportWorkspace(options?: { password?: string }): Promise<void> {
    if (workspaceStore.backendKind !== 'local' || !workspaceStore.activePath) {
      showToast({ variant: 'error', message: t('workspaceTransfer.errors.localOnly') })
      return
    }

    let password = normalizePassword(options?.password)
    if (options?.password === undefined) {
      const entered = await promptPassword({
        title: t('workspaceTransfer.passwordPrompt.exportTitle'),
        message: t('workspaceTransfer.passwordPrompt.exportMessage'),
        label: t('workspaceTransfer.passwordPrompt.exportLabel'),
        placeholder: t('workspaceTransfer.passwordPrompt.placeholder'),
        confirmLabel: t('workspaceTransfer.passwordPrompt.confirmExport'),
        required: false,
      })
      if (entered === null) return
      password = normalizePassword(entered)
    }

    const workspacePath = workspaceStore.activePath
    const name = workspaceStore.manifest?.name ?? 'workspace'
    const defaultFileName = `${sanitizeFilename(name, 'workspace')}-export.nevoz`

    activeAction.value = 'export'
    resetProgress()
    isBusy.value = true
    try {
      const saved = await workspaceTransferCommands.exportWorkspaceArchive(
        { workspacePath, defaultFileName, password },
        onProgress,
      )
      if (saved) {
        showToast({
          variant: 'success',
          title: t('workspaceTransfer.toast.exportSuccessTitle'),
          message: t('workspaceTransfer.toast.exportSuccess'),
        })
      } else {
        showToast({ variant: 'info', message: t('workspaceTransfer.toast.exportCancelled') })
      }
    } catch (error) {
      lastError.value = String(error)
      showToast({
        variant: 'error',
        title: t('workspaceTransfer.toast.exportErrorTitle'),
        message: String(error),
        duration: 8000,
      })
    } finally {
      isBusy.value = false
    }
  }

  /** Imports a `.nevoz`/`.zip` archive as a brand-new workspace and opens it.
   * Retries the whole command (which re-opens the archive picker — the only
   * flow the Phase-1 backend exposes) when the archive turns out to be
   * password-protected or the supplied password was wrong. Returns `true`
   * once the new workspace was opened, `false` on cancel/error. */
  async function importAsNewWorkspace(options?: { password?: string }): Promise<boolean> {
    let password = normalizePassword(options?.password)
    let errorMessage: string | null = null
    activeAction.value = 'importAsNew'

    for (let attempt = 0; attempt < MAX_PASSWORD_ATTEMPTS; attempt++) {
      resetProgress()
      isBusy.value = true
      try {
        const path = await workspaceTransferCommands.importWorkspaceArchiveAsNew(password, onProgress)
        isBusy.value = false
        if (path == null) {
          showToast({ variant: 'info', message: t('workspaceTransfer.toast.importCancelled') })
          return false
        }
        await workspaceStore.openWorkspace(path)
        showToast({
          variant: 'success',
          title: t('workspaceTransfer.toast.importSuccessTitle'),
          message: t('workspaceTransfer.toast.importSuccess'),
        })
        return true
      } catch (error) {
        isBusy.value = false
        const message = String(error)
        const kind = classifyTransferError(message)

        if (kind === 'incorrectPassword' || kind === 'passwordRequired') {
          const next = await promptPassword({
            title: t('workspaceTransfer.passwordPrompt.importTitle'),
            message: t('workspaceTransfer.passwordPrompt.importMessage'),
            label: t('workspaceTransfer.passwordPrompt.importLabel'),
            placeholder: t('workspaceTransfer.passwordPrompt.placeholder'),
            confirmLabel: t('workspaceTransfer.passwordPrompt.confirmImport'),
            required: true,
            errorMessage: kind === 'incorrectPassword' ? t('workspaceTransfer.errors.incorrectPassword') : null,
          })
          if (next == null) {
            showToast({ variant: 'info', message: t('workspaceTransfer.toast.importCancelled') })
            return false
          }
          password = normalizePassword(next)
          continue
        }

        lastError.value = message
        errorMessage = friendlyErrorMessage(kind, message)
        break
      }
    }

    showToast({
      variant: 'error',
      title: t('workspaceTransfer.toast.importErrorTitle'),
      message: errorMessage ?? t('workspaceTransfer.toast.importError'),
      duration: 8000,
    })
    return false
  }

  /** Merges an archive into the currently open local workspace: opens the
   * native archive picker (via the Rust command), extracts + remaps ids +
   * copies content server-side (id remap, asset dedup by hash, V2 database
   * rows), then reloads the workspace so the newly nested "Imported: …"
   * folder shows up. Retries with a re-prompted password the same way
   * `importAsNewWorkspace` does. Returns the `MergeReport` on success, or
   * `null` if the archive picker was cancelled or the user gave up on
   * password retries. */
  async function importMergeIntoCurrent(options?: { password?: string }): Promise<MergeReport | null> {
    if (workspaceStore.backendKind !== 'local' || !workspaceStore.activePath) {
      showToast({ variant: 'error', message: t('workspaceTransfer.errors.localOnly') })
      return null
    }
    const workspacePath = workspaceStore.activePath

    let password = normalizePassword(options?.password)
    let errorMessage: string | null = null
    activeAction.value = 'merge'

    for (let attempt = 0; attempt < MAX_PASSWORD_ATTEMPTS; attempt++) {
      resetProgress()
      isBusy.value = true
      try {
        const report = await workspaceTransferCommands.mergeWorkspaceArchive(
          workspacePath,
          password,
          onProgress,
        )
        isBusy.value = false
        if (report == null) {
          showToast({ variant: 'info', message: t('workspaceTransfer.toast.importCancelled') })
          return null
        }
        await workspaceStore.openWorkspace(workspacePath)
        showToast({
          variant: 'success',
          title: t('workspaceTransfer.toast.mergeSuccessTitle'),
          message: `${t('workspaceTransfer.toast.mergeSuccess', {
            notes: report.importedNotes,
            folders: report.importedFolders,
          })} ${t('workspaceTransfer.toast.mergeSuccessCaveat')}`,
          duration: 8000,
        })
        return report
      } catch (error) {
        isBusy.value = false
        const message = String(error)
        const kind = classifyTransferError(message)

        if (kind === 'incorrectPassword' || kind === 'passwordRequired') {
          const next = await promptPassword({
            title: t('workspaceTransfer.passwordPrompt.importTitle'),
            message: t('workspaceTransfer.passwordPrompt.importMessage'),
            label: t('workspaceTransfer.passwordPrompt.importLabel'),
            placeholder: t('workspaceTransfer.passwordPrompt.placeholder'),
            confirmLabel: t('workspaceTransfer.passwordPrompt.confirmImport'),
            required: true,
            errorMessage: kind === 'incorrectPassword' ? t('workspaceTransfer.errors.incorrectPassword') : null,
          })
          if (next == null) {
            showToast({ variant: 'info', message: t('workspaceTransfer.toast.importCancelled') })
            return null
          }
          password = normalizePassword(next)
          continue
        }

        lastError.value = message
        errorMessage = friendlyErrorMessage(kind, message)
        break
      }
    }

    showToast({
      variant: 'error',
      title: t('workspaceTransfer.toast.mergeErrorTitle'),
      message: errorMessage ?? t('workspaceTransfer.toast.mergeError'),
      duration: 8000,
    })
    return null
  }

  return {
    isBusy,
    stage,
    progress,
    lastError,
    activeAction,
    exportWorkspace,
    importAsNewWorkspace,
    importMergeIntoCurrent,
  }
}
