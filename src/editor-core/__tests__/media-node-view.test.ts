import { afterEach, describe, expect, it, vi } from 'vitest'
import { EditorView } from 'prosemirror-view'
import { createNevoEditorState } from '../state'
import { nevoBaseSchema } from '../schema'
import type { BlockNode } from '../../types/note'

function createMediaEditor(attrs: Record<string, unknown>, resolveMediaSrc: (src: string) => string | null) {
  const setup = createNevoEditorState({
    schema: nevoBaseSchema,
    content: { type: 'doc', content: [{ type: 'media_block', attrs }] } as BlockNode,
    nodeViewOptions: { resolveMediaSrc },
  })
  const mount = document.createElement('div')
  document.body.appendChild(mount)
  const view = new EditorView(mount, {
    state: setup.state,
    nodeViews: setup.nodeViews,
    dispatchTransaction(transaction) {
      view.updateState(view.state.apply(transaction))
    },
  })
  return {
    mount,
    view,
    destroy() { view.destroy(); mount.remove() },
  }
}

async function tick() {
  await new Promise((resolve) => setTimeout(resolve, 0))
}

describe('media node view source lifecycle', () => {
  afterEach(() => vi.restoreAllMocks())

  it('resolves and loads an existing audio source during real editor construction', async () => {
    const mediaUrl = 'http://127.0.0.1:1/audio-ready'
    const resolveMediaSrc = vi.fn(() => mediaUrl)
    const editor = createMediaEditor({ kind: 'audio', src: 'audio-ready', name: '', size: 0 }, resolveMediaSrc)
    const audio = editor.mount.querySelector<HTMLAudioElement>('audio')!

    try {
      await tick()
      expect(resolveMediaSrc).toHaveBeenCalledWith('audio-ready')
      expect(audio.getAttribute('src')).toBe(mediaUrl)
    } finally {
      editor.destroy()
    }
  })

  it('does not resolve or load an empty video source', async () => {
    const resolveMediaSrc = vi.fn((src: string) => `http://127.0.0.1:1/media?path=${src}`)
    const editor = createMediaEditor({ kind: 'video', src: '', name: '', size: 0 }, resolveMediaSrc)
    const video = editor.mount.querySelector<HTMLVideoElement>('video')!
    const load = vi.spyOn(video, 'load').mockImplementation(() => {})

    try {
      await tick()
      expect(resolveMediaSrc).not.toHaveBeenCalled()
      expect(video.hasAttribute('src')).toBe(false)
      expect(load).not.toHaveBeenCalled()
    } finally {
      editor.destroy()
    }
  })

  it('defaults to the player layout and switches to bookmarks through the block header', async () => {
    const editor = createMediaEditor(
      { kind: 'audio', src: 'audio-ready', name: 'Track', size: 0 },
      () => 'http://127.0.0.1:1/audio-ready',
    )
    const layout = editor.mount.querySelector<HTMLElement>('.nv-audio-layout')!
    const mode = editor.mount.querySelector<HTMLElement>('.nv-audio-mode')!
    const [playerBtn, bookmarksBtn] = [...mode.querySelectorAll<HTMLButtonElement>('button')]

    try {
      await tick()
      // No bookmarks yet, so `auto` resolves to the plain player.
      expect(layout.dataset.layout).toBe('player')
      expect(editor.mount.querySelector('.nv-audio-bookmarks')?.hasAttribute('hidden')).toBe(true)
      expect(playerBtn.getAttribute('aria-pressed')).toBe('true')

      bookmarksBtn.click()
      await tick()
      const node = editor.view.state.doc.nodeAt(0)!
      expect(node.attrs.audioLayout).toBe('bookmarks')
      expect(layout.dataset.layout).toBe('bookmarks')
      expect(editor.mount.querySelector('.nv-audio-bookmarks')?.hasAttribute('hidden')).toBe(false)
      expect(bookmarksBtn.getAttribute('aria-pressed')).toBe('true')

      playerBtn.click()
      await tick()
      expect(editor.view.state.doc.nodeAt(0)!.attrs.audioLayout).toBe('player')
      expect(layout.dataset.layout).toBe('player')
    } finally {
      editor.destroy()
    }
  })

  it('shows the stored layout without the switch when the editor is read-only', async () => {
    const editor = createMediaEditor(
      { kind: 'audio', src: 'audio-ready', name: 'Track', size: 0, audioLayout: 'bookmarks', bookmarks: [] },
      () => 'http://127.0.0.1:1/audio-ready',
    )
    const mode = editor.mount.querySelector<HTMLElement>('.nv-audio-mode')!

    try {
      await tick()
      // An explicit `bookmarks` choice stays visible even without records.
      expect(editor.mount.querySelector<HTMLElement>('.nv-audio-layout')!.dataset.layout).toBe('bookmarks')

      editor.view.setProps({ editable: () => false })
      // Node views re-read `view.editable` on the next update, not on setProps.
      const node = editor.view.state.doc.nodeAt(0)!
      editor.view.dispatch(editor.view.state.tr.setNodeMarkup(0, undefined, { ...node.attrs, name: 'Locked' }))
      await tick()
      expect(mode.classList.contains('is-readonly')).toBe(true)
      expect(mode.hidden).toBe(false)
      expect([...editor.mount.querySelectorAll<HTMLButtonElement>('.nv-audio-mode-btn')].map(b => b.getAttribute('aria-pressed'))).toEqual(['false', 'true'])
    } finally {
      editor.destroy()
    }
  })

  it('hides the layout switch when there is no audio source', async () => {
    const editor = createMediaEditor(
      { kind: 'audio', src: '', name: '', size: 0 },
      () => 'http://127.0.0.1:1/audio-ready',
    )

    try {
      await tick()
      expect(editor.mount.querySelector<HTMLElement>('.nv-audio-mode')!.hidden).toBe(true)
    } finally {
      editor.destroy()
    }
  })

  it('cancels a pending video resolver when the node changes to audio', async () => {
    const resolveMediaSrc = vi.fn((src: string) => src === 'video-pending' ? null : `http://127.0.0.1:1/media?path=${src}`)
    const editor = createMediaEditor({ kind: 'video', src: 'video-pending', name: '', size: 0 }, resolveMediaSrc)
    const video = editor.mount.querySelector<HTMLVideoElement>('video')!
    const load = vi.spyOn(video, 'load').mockImplementation(() => {})

    try {
      await tick()
      expect(resolveMediaSrc.mock.calls.filter(([src]) => src === 'video-pending')).toHaveLength(1)
      editor.view.dispatch(editor.view.state.tr.setNodeMarkup(0, undefined, {
        ...editor.view.state.doc.nodeAt(0)!.attrs,
        kind: 'audio',
        src: 'audio-ready',
      }))
      await tick()
      const loadCount = load.mock.calls.length
      await new Promise((resolve) => setTimeout(resolve, 200))

      expect(resolveMediaSrc.mock.calls.filter(([src]) => src === 'video-pending')).toHaveLength(1)
      expect(load).toHaveBeenCalledTimes(loadCount)
      expect(video.hasAttribute('src')).toBe(false)
    } finally {
      editor.destroy()
    }
  })
})
