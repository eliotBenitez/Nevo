import { invoke, Channel } from '@tauri-apps/api/core'
import type { ExtractedArchive, MergeReport, TransferProgress } from '../types/workspace-transfer'
import { appLogger } from '../utils/logger'

async function invokeCommand<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(command, args)
  } catch (error) {
    await appLogger.error({
      source: 'frontend.invoke',
      event: command,
      message: 'Tauri command failed',
      error,
    })
    throw error
  }
}

function progressChannel(onProgress: (event: TransferProgress) => void): Channel<TransferProgress> {
  const channel = new Channel<TransferProgress>()
  channel.onmessage = onProgress
  return channel
}

export interface ExportWorkspaceArchiveArgs {
  workspacePath: string
  defaultFileName: string
  password: string | null
}

export const workspaceTransferCommands = {
  /** Returns `false` if the user cancelled the save dialog. */
  exportWorkspaceArchive: (
    args: ExportWorkspaceArchiveArgs,
    onProgress: (event: TransferProgress) => void,
  ): Promise<boolean> =>
    invokeCommand<boolean>('export_workspace_archive', {
      workspacePath: args.workspacePath,
      defaultFileName: args.defaultFileName,
      password: args.password,
      onEvent: progressChannel(onProgress),
    }),

  /** Returns the new workspace path, or `null` if any dialog was cancelled. */
  importWorkspaceArchiveAsNew: (
    password: string | null,
    onProgress: (event: TransferProgress) => void,
  ): Promise<string | null> =>
    invokeCommand<string | null>('import_workspace_archive_as_new', {
      password,
      onEvent: progressChannel(onProgress),
    }),

  /** Extracts an archive to a temp directory for a later merge. Used only by
   * the merge flow (not yet implemented on the frontend). */
  extractWorkspaceArchiveToTemp: (
    password: string | null,
    onProgress: (event: TransferProgress) => void,
  ): Promise<ExtractedArchive | null> =>
    invokeCommand<ExtractedArchive | null>('extract_workspace_archive_to_temp', {
      password,
      onEvent: progressChannel(onProgress),
    }),

  releaseWorkspaceArchiveTemp: (tempDir: string): Promise<void> =>
    invokeCommand<void>('release_workspace_archive_temp', { tempDir }),

  /** Opens the archive picker, extracts it, and merges it into the local
   * workspace at `currentWorkspacePath` (new "Imported: <name>" root
   * folder, ids remapped). Returns `null` if the archive picker was
   * cancelled. */
  mergeWorkspaceArchive: (
    currentWorkspacePath: string,
    password: string | null,
    onProgress: (event: TransferProgress) => void,
  ): Promise<MergeReport | null> =>
    invokeCommand<MergeReport | null>('merge_workspace_archive', {
      currentWorkspacePath,
      password,
      onEvent: progressChannel(onProgress),
    }),
}
