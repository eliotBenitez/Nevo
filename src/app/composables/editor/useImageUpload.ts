import { Selection } from 'prosemirror-state'
import { appLogger } from '../../../utils/logger'
import { useWorkspaceStore } from '../../../stores/workspace'
import type { EditorCore } from './useEditorCore'

export function useImageUpload(
  core: EditorCore,
  getWorkspacePath: () => string | null,
  onOverlaysUpdate: () => void,
) {
  const workspaceStore = useWorkspaceStore()

  function requestImagePicker(targetPos: number | null = null) {
    core.pendingImageTargetPos = targetPos
  }

  function updateImageNodeAtPosition(position: number, attrs: Record<string, unknown>) {
    if (!core.editorView) return
    const targetNode = core.editorView.state.doc.nodeAt(position)
    if (!targetNode || targetNode.type.name !== 'image_block') return
    core.editorView.dispatch(
      core.editorView.state.tr.setNodeMarkup(position, undefined, { ...targetNode.attrs, ...attrs }).scrollIntoView(),
    )
  }

  function applyImportedImage(src: string, fileName: string, targetPos: number | null) {
    if (!core.editorView) return
    const nextAttrs = { src, alt: fileName, caption: '', sizePreset: 'medium', width: null }

    if (typeof targetPos === 'number') {
      updateImageNodeAtPosition(targetPos, nextAttrs)
      onOverlaysUpdate()
      return
    }

    const imageBlockType = core.editorView.state.schema.nodes.image_block
    if (!imageBlockType) return
    const imageNode = imageBlockType.create(nextAttrs)
    core.editorView.dispatch(core.editorView.state.tr.replaceSelectionWith(imageNode, false).scrollIntoView())
    onOverlaysUpdate()
  }

  // Bytes-over-IPC import — kept for drag-and-drop (only a File, no path) and cloud
  // backends. The path-based picker below avoids the main-thread freeze on local.
  async function importAndApplyImage(file: File, targetPos: number | null) {
    if (!core.editorView) return
    const backend = workspaceStore.backend
    if (!backend) return

    const bytes = Array.from(new Uint8Array(await file.arrayBuffer()))
    const imported = await backend.importImageAsset(file.name, bytes)
    applyImportedImage(imported.src, file.name, targetPos)
  }

  // Local-backend picker: native dialog → filesystem path → Rust reads the file
  // off-thread (importAssetByPath), so large images never freeze the UI.
  async function pickAndInsertImage(targetPos: number | null = null) {
    const workspacePath = getWorkspacePath()
    const backend = workspaceStore.backend
    if (!workspacePath || !backend) return

    let selectedPath: string
    try {
      const { open: openDialog } = await import('@tauri-apps/plugin-dialog')
      const result = await openDialog({
        multiple: false,
        filters: [{ name: 'Image', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'avif', 'bmp'] }],
      })
      if (!result || typeof result !== 'string') return
      selectedPath = result
    } catch {
      return
    }

    const fileName = selectedPath.split(/[\\/]/).pop() ?? 'image'
    try {
      const imported = await backend.importAssetByPath(selectedPath, fileName)
      applyImportedImage(imported.src, fileName, targetPos)
    } catch (error) {
      await appLogger.error({
        source: 'frontend.editor',
        event: 'import_image',
        message: 'Failed to import image into note',
        workspacePath,
        error,
        payload: { fileName },
      })
    }
  }

  async function onImageInputChange(event: Event) {
    const input = event.target as HTMLInputElement
    const file = input.files?.[0]
    if (!file) return
    try {
      await importAndApplyImage(file, core.pendingImageTargetPos)
    } catch (error) {
      await appLogger.error({
        source: 'frontend.editor',
        event: 'import_image',
        message: 'Failed to import image into note',
        workspacePath: getWorkspacePath(),
        error,
        payload: { fileName: file.name },
      })
    } finally {
      core.pendingImageTargetPos = null
      input.value = ''
    }
  }

  function readDroppedImage(event: DragEvent): File | null {
    const files = event.dataTransfer?.files
    if (!files || files.length === 0) return null
    for (let i = 0; i < files.length; i++) {
      const file = files.item(i)
      if (file && file.type.startsWith('image/')) return file
    }
    return null
  }

  function onEditorDragOver(event: DragEvent) {
    const file = readDroppedImage(event)
    if (!file) return
    event.preventDefault()
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'
  }

  async function onEditorDrop(event: DragEvent) {
    const file = readDroppedImage(event)
    if (!file || !core.editorView) return
    event.preventDefault()
    const coords = { left: event.clientX, top: event.clientY }
    const dropPos = core.editorView.posAtCoords(coords)
    if (dropPos) {
      const resolved = core.editorView.state.doc.resolve(dropPos.pos)
      core.editorView.dispatch(core.editorView.state.tr.setSelection(Selection.near(resolved)))
    }
    await importAndApplyImage(file, null)
    core.editorView.focus()
  }

  return { requestImagePicker, pickAndInsertImage, onImageInputChange, onEditorDragOver, onEditorDrop }
}
