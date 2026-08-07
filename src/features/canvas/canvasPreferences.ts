import type { CanvasCamera } from '../../core/canvas'

export type NoteViewMode = 'document' | 'canvas'

function storageKey(workspaceId: string, noteId: string, suffix: 'view' | 'camera'): string {
  return `nevo.canvas.${workspaceId}.${noteId}.${suffix}`
}

export function readRememberedNoteView(workspaceId: string, noteId: string): NoteViewMode {
  if (typeof localStorage === 'undefined') return 'document'
  return localStorage.getItem(storageKey(workspaceId, noteId, 'view')) === 'canvas' ? 'canvas' : 'document'
}

export function rememberNoteView(workspaceId: string, noteId: string, mode: NoteViewMode): void {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(storageKey(workspaceId, noteId, 'view'), mode)
}

export function readCanvasCamera(workspaceId: string, noteId: string): CanvasCamera {
  const fallback = { x: -80, y: -80, zoom: 1 }
  if (typeof localStorage === 'undefined') return fallback
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey(workspaceId, noteId, 'camera')) ?? '')
    const x = Number(parsed?.x)
    const y = Number(parsed?.y)
    const zoom = Number(parsed?.zoom)
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(zoom)) return fallback
    return {
      x: Math.max(-1_000_000, Math.min(1_000_000, x)),
      y: Math.max(-1_000_000, Math.min(1_000_000, y)),
      zoom: Math.max(0.1, Math.min(4, zoom)),
    }
  } catch {
    return fallback
  }
}

export function rememberCanvasCamera(workspaceId: string, noteId: string, camera: CanvasCamera): void {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(storageKey(workspaceId, noteId, 'camera'), JSON.stringify(camera))
}
