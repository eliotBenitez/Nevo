import { beforeEach, describe, expect, it } from 'vitest'
import {
  readCanvasCamera,
  readRememberedNoteView,
  rememberCanvasCamera,
  rememberNoteView,
} from './canvasPreferences'

describe('canvas local preferences', () => {
  beforeEach(() => localStorage.clear())

  it('remembers view and camera per workspace and note', () => {
    rememberNoteView('workspace-a', 'note-a', 'canvas')
    rememberCanvasCamera('workspace-a', 'note-a', { x: 12, y: 34, zoom: 1.5 })

    expect(readRememberedNoteView('workspace-a', 'note-a')).toBe('canvas')
    expect(readCanvasCamera('workspace-a', 'note-a')).toEqual({ x: 12, y: 34, zoom: 1.5 })
    expect(readRememberedNoteView('workspace-a', 'note-b')).toBe('document')
  })

  it('normalizes corrupt camera values', () => {
    localStorage.setItem('nevo.canvas.workspace-a.note-a.camera', '{"x":"nan","zoom":99}')
    expect(readCanvasCamera('workspace-a', 'note-a')).toEqual({ x: -80, y: -80, zoom: 1 })
  })
})
