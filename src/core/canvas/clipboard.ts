import type { CanvasConnector, CanvasElement } from './types'

export const CANVAS_CLIPBOARD_MIME = 'application/x-nevo-canvas+json'

export interface CanvasClipboardPayload {
  version: 1
  elements: CanvasElement[]
  connectors: CanvasConnector[]
}

export function serializeCanvasClipboard(payload: CanvasClipboardPayload): string {
  return JSON.stringify(payload)
}

export function parseCanvasClipboard(value: string): CanvasClipboardPayload | null {
  try {
    const parsed = JSON.parse(value) as Partial<CanvasClipboardPayload>
    if (parsed.version !== 1 || !Array.isArray(parsed.elements) || !Array.isArray(parsed.connectors)) return null
    return parsed as CanvasClipboardPayload
  } catch {
    return null
  }
}
