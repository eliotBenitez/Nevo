import { Selection } from 'prosemirror-state'
import { appLogger } from '../../../utils/logger'
import { useWorkspaceStore } from '../../../stores/workspace'
import type { EditorCore } from './useEditorCore'
import { noteCommands } from '../../../tauri/commands'

const IMAGE_EXTENSION = /\.(png|jpe?g|gif|webp|svg|avif|bmp)$/i

// WebKitGTK often exposes file-manager copies as a File with an empty MIME type,
// so fall back to the filename extension when the type is missing.
function isImageFile(file: File): boolean {
  return file.type.startsWith('image/') || IMAGE_EXTENSION.test(file.name)
}

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

    const { state } = core.editorView
    const imageBlockType = state.schema.nodes.image_block
    if (!imageBlockType) return
    const imageNode = imageBlockType.create(nextAttrs)

    // When the cursor sits in an empty textblock (e.g. a freshly created
    // paragraph), replace that paragraph in place so the block type flips to
    // image_block instead of leaving an empty paragraph behind the new node.
    // Mirrors createInsertBlockCommand in editor-core/commands/utils.ts.
    const { selection } = state
    let tr
    if (selection.empty && selection.$from.parent.isTextblock && selection.$from.parent.content.size === 0) {
      const from = selection.$from.before()
      const to = from + selection.$from.parent.nodeSize
      tr = state.tr.replaceWith(from, to, imageNode)
    } else {
      tr = state.tr.replaceSelectionWith(imageNode, false)
    }
    core.editorView.dispatch(tr.scrollIntoView())
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

  function isLocalBackend(): boolean {
    return workspaceStore.backend?.handle.kind === 'local'
  }

  function fileNameFromUrl(url: string): string {
    return (url.split(/[?#]/)[0] ?? url).split('/').pop() || 'image'
  }

  async function importUrlAndApplyImage(url: string, targetPos: number | null) {
    const backend = workspaceStore.backend
    if (!backend || !core.editorView) return
    // Data URLs are self-contained — the CSP allows them as image sources, so
    // use them directly instead of round-tripping through the downloader.
    if (/^data:/i.test(url)) {
      applyImportedImage(url, 'pasted-image', targetPos)
      return
    }
    try {
      const imported = await backend.importImageFromUrl(url)
      applyImportedImage(imported.src, fileNameFromUrl(url), targetPos)
    } catch (error) {
      await appLogger.error({
        source: 'frontend.editor',
        event: 'import_image',
        message: 'Failed to download pasted image URL',
        workspacePath: getWorkspacePath(),
        error,
        payload: { url },
      })
      // Not an image / download failed — keep the URL as text so the paste is
      // not silently lost (avoids a broken image block for non-image links).
      insertPlainText(url)
    }
  }

  // Rust owns both the native picker and the selected path, so the WebView
  // never receives a filesystem capability or an arbitrary readable path.
  async function pickAndInsertImage(targetPos: number | null = null) {
    const workspacePath = getWorkspacePath()
    if (!workspacePath || !isLocalBackend()) return
    try {
      const imported = await noteCommands.pickAndImportAsset(workspacePath, 'image')
      if (!imported) return
      applyImportedImage(imported.src, imported.fileName, targetPos)
    } catch (error) {
      await appLogger.error({
        source: 'frontend.editor',
        event: 'import_image',
        message: 'Failed to import image into note',
        workspacePath,
        error,
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
      if (file && isImageFile(file)) return file
    }
    return null
  }

  // Paste from clipboard: turns pasted image files into image_block nodes
  // instead of letting ProseMirror render them as an empty paragraph. Reads
  // both `files` and `items` because WebKitGTK only exposes browser-copied
  // images (e.g. right-click → "Copy Image") through the item list.
  function readPastedImages(event: ClipboardEvent): File[] {
    const data = event.clipboardData
    if (!data) return []
    const images: File[] = []
    const seen = new Set<string>()
    const push = (file: File | null) => {
      if (!file || !isImageFile(file)) return
      const key = `${file.name}:${file.size}:${file.type}`
      if (seen.has(key)) return
      seen.add(key)
      images.push(file)
    }
    const files = data.files
    if (files) for (let i = 0; i < files.length; i++) push(files.item(i))
    const items = data.items
    if (items) {
      for (let i = 0; i < items.length; i++) {
        const item = items[i]
        if (item && item.kind === 'file') push(item.getAsFile())
      }
    }
    return images
  }

  function insertPlainText(text: string) {
    const view = core.editorView
    if (!view || !text) return
    view.dispatch(view.state.tr.insertText(text).scrollIntoView())
    view.focus()
  }

  // A pasted image reference (local file or web image) resolves to either a
  // `file://` path / absolute path, or an http(s) URL. Turn the first usable one
  // into an image_block; the empty paragraph under the caret is replaced in
  // place by applyImportedImage.
  function processUriList(text: string): boolean {
    for (const raw of text.split(/\r?\n/)) {
      const value = raw.trim()
      if (!value || value.startsWith('#')) continue

      if (/^https?:\/\//i.test(value)) {
        void (async () => {
          await importUrlAndApplyImage(value, null)
          core.editorView?.focus()
        })()
        return true
      }
    }
    return false
  }

  // Encode raw RGBA (from the clipboard-manager image) as PNG bytes via a canvas.
  function rgbaToPngBytes(rgba: Uint8Array | number[], width: number, height: number): number[] {
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('2D canvas context unavailable')
    ctx.putImageData(new ImageData(new Uint8ClampedArray(rgba), width, height), 0, 0)
    const base64 = canvas.toDataURL('image/png').split(',')[1] ?? ''
    const bin = atob(base64)
    const bytes = new Array<number>(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    return bytes
  }

  // WebKitGTK withholds `text/uri-list` (file paths and image URLs) from the
  // webview clipboard — getData and getAsString both return '' — so read the OS
  // clipboard natively: a bitmap (browser "Copy Image") via readImage, otherwise
  // the file path / URL via readText.
  async function handleNativeClipboardImage() {
    const backend = workspaceStore.backend
    if (!backend || !core.editorView) return

    try {
      const { readImage } = await import('@tauri-apps/plugin-clipboard-manager')
      const image = await readImage()
      const rgba = await image.rgba()
      const { width, height } = await image.size()
      if (width && height) {
        const bytes = rgbaToPngBytes(rgba, width, height)
        const imported = await backend.importImageAsset('pasted-image.png', bytes)
        applyImportedImage(imported.src, 'pasted-image.png', null)
        core.editorView?.focus()
        return
      }
    } catch {
      // No bitmap on the clipboard — fall through to the text/path branch.
    }

    const workspacePath = getWorkspacePath()
    if (workspacePath && isLocalBackend()) {
      try {
        const imported = await noteCommands.importClipboardImagePath(workspacePath)
        if (imported) {
          applyImportedImage(imported.src, imported.fileName, null)
          core.editorView?.focus()
          return
        }
      } catch {
        // Clipboard text may be a regular URL or text; handle it below.
      }
    }

    try {
      const { readText } = await import('@tauri-apps/plugin-clipboard-manager')
      const text = (await readText())?.trim()
      if (text) processUriList(text)
    } catch (error) {
      await appLogger.warn({
        source: 'frontend.editor',
        event: 'import_image',
        message: 'Native clipboard read failed on paste',
        workspacePath: getWorkspacePath(),
        error,
      })
    }
  }

  function hasUriListItem(data: DataTransfer): boolean {
    const items = data.items
    if (!items) return false
    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      if (item && item.kind === 'string' && item.type === 'text/uri-list') return true
    }
    return false
  }

  // An image copied from a web page arrives as `text/html` that is essentially a
  // lone `<img>`. Return its http(s)/data src so we can import it instead of
  // letting the default paste render the raw remote URL (which 404s in the
  // webview for auth/signed URLs like GitHub attachments).
  function extractPastedImageUrl(html: string): string | null {
    try {
      const doc = new DOMParser().parseFromString(html, 'text/html')
      const imgs = doc.querySelectorAll('img')
      if (imgs.length !== 1) return null
      if ((doc.body.textContent || '').trim().length > 0) return null
      const src = imgs[0].getAttribute('src') || ''
      return /^(https?|data):/i.test(src) ? src : null
    } catch {
      return null
    }
  }

  function onEditorPaste(event: ClipboardEvent): boolean {
    const data = event.clipboardData
    if (!data || !core.editorView) return false

    // Direct image blobs in the webview clipboard (rare on WebKitGTK, common on
    // other platforms) — handle them without touching the OS clipboard.
    const images = readPastedImages(event)
    if (images.length > 0) {
      event.preventDefault()
      void (async () => {
        for (const file of images) {
          await importAndApplyImage(file, null)
        }
        core.editorView?.focus()
      })()
      return true
    }

    // Image copied from a web page: readable `text/html` that is just an <img>.
    const html = data.getData('text/html')
    if (html) {
      const imageUrl = extractPastedImageUrl(html)
      if (imageUrl) {
        event.preventDefault()
        void (async () => {
          await importUrlAndApplyImage(imageUrl, null)
          core.editorView?.focus()
        })()
        return true
      }
    }

    // A file/image paste shows up as a `text/uri-list` entry whose content the
    // webview can't read (exposed either in `types` or as an unreadable string
    // item), and carries no readable text. In that case, read the OS clipboard
    // natively. Normal text/HTML pastes fall through to the default handler.
    const types = data.types ? Array.from(data.types) : []
    const hasUriListSignal = types.includes('text/uri-list') || hasUriListItem(data)
    const hasReadableText = !!data.getData('text/plain') || !!html
    if (hasUriListSignal && !hasReadableText) {
      event.preventDefault()
      void handleNativeClipboardImage()
      return true
    }

    return false
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

  return { requestImagePicker, pickAndInsertImage, onImageInputChange, onEditorDragOver, onEditorDrop, onEditorPaste }
}
