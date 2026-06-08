import { appLogger } from '../../../utils/logger'
import { useWorkspaceStore } from '../../../stores/workspace'
import type { EditorCore } from './useEditorCore'

const FILE_MIME_MAP: Record<string, string> = {
  pdf: 'application/pdf', zip: 'application/zip', json: 'application/json', csv: 'text/csv',
  txt: 'text/plain', md: 'text/markdown', doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
}

export function useFileUpload(
  core: EditorCore,
  getWorkspacePath: () => string | null,
  onOverlaysUpdate: () => void,
) {
  const workspaceStore = useWorkspaceStore()

  function requestFilePicker(targetPos: number | null = null) {
    core.pendingFileTargetPos = targetPos
  }

  function updateFileNodeAtPosition(position: number, attrs: Record<string, unknown>) {
    if (!core.editorView) return
    const targetNode = core.editorView.state.doc.nodeAt(position)
    if (!targetNode || targetNode.type.name !== 'file_block') return
    core.editorView.dispatch(
      core.editorView.state.tr.setNodeMarkup(position, undefined, { ...targetNode.attrs, ...attrs }).scrollIntoView(),
    )
  }

  function applyImportedFile(
    src: string, fileName: string, mime: string, size: number, targetPos: number | null,
  ) {
    if (!core.editorView) return
    const nextAttrs = { src, filename: fileName, mime, size }

    if (typeof targetPos === 'number') {
      updateFileNodeAtPosition(targetPos, nextAttrs)
      onOverlaysUpdate()
      return
    }

    const fileBlockType = core.editorView.state.schema.nodes.file_block
    if (!fileBlockType) return
    const fileNode = fileBlockType.create(nextAttrs)
    core.editorView.dispatch(core.editorView.state.tr.replaceSelectionWith(fileNode, false).scrollIntoView())
    onOverlaysUpdate()
  }

  // Bytes-over-IPC import — kept for cloud backends. The path-based picker below
  // avoids the main-thread freeze on local.
  async function importAndApplyFile(file: File, targetPos: number | null) {
    if (!core.editorView) return
    const backend = workspaceStore.backend
    if (!backend) return

    const bytes = Array.from(new Uint8Array(await file.arrayBuffer()))
    const imported = await backend.importImageAsset(file.name, bytes)
    applyImportedFile(imported.src, file.name, file.type || 'application/octet-stream', file.size, targetPos)
  }

  // Local-backend picker: native dialog → filesystem path → Rust reads the file
  // off-thread (importAssetByPath), so large files never freeze the UI.
  async function pickAndInsertFile(targetPos: number | null = null) {
    const workspacePath = getWorkspacePath()
    const backend = workspaceStore.backend
    if (!workspacePath || !backend) return

    let selectedPath: string
    try {
      const { open: openDialog } = await import('@tauri-apps/plugin-dialog')
      const result = await openDialog({ multiple: false })
      if (!result || typeof result !== 'string') return
      selectedPath = result
    } catch {
      return
    }

    const fileName = selectedPath.split(/[\\/]/).pop() ?? 'file'
    try {
      const imported = await backend.importAssetByPath(selectedPath, fileName)
      const ext = fileName.split('.').pop()?.toLowerCase() ?? ''
      const mime = FILE_MIME_MAP[ext] ?? 'application/octet-stream'
      applyImportedFile(imported.src, fileName, mime, imported.bytes, targetPos)
    } catch (error) {
      await appLogger.error({
        source: 'frontend.editor',
        event: 'import_file',
        message: 'Failed to import file into note',
        workspacePath,
        error,
        payload: { fileName },
      })
    }
  }

  async function onFileInputChange(event: Event) {
    const input = event.target as HTMLInputElement
    const file = input.files?.[0]
    if (!file) return
    try {
      await importAndApplyFile(file, core.pendingFileTargetPos)
    } catch (error) {
      await appLogger.error({
        source: 'frontend.editor',
        event: 'import_file',
        message: 'Failed to import file into note',
        workspacePath: getWorkspacePath(),
        error,
        payload: { fileName: file.name },
      })
    } finally {
      core.pendingFileTargetPos = null
      input.value = ''
    }
  }

  return { requestFilePicker, pickAndInsertFile, onFileInputChange }
}
