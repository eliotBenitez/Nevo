import { isTauri } from '@tauri-apps/api/core'

/** Saves via the native save dialog in Tauri; falls back to an `<a download>` click. */
export async function downloadBlob(blob: Blob, filename: string): Promise<void> {
  if (isTauri()) {
    try {
      const bytes = new Uint8Array(await blob.arrayBuffer())
      const { noteCommands } = await import('../tauri/commands')
      await noteCommands.exportDrawFile(filename, bytes)
      return
    } catch (error) {
      console.error('[downloadBlob] Native save failed, falling back to browser download', error)
    }
  }

  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}
